import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { applicationInclude, inspectionInclude } from "../lib/includes.js";
import { presentApplication, presentInspection, presentInstrument } from "../lib/present.js";
import { expiryBucket } from "../lib/expiry.js";
import { syncExpiryState } from "../lib/notifications.js";
import { requireRoles } from "../plugins/rbac.js";

function presentExpiryRow(row: {
  id: string;
  certificateNumber: string;
  status: string;
  nextDueAt: Date;
  verifiedAt: Date;
  applicationId: string;
  instrumentId: string;
  business: { name: string };
  instrument: { instrumentCode: string; serialNumber: string; type?: { name: string } | null };
}) {
  const bucket = expiryBucket(row.nextDueAt, row.status);
  return {
    id: row.id,
    certificateNumber: row.certificateNumber,
    status: bucket === "EXPIRED" ? "EXPIRED" : row.status,
    expiryBucket: bucket,
    nextDueAt: row.nextDueAt,
    verifiedAt: row.verifiedAt,
    applicationId: row.applicationId,
    instrumentId: row.instrumentId,
    businessName: row.business.name,
    instrumentCode: row.instrument.instrumentCode,
    serialNumber: row.instrument.serialNumber,
    typeName: row.instrument.type?.name ?? null,
  };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/owner", { preHandler: requireRoles(app, ["OWNER"]) }, async (request) => {
    const ownerId = request.user.sub;
    await syncExpiryState();

    const [instruments, applications, certificates, unread] = await Promise.all([
      prisma.instrument.findMany({
        where: { ownerId },
        include: { type: true, business: { include: { location: true } }, location: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.application.findMany({
        where: { ownerId },
        include: applicationInclude,
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.certificate.findMany({
        where: { application: { ownerId } },
        include: {
          business: true,
          instrument: { include: { type: true } },
        },
        orderBy: { nextDueAt: "asc" },
      }),
      prisma.notification.count({ where: { userId: ownerId, readAt: null, channel: "IN_APP" } }),
    ]);

    const rows = certificates.map(presentExpiryRow);
    const active = rows.filter((row) => row.expiryBucket !== "EXPIRED" && row.expiryBucket !== "REVOKED");
    const expiringSoon = rows.filter((row) =>
      ["DAYS_30_90", "DAYS_7_30", "DAYS_LT_7"].includes(row.expiryBucket),
    );
    const expired = rows.filter((row) => row.expiryBucket === "EXPIRED");
    const reverificationRequired = rows.filter((row) => row.expiryBucket === "EXPIRED" || row.expiryBucket === "DAYS_LT_7" || row.expiryBucket === "DAYS_7_30");

    return {
      summary: {
        instruments: instruments.length,
        activeCertificates: active.length,
        expiringSoon: expiringSoon.length,
        expired: expired.length,
        reverificationRequired: reverificationRequired.length,
        unreadNotifications: unread,
      },
      instruments: instruments.slice(0, 8).map(presentInstrument),
      applications: applications.map(presentApplication),
      certificates: {
        active,
        expiringSoon,
        expired,
        reverificationRequired,
      },
    };
  });

  app.get("/api/dashboard/admin", { preHandler: requireRoles(app, ["ADMIN"]) }, async (request) => {
    await syncExpiryState();
    const certificates = await prisma.certificate.findMany({
      include: { business: true, instrument: { include: { type: true } } },
      orderBy: { nextDueAt: "asc" },
    });
    const rows = certificates.map(presentExpiryRow);
    const active = rows.filter((row) => row.expiryBucket !== "EXPIRED" && row.expiryBucket !== "REVOKED");
    const within90 = rows.filter((row) => ["DAYS_30_90", "DAYS_7_30", "DAYS_LT_7"].includes(row.expiryBucket));
    const within30 = rows.filter((row) => ["DAYS_7_30", "DAYS_LT_7"].includes(row.expiryBucket));
    const within7 = rows.filter((row) => row.expiryBucket === "DAYS_LT_7");
    const expired = rows.filter((row) => row.expiryBucket === "EXPIRED");

    const [submitted, underReview, scheduled, assigned, inProgress, applications, unread] = await Promise.all([
      prisma.application.count({ where: { status: "SUBMITTED" } }),
      prisma.application.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.application.count({ where: { status: "SCHEDULED" } }),
      prisma.application.count({ where: { status: "ASSIGNED" } }),
      prisma.application.count({ where: { status: "INSPECTION_IN_PROGRESS" } }),
      prisma.application.findMany({
        where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "SCHEDULED", "ASSIGNED", "INSPECTION_IN_PROGRESS"] } },
        include: applicationInclude,
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({ where: { userId: request.user.sub, readAt: null, channel: "IN_APP" } }),
    ]);

    return {
      summary: { submitted, underReview, scheduled, assigned, inProgress, unreadNotifications: unread },
      applications: applications.map(presentApplication),
      expiry: {
        totalActive: active.length,
        within90: within90.length,
        within30: within30.length,
        within7: within7.length,
        expired: expired.length,
        lists: { active, within90, within30, within7, expired },
      },
    };
  });

  app.get("/api/dashboard/officer", { preHandler: requireRoles(app, ["LMO", "GATC"]) }, async (request) => {
    const officerId = request.user.sub;
    const now = new Date();
    const [inspections, upcoming, assigned, completed] = await Promise.all([
      prisma.inspection.findMany({
        where: { officerId },
        include: inspectionInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.verificationSchedule.findMany({
        where: { assignedOfficerId: officerId, scheduledAt: { gte: now } },
        include: {
          application: { include: applicationInclude },
          assignedOfficer: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.application.findMany({
        where: { schedule: { assignedOfficerId: officerId }, status: { in: ["ASSIGNED", "INSPECTION_IN_PROGRESS"] } },
        include: applicationInclude,
      }),
      prisma.inspection.count({
        where: { officerId, submittedAt: { not: null } },
      }),
    ]);

    return {
      summary: {
        assigned: assigned.length,
        upcoming: upcoming.length,
        completed,
      },
      assigned: assigned.map(presentApplication),
      upcoming: upcoming.map((row) => ({
        id: row.id,
        scheduledAt: row.scheduledAt,
        application: presentApplication(row.application),
      })),
      inspections: inspections.map(presentInspection),
    };
  });
}
