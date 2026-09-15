import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createCertificateSchema, createReverificationSchema, prototypeDueSchema } from "@lm-smart/validation";
import { loadEnv } from "@lm-smart/config";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { nextApplicationNumber, nextCertificateNumber } from "../lib/codes.js";
import { applicationInclude, certificateInclude } from "../lib/includes.js";
import { expiryBucket, instrumentStatusForBucket } from "../lib/expiry.js";
import { syncExpiryState } from "../lib/notifications.js";
import { createQrTokenValue, hmacMatches, qrTokenLooksValid, randomNonce, sha256Canonical } from "../lib/hmac.js";
import { buildCertificatePdf } from "../lib/certificate-pdf.js";
import { locationText, parseDate, presentApplication, presentCertificate, presentPublicVerification, type CertificateRecord } from "../lib/present.js";
import { requireRoles } from "../plugins/rbac.js";

const AUTHORITY = "Department of Legal Metrology — LM Smart Prototype Authority";

function publicVerifyPageUrl(token: string, webOrigin: string) {
  return `${webOrigin.replace(/\/$/, "")}/verify/${encodeURIComponent(token)}`;
}

function canRead(roles: string[], userId: string, row: { application: { ownerId: string } }) {
  if (roles.includes("ADMIN") || roles.includes("LMO") || roles.includes("GATC")) return true;
  return row.application.ownerId === userId;
}

function canIssue(roles: string[], userId: string, officerId: string) {
  if (roles.includes("ADMIN")) return true;
  return officerId === userId;
}

async function loadCertificate(id: string) {
  return prisma.certificate.findUnique({ where: { id }, include: certificateInclude });
}

function pdfInput(row: CertificateRecord, verifyUrl: string) {
  return {
    certificateNumber: row.certificateNumber,
    businessName: row.business.name,
    ownerName: row.application.owner?.fullName ?? "—",
    instrumentType: row.instrument.type?.name ?? "—",
    manufacturer: row.instrument.manufacturer,
    model: row.instrument.model,
    serialNumber: row.instrument.serialNumber,
    capacity: row.instrument.capacity,
    locationText: locationText(row.instrument.location),
    verifiedAt: row.verifiedAt,
    nextDueAt: row.nextDueAt,
    issuedAt: row.issuedAt,
    officerName: row.officer.fullName,
    authorityName: row.authorityName,
    result: row.inspection?.result === "PASS" ? "PASS (Verified)" : row.inspection?.result ?? "PASS",
    digitalHash: row.digitalHash,
    verifyUrl,
  };
}

async function ensurePdf(row: CertificateRecord, storagePath: string, verifyUrl: string) {
  const pdfPath = row.pdfPath ?? path.join(storagePath, "certificates", `${row.certificateNumber}.pdf`);
  try {
    await fs.access(pdfPath);
    return pdfPath;
  } catch {
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    const buffer = await buildCertificatePdf(pdfInput(row, verifyUrl));
    await fs.writeFile(pdfPath, buffer);
    await prisma.certificate.update({ where: { id: row.id }, data: { pdfPath } });
    return pdfPath;
  }
}

export async function certificateRoutes(app: FastifyInstance) {
  const env = loadEnv();

  app.get("/api/certificates", { preHandler: requireRoles(app, ["ADMIN", "LMO", "GATC", "OWNER"]) }, async (request) => {
    const ownerOnly = request.user.roles.includes("OWNER") && !request.user.roles.includes("ADMIN");
    const rows = await prisma.certificate.findMany({
      where: ownerOnly ? { application: { ownerId: request.user.sub } } : undefined,
      include: certificateInclude,
      orderBy: { issuedAt: "desc" },
    });
    return rows.map((row) => {
      const token = row.qrTokens[0]?.token;
      return presentCertificate(row, token ? publicVerifyPageUrl(token, env.webOrigin) : "");
    });
  });

  app.post("/api/certificates", { preHandler: requireRoles(app, ["ADMIN", "LMO", "GATC"]) }, async (request, reply) => {
    const parsed = createCertificateSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });

    const inspection = await prisma.inspection.findUnique({
      where: { id: parsed.data.inspectionId },
      include: {
        instrument: { include: { type: true, location: true } },
        application: { include: { owner: { select: { id: true, fullName: true } }, business: true } },
        officer: { select: { id: true, fullName: true } },
        certificates: true,
      },
    });
    if (!inspection) return reply.code(404).send({ error: "Inspection not found" });
    if (!canIssue(request.user.roles, request.user.sub, inspection.officerId)) {
      return reply.code(403).send({ error: "Only the assigned officer or an admin can issue this certificate" });
    }
    if (inspection.result !== "PASS") {
      return reply.code(400).send({ error: "A certificate can be generated only after a PASS inspection" });
    }
    if (!inspection.application.businessId) {
      return reply.code(400).send({ error: "Application is missing a business" });
    }

    const existingId = inspection.certificates[0]?.id;
    if (existingId) {
      const existing = await loadCertificate(existingId);
      if (!existing) return reply.code(404).send({ error: "Certificate not found" });
      const token = existing.qrTokens[0]?.token;
      const verifyUrl = token ? publicVerifyPageUrl(token, env.webOrigin) : "";
      await ensurePdf(existing, env.storagePath, verifyUrl);
      return presentCertificate(existing, verifyUrl);
    }

    const verifiedAt = inspection.submittedAt ?? new Date();
    const nextDueAt = new Date(verifiedAt);
    nextDueAt.setFullYear(nextDueAt.getFullYear() + 1);
    const tokenExpiresAt = new Date(verifiedAt);
    tokenExpiresAt.setFullYear(tokenExpiresAt.getFullYear() + 10);

    const certificateNumber = await nextCertificateNumber();
    const digitalHash = sha256Canonical({
      certificateNumber,
      inspectionId: inspection.id,
      instrumentId: inspection.instrumentId,
      serialNumber: inspection.instrument.serialNumber,
      verifiedAt: verifiedAt.toISOString(),
      nextDueAt: nextDueAt.toISOString(),
    });

    const created = await prisma.$transaction(async (tx) => {
      const certificate = await tx.certificate.create({
        data: {
          certificateNumber,
          instrumentId: inspection.instrumentId,
          applicationId: inspection.applicationId,
          inspectionId: inspection.id,
          businessId: inspection.application.businessId!,
          officerId: inspection.officerId,
          authorityName: AUTHORITY,
          verificationFee: 0,
          verifiedAt,
          nextDueAt,
          status: "ACTIVE",
          digitalHash,
        },
      });
      const nonce = randomNonce();
      const token = createQrTokenValue(nonce, certificate.id, env.hmacSecret);
      await tx.qrToken.create({
        data: {
          certificateId: certificate.id,
          token,
          nonce,
          issuedAt: new Date(),
          expiresAt: tokenExpiresAt,
        },
      });
      await tx.application.update({
        where: { id: inspection.applicationId },
        data: { status: "CERTIFICATE_GENERATED" },
      });
      await tx.instrument.update({
        where: { id: inspection.instrumentId },
        data: { currentStatus: "ACTIVE", lastVerifiedAt: verifiedAt, nextDueAt },
      });
      await tx.verificationHistory.create({
        data: {
          instrumentId: inspection.instrumentId,
          certificateId: certificate.id,
          event: "CERTIFICATE_ISSUED",
          notes: certificateNumber,
        },
      });
      return certificate.id;
    });

    await writeAudit({
      request,
      userId: request.user.sub,
      action: "GENERATE_CERTIFICATE",
      entity: "Certificate",
      entityId: created,
    });

    const row = await loadCertificate(created);
    if (!row) return reply.code(500).send({ error: "Certificate was created but could not be loaded" });
    const token = row.qrTokens[0]?.token;
    const verifyUrl = token ? publicVerifyPageUrl(token, env.webOrigin) : "";
    await ensurePdf(row, env.storagePath, verifyUrl);
    const refreshed = (await loadCertificate(created)) ?? row;
    return reply.code(201).send(presentCertificate(refreshed, verifyUrl));
  });

  app.get("/api/certificates/:id", { preHandler: requireRoles(app, ["ADMIN", "LMO", "GATC", "OWNER"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadCertificate(id);
    if (!row) return reply.code(404).send({ error: "Certificate not found" });
    if (!canRead(request.user.roles, request.user.sub, row)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const token = row.qrTokens[0]?.token;
    return presentCertificate(row, token ? publicVerifyPageUrl(token, env.webOrigin) : "");
  });

  app.patch("/api/certificates/:id/prototype-due", { preHandler: requireRoles(app, ["ADMIN"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = prototypeDueSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "nextDueAt is required" });
    const nextDueAt = parseDate(parsed.data.nextDueAt);
    if (!nextDueAt) return reply.code(400).send({ error: "Invalid nextDueAt" });

    const row = await loadCertificate(id);
    if (!row) return reply.code(404).send({ error: "Certificate not found" });

    const status = nextDueAt.getTime() < Date.now() ? "EXPIRED" : "ACTIVE";
    const bucket = expiryBucket(nextDueAt, status);
    await prisma.certificate.update({ where: { id }, data: { nextDueAt, status } });
    await prisma.instrument.update({
      where: { id: row.instrumentId },
      data: { nextDueAt, currentStatus: instrumentStatusForBucket(bucket) },
    });
    await prisma.verificationHistory.create({
      data: {
        instrumentId: row.instrumentId,
        certificateId: id,
        event: "PROTOTYPE_DUE_ADJUSTED",
        notes: `Demo due date set to ${nextDueAt.toISOString()}`,
      },
    });
    await syncExpiryState();
    const refreshed = await loadCertificate(id);
    if (!refreshed) return reply.code(404).send({ error: "Certificate not found" });
    const token = refreshed.qrTokens[0]?.token;
    return presentCertificate(refreshed, token ? publicVerifyPageUrl(token, env.webOrigin) : "");
  });

  app.post("/api/certificates/:id/reverify", { preHandler: requireRoles(app, ["OWNER", "ADMIN"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createReverificationSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const row = await loadCertificate(id);
    if (!row) return reply.code(404).send({ error: "Certificate not found" });
    if (!canRead(request.user.roles, request.user.sub, row)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const bucket = expiryBucket(row.nextDueAt, row.status);
    if (bucket === "DAYS_90_PLUS" || bucket === "REVOKED") {
      return reply.code(400).send({ error: "Reverification is available when a certificate is expired or within 90 days of due date" });
    }

    const open = await prisma.application.findFirst({
      where: {
        instrumentId: row.instrumentId,
        status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "SCHEDULED", "ASSIGNED", "INSPECTION_IN_PROGRESS"] },
      },
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
        kind: "REVERIFICATION",
        status: "DRAFT",
        instrumentId: row.instrumentId,
        businessId: row.businessId,
        ownerId: row.application.ownerId,
        notes: parsed.data.notes || `Reverification of ${row.certificateNumber}`,
      },
      include: applicationInclude,
    });

    await prisma.verificationHistory.create({
      data: {
        instrumentId: row.instrumentId,
        certificateId: row.id,
        event: "REVERIFICATION_STARTED",
        notes: `New application ${application.applicationNumber} for ${row.certificateNumber}`,
      },
    });

    return reply.code(201).send(presentApplication(application));
  });

  app.get("/api/certificates/:id/pdf", { preHandler: requireRoles(app, ["ADMIN", "LMO", "GATC", "OWNER"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadCertificate(id);
    if (!row) return reply.code(404).send({ error: "Certificate not found" });
    if (!canRead(request.user.roles, request.user.sub, row)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const token = row.qrTokens[0]?.token;
    const verifyUrl = token ? publicVerifyPageUrl(token, env.webOrigin) : "";
    const pdfPath = await ensurePdf(row, env.storagePath, verifyUrl);
    const buffer = await fs.readFile(pdfPath);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${row.certificateNumber}.pdf"`)
      .send(buffer);
  });

  app.get("/api/public/verify/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const decoded = decodeURIComponent(token);

    const invalid = () => reply.send(presentPublicVerification("INVALID"));

    if (!qrTokenLooksValid(decoded)) {
      return invalid();
    }

    const qr = await prisma.qrToken.findUnique({
      where: { token: decoded },
      include: { certificate: { include: certificateInclude } },
    });
    if (!qr) return invalid();
    if (!hmacMatches(decoded, qr.nonce, qr.certificateId, env.hmacSecret)) {
      return invalid();
    }

    await writeAudit({
      request,
      action: "VERIFY_QR",
      entity: "Certificate",
      entityId: qr.certificateId,
    });

    const now = new Date();
    if (qr.revokedAt || qr.certificate.status === "REVOKED") {
      return presentPublicVerification("REVOKED", qr.certificate);
    }
    if (qr.expiresAt < now) {
      return invalid();
    }
    if (qr.certificate.status === "EXPIRED" || qr.certificate.nextDueAt < now) {
      return presentPublicVerification("EXPIRED", qr.certificate);
    }
    return presentPublicVerification("VALID", qr.certificate);
  });
}
