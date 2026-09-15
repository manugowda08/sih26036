import type { NotificationChannel } from "@prisma/client";
import { prisma } from "./prisma.js";
import { expiryBucket, instrumentStatusForBucket, notificationMilestone } from "./expiry.js";

const LIFECYCLE = new Set([
  "PASSED",
  "CERTIFICATE_GENERATED",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
]);

const MILESTONE_COPY: Record<string, { title: string; body: (certNo: string, due: string) => string }> = {
  D90: {
    title: "Certificate expiring in 90 days",
    body: (certNo, due) =>
      `Certificate ${certNo} will fall due on ${due}. Please plan reverification.`,
  },
  D30: {
    title: "Certificate expiring in 30 days",
    body: (certNo, due) =>
      `Certificate ${certNo} is due on ${due} (within 30 days). Start reverification soon.`,
  },
  D7: {
    title: "Certificate expiring in 7 days",
    body: (certNo, due) =>
      `Certificate ${certNo} expires on ${due} (less than 7 days remaining). Reverification is required.`,
  },
  EXPIRED: {
    title: "Certificate expired",
    body: (certNo, due) =>
      `Certificate ${certNo} expired on ${due}. The instrument must not be used for trade until reverified.`,
  },
};

function marker(certificateId: string, milestone: string) {
  return `<!--expiry:${certificateId}:${milestone}-->`;
}

async function adminUserIds() {
  const rows = await prisma.userRole.findMany({
    where: { role: { code: "ADMIN" } },
    select: { userId: true },
  });
  return [...new Set(rows.map((row) => row.userId))];
}

export async function syncExpiryState(now = new Date()) {
  const certificates = await prisma.certificate.findMany({
    include: {
      application: { select: { ownerId: true, id: true } },
      instrument: { select: { id: true, currentStatus: true, ownerId: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  const latestByInstrument = new Map<string, (typeof certificates)[number]>();
  for (const cert of certificates) {
    if (!latestByInstrument.has(cert.instrumentId)) {
      latestByInstrument.set(cert.instrumentId, cert);
    }
  }

  for (const cert of certificates) {
    const bucket = expiryBucket(cert.nextDueAt, cert.status, now);
    if (bucket === "EXPIRED" && cert.status === "ACTIVE") {
      await prisma.certificate.update({ where: { id: cert.id }, data: { status: "EXPIRED" } });
    }
  }

  for (const [instrumentId, latest] of latestByInstrument) {
    const bucket = expiryBucket(latest.nextDueAt, latest.status, now);
    const nextStatus = instrumentStatusForBucket(bucket);
    if (LIFECYCLE.has(latest.instrument.currentStatus) && latest.instrument.currentStatus !== nextStatus) {
      await prisma.instrument.update({
        where: { id: instrumentId },
        data: { currentStatus: nextStatus, nextDueAt: latest.nextDueAt },
      });
    }
  }

  const admins = await adminUserIds();
  let created = 0;

  for (const cert of certificates) {
    const bucket = expiryBucket(cert.nextDueAt, cert.status, now);
    const milestone = notificationMilestone(bucket);
    if (!milestone) continue;

    const recipients = new Set<string>([cert.application.ownerId, cert.instrument.ownerId, ...admins]);
    const copy = MILESTONE_COPY[milestone];
    const due = cert.nextDueAt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const tag = marker(cert.id, milestone);
    const channels: NotificationChannel[] = ["IN_APP", "EMAIL_MOCK", "WHATSAPP_MOCK"];

    for (const userId of recipients) {
      for (const channel of channels) {
        const existing = await prisma.notification.findFirst({
          where: { userId, channel, body: { contains: tag } },
        });
        if (existing) continue;
        const mockNote =
          channel === "IN_APP"
            ? ""
            : channel === "EMAIL_MOCK"
              ? " [Demo email channel — not sent]"
              : " [Demo WhatsApp channel — not sent]";
        await prisma.notification.create({
          data: {
            userId,
            channel,
            title: copy.title,
            body: `${copy.body(cert.certificateNumber, due)}${mockNote}\n${tag}`,
          },
        });
        created += 1;
      }
    }
  }

  return { created };
}
