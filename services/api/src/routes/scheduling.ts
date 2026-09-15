import type { FastifyInstance } from "fastify";
import { assignOfficerSchema, createScheduleSchema } from "@lm-smart/validation";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { applicationInclude } from "../lib/includes.js";
import { parseDate, presentApplication } from "../lib/present.js";
import { requireRoles } from "../plugins/rbac.js";

async function setApplicationStatus(applicationId: string, instrumentId: string, status: "UNDER_REVIEW" | "SCHEDULED" | "ASSIGNED") {
  await prisma.$transaction([
    prisma.application.update({ where: { id: applicationId }, data: { status } }),
    prisma.instrument.update({ where: { id: instrumentId }, data: { currentStatus: status } }),
  ]);
}

async function loadApplication(id: string) {
  return prisma.application.findUnique({
    where: { id },
    include: applicationInclude,
  });
}

export async function schedulingRoutes(app: FastifyInstance) {
  app.get("/api/officers", { preHandler: requireRoles(app, ["ADMIN"]) }, async () => {
    const [lmos, gatcs] = await Promise.all([
      prisma.lmOfficer.findMany({
        include: { user: true, location: true },
        orderBy: { employeeCode: "asc" },
      }),
      prisma.gatc.findMany({
        include: { user: true, location: true },
        orderBy: { centreCode: "asc" },
      }),
    ]);

    return [
      ...lmos.map((row) => ({
        userId: row.userId,
        role: "LMO" as const,
        code: row.employeeCode,
        fullName: row.user.fullName,
        email: row.user.email,
        isAvailable: row.isAvailable,
        city: row.location?.city ?? null,
      })),
      ...gatcs.map((row) => ({
        userId: row.userId,
        role: "GATC" as const,
        code: row.centreCode,
        fullName: row.user.fullName,
        email: row.user.email,
        isAvailable: true,
        city: row.location?.city ?? null,
      })),
    ];
  });

  app.get("/api/scheduling", { preHandler: requireRoles(app, ["ADMIN", "LMO", "GATC"]) }, async (request) => {
    const mine = !request.user.roles.includes("ADMIN");
    const rows = await prisma.verificationSchedule.findMany({
      where: mine ? { assignedOfficerId: request.user.sub } : undefined,
      include: {
        assignedOfficer: { select: { id: true, fullName: true, email: true } },
        application: { include: applicationInclude },
      },
      orderBy: { scheduledAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      scheduledAt: row.scheduledAt,
      assignmentReason: row.assignmentReason,
      assignedOfficer: row.assignedOfficer,
      application: presentApplication(row.application),
    }));
  });

  app.post("/api/applications/:id/review", { preHandler: requireRoles(app, ["ADMIN"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return reply.code(404).send({ error: "Application not found" });
    if (application.status !== "SUBMITTED" && application.status !== "UNDER_REVIEW") {
      return reply.code(400).send({ error: "Only submitted applications can be taken up for review" });
    }
    await setApplicationStatus(id, application.instrumentId, "UNDER_REVIEW");
    const updated = await loadApplication(id);
    return presentApplication(updated!);
  });

  app.post("/api/scheduling", { preHandler: requireRoles(app, ["ADMIN"]) }, async (request, reply) => {
    const parsed = createScheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const scheduledAt = parseDate(parsed.data.scheduledAt);
    if (!scheduledAt) return reply.code(400).send({ error: "Invalid scheduled date/time" });

    const application = await prisma.application.findUnique({ where: { id: parsed.data.applicationId } });
    if (!application) return reply.code(404).send({ error: "Application not found" });
    if (!["SUBMITTED", "UNDER_REVIEW", "SCHEDULED", "ASSIGNED"].includes(application.status)) {
      return reply.code(400).send({ error: "This application cannot be scheduled" });
    }

    const officer = await prisma.user.findUnique({
      where: { id: parsed.data.assignedOfficerId },
      include: { userRoles: { include: { role: true } } },
    });
    const officerRoles = officer?.userRoles.map((item) => item.role.code) ?? [];
    if (!officer || !officerRoles.some((role) => role === "LMO" || role === "GATC")) {
      return reply.code(400).send({ error: "Assigned officer must be an LMO or GATC user" });
    }

    if (application.status === "SUBMITTED") {
      await setApplicationStatus(application.id, application.instrumentId, "UNDER_REVIEW");
    }

    await prisma.verificationSchedule.upsert({
      where: { applicationId: application.id },
      update: {
        scheduledAt,
        assignedOfficerId: parsed.data.assignedOfficerId,
        assignmentReason: parsed.data.assignmentReason || "Assigned by administrator",
      },
      create: {
        applicationId: application.id,
        scheduledAt,
        assignedOfficerId: parsed.data.assignedOfficerId,
        assignmentReason: parsed.data.assignmentReason || "Assigned by administrator",
      },
    });

    await setApplicationStatus(application.id, application.instrumentId, "SCHEDULED");
    await setApplicationStatus(application.id, application.instrumentId, "ASSIGNED");

    await writeAudit({
      request,
      userId: request.user.sub,
      action: "ASSIGN_OFFICER",
      entity: "application",
      entityId: application.id,
    });

    const updated = await loadApplication(application.id);
    return reply.code(201).send(presentApplication(updated!));
  });

  app.post("/api/scheduling/assign", { preHandler: requireRoles(app, ["ADMIN"]) }, async (request, reply) => {
    const parsed = assignOfficerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const existing = await prisma.verificationSchedule.findUnique({
      where: { applicationId: parsed.data.applicationId },
      include: { application: true },
    });
    if (!existing) {
      return reply.code(400).send({ error: "Create a schedule with date/time before assigning an officer" });
    }

    await prisma.verificationSchedule.update({
      where: { id: existing.id },
      data: {
        assignedOfficerId: parsed.data.assignedOfficerId,
        assignmentReason: parsed.data.assignmentReason || existing.assignmentReason,
      },
    });
    await setApplicationStatus(existing.applicationId, existing.application.instrumentId, "ASSIGNED");
    await writeAudit({
      request,
      userId: request.user.sub,
      action: "ASSIGN_OFFICER",
      entity: "application",
      entityId: existing.applicationId,
    });
    const updated = await loadApplication(existing.applicationId);
    return presentApplication(updated!);
  });
}
