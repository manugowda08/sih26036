import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApplicationStatus } from "@prisma/client";
import { createApplicationSchema, updateApplicationStatusSchema } from "@lm-smart/validation";
import { loadEnv } from "@lm-smart/config";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { nextApplicationNumber } from "../lib/codes.js";
import { applicationInclude } from "../lib/includes.js";
import { presentApplication } from "../lib/present.js";
import { requireRoles } from "../plugins/rbac.js";

const OPEN_STATUSES: ApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "SCHEDULED",
  "ASSIGNED",
  "INSPECTION_IN_PROGRESS",
];

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function applicationRoutes(app: FastifyInstance) {
  const env = loadEnv();

  app.get("/api/applications", { preHandler: requireRoles(app, ["OWNER", "ADMIN", "LMO", "GATC"]) }, async (request) => {
    const roles = request.user.roles;
    const where = roles.includes("ADMIN")
      ? undefined
      : roles.includes("OWNER")
        ? { ownerId: request.user.sub }
        : { schedule: { assignedOfficerId: request.user.sub } };
    const applications = await prisma.application.findMany({
      where,
      include: applicationInclude,
      orderBy: { createdAt: "desc" },
    });
    return applications.map(presentApplication);
  });

  app.get("/api/applications/:id", { preHandler: requireRoles(app, ["OWNER", "ADMIN", "LMO", "GATC"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const application = await prisma.application.findUnique({
      where: { id },
      include: applicationInclude,
    });
    if (!application) return reply.code(404).send({ error: "Application not found" });
    const roles = request.user.roles;
    const allowed =
      roles.includes("ADMIN") ||
      application.ownerId === request.user.sub ||
      application.schedule?.assignedOfficerId === request.user.sub;
    if (!allowed) return reply.code(403).send({ error: "Forbidden" });
    return presentApplication(application);
  });

  app.post("/api/applications", { preHandler: requireRoles(app, ["OWNER"]) }, async (request, reply) => {
    const parsed = createApplicationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const instrument = await prisma.instrument.findUnique({ where: { id: parsed.data.instrumentId } });
    if (!instrument || instrument.ownerId !== request.user.sub) {
      return reply.code(400).send({ error: "Instrument not found" });
    }

    const open = await prisma.application.findFirst({
      where: { instrumentId: instrument.id, status: { in: OPEN_STATUSES } },
    });
    if (open) {
      return reply.code(409).send({
        error: "This instrument already has an open application",
        applicationId: open.id,
      });
    }

    const application = await prisma.application.create({
      data: {
        applicationNumber: await nextApplicationNumber(),
        kind: parsed.data.kind,
        status: "DRAFT",
        instrumentId: instrument.id,
        businessId: instrument.businessId,
        ownerId: request.user.sub,
        notes: parsed.data.notes || null,
      },
      include: applicationInclude,
    });

    return reply.code(201).send(presentApplication(application));
  });

  app.post("/api/applications/:id/documents", { preHandler: requireRoles(app, ["OWNER"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return reply.code(404).send({ error: "Application not found" });
    if (application.ownerId !== request.user.sub) return reply.code(403).send({ error: "Forbidden" });
    if (application.status !== "DRAFT") {
      return reply.code(400).send({ error: "Documents can only be added to a draft application" });
    }

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "A document file is required" });
    const ext = path.extname(file.filename).toLowerCase();
    const allowedExt = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
    if (!ALLOWED_MIME.has(file.mimetype) && !allowedExt.has(ext)) {
      return reply.code(400).send({ error: "Upload a PDF, JPG, or PNG document" });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.code(400).send({ error: "File must be 5 MB or smaller" });
    }

    const safeName = path.basename(file.filename).replace(/[^\w.\-]+/g, "_");
    const storedName = `${id}-${Date.now()}-${safeName}`;
    const dir = path.join(env.storagePath, "documents");
    await fs.mkdir(dir, { recursive: true });
    const storedPath = path.join(dir, storedName);
    await fs.writeFile(storedPath, buffer);

    const document = await prisma.applicationDocument.create({
      data: {
        applicationId: id,
        filename: file.filename,
        storedPath,
        mimeType: file.mimetype,
        sizeBytes: buffer.length,
      },
    });

    return reply.code(201).send({
      id: document.id,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt,
    });
  });

  app.post("/api/applications/:id/submit", { preHandler: requireRoles(app, ["OWNER"]) }, async (request, reply) => {
    return submitApplication(request, reply);
  });

  app.put("/api/applications/:id/status", { preHandler: requireRoles(app, ["OWNER"]) }, async (request, reply) => {
    const parsed = updateApplicationStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }
    return submitApplication(request, reply);
  });
}

async function submitApplication(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const application = await prisma.application.findUnique({
    where: { id },
    include: { documents: true },
  });
  if (!application) return reply.code(404).send({ error: "Application not found" });
  if (application.ownerId !== request.user.sub) return reply.code(403).send({ error: "Forbidden" });
  if (application.status !== "DRAFT") {
    return reply.code(400).send({ error: "Only draft applications can be submitted" });
  }
  if (application.documents.length === 0) {
    return reply.code(400).send({ error: "Upload at least one supporting document before submitting" });
  }

  const [updated] = await prisma.$transaction([
    prisma.application.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
      include: {
        instrument: { include: { type: true } },
        business: true,
        documents: true,
      },
    }),
    prisma.instrument.update({
      where: { id: application.instrumentId },
      data: { currentStatus: application.kind === "REVERIFICATION" ? "REVERIFICATION" : "SUBMITTED" },
    }),
  ]);

  await writeAudit({
    request,
    userId: request.user.sub,
    action: "SUBMIT_APPLICATION",
    entity: "application",
    entityId: id,
  });

  return presentApplication(updated);
}
