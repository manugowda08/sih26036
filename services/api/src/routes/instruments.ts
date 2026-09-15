import type { FastifyInstance } from "fastify";
import { createInstrumentSchema, updateInstrumentSchema } from "@lm-smart/validation";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { nextInstrumentCode } from "../lib/codes.js";
import { createLocation } from "../lib/location.js";
import { parseDate, presentInstrument } from "../lib/present.js";
import { requireRoles } from "../plugins/rbac.js";

const instrumentInclude = {
  type: true,
  business: { include: { location: true } },
  location: true,
} as const;

export async function instrumentRoutes(app: FastifyInstance) {
  app.get("/api/instruments", { preHandler: requireRoles(app, ["OWNER", "ADMIN"]) }, async (request) => {
    const ownerId = request.user.roles.includes("ADMIN") ? undefined : request.user.sub;
    const instruments = await prisma.instrument.findMany({
      where: ownerId ? { ownerId } : undefined,
      include: instrumentInclude,
      orderBy: { createdAt: "desc" },
    });
    return instruments.map(presentInstrument);
  });

  app.get("/api/instruments/:id", { preHandler: requireRoles(app, ["OWNER", "ADMIN"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const instrument = await prisma.instrument.findUnique({
      where: { id },
      include: {
        ...instrumentInclude,
        applications: { orderBy: { createdAt: "desc" }, take: 20 },
        certificates: { orderBy: { issuedAt: "desc" } },
        history: { orderBy: { occurredAt: "desc" }, include: { certificate: { select: { certificateNumber: true, verifiedAt: true, status: true } } } },
      },
    });
    if (!instrument) return reply.code(404).send({ error: "Instrument not found" });
    if (!request.user.roles.includes("ADMIN") && instrument.ownerId !== request.user.sub) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    return {
      ...presentInstrument(instrument),
      applications: instrument.applications.map((item) => ({
        id: item.id,
        applicationNumber: item.applicationNumber,
        kind: item.kind,
        status: item.status,
        submittedAt: item.submittedAt,
        createdAt: item.createdAt,
      })),
      certificates: instrument.certificates.map((item) => ({
        id: item.id,
        certificateNumber: item.certificateNumber,
        status: item.status,
        verifiedAt: item.verifiedAt,
        nextDueAt: item.nextDueAt,
        issuedAt: item.issuedAt,
      })),
      history: instrument.history.map((item) => ({
        id: item.id,
        event: item.event,
        notes: item.notes,
        occurredAt: item.occurredAt,
        certificateNumber: item.certificate?.certificateNumber ?? null,
      })),
    };
  });

  app.post("/api/instruments", { preHandler: requireRoles(app, ["OWNER"]) }, async (request, reply) => {
    const parsed = createInstrumentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const type = await prisma.instrumentType.findUnique({ where: { id: data.typeId } });
    if (!type) return reply.code(400).send({ error: "Unknown instrument type" });

    let businessId = data.businessId;
    if (businessId) {
      const business = await prisma.business.findUnique({ where: { id: businessId } });
      if (!business || business.ownerId !== request.user.sub) {
        return reply.code(400).send({ error: "Business not found" });
      }
    } else if (data.business) {
      const location = data.business.location
        ? await createLocation(data.business.location)
        : await createLocation(data.location);
      const business = await prisma.business.create({
        data: {
          ownerId: request.user.sub,
          name: data.business.name,
          gstin: data.business.gstin || null,
          locationId: location.id,
        },
      });
      businessId = business.id;
    }

    const duplicate = await prisma.instrument.findFirst({
      where: { ownerId: request.user.sub, serialNumber: data.serialNumber },
    });
    if (duplicate) {
      return reply.code(409).send({ error: "An instrument with this serial number is already registered" });
    }

    const location = await createLocation(data.location);
    const lastVerifiedAt = parseDate(data.lastVerifiedAt);
    const nextDueAt = parseDate(data.nextDueAt);

    const instrument = await prisma.instrument.create({
      data: {
        instrumentCode: await nextInstrumentCode(),
        typeId: data.typeId,
        businessId: businessId!,
        ownerId: request.user.sub,
        manufacturer: data.manufacturer,
        model: data.model,
        serialNumber: data.serialNumber,
        capacity: data.capacity,
        accuracyClass: data.accuracyClass || null,
        purpose: data.purpose || null,
        locationId: location.id,
        lastVerifiedAt,
        nextDueAt,
        currentStatus: "DRAFT",
      },
      include: instrumentInclude,
    });

    if (data.previousCertificateNumber) {
      await prisma.verificationHistory.create({
        data: {
          instrumentId: instrument.id,
          event: "PREVIOUS_CERTIFICATE",
          notes: `Existing certificate ${data.previousCertificateNumber}`,
        },
      });
    }

    await writeAudit({
      request,
      userId: request.user.sub,
      action: "REGISTER_INSTRUMENT",
      entity: "instrument",
      entityId: instrument.id,
    });

    return reply.code(201).send(presentInstrument(instrument));
  });

  app.put("/api/instruments/:id", { preHandler: requireRoles(app, ["OWNER"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateInstrumentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const existing = await prisma.instrument.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Instrument not found" });
    if (existing.ownerId !== request.user.sub) return reply.code(403).send({ error: "Forbidden" });

    const location = parsed.data.location ? await createLocation(parsed.data.location) : undefined;
    const instrument = await prisma.instrument.update({
      where: { id },
      data: {
        manufacturer: parsed.data.manufacturer,
        model: parsed.data.model,
        capacity: parsed.data.capacity,
        accuracyClass: parsed.data.accuracyClass,
        purpose: parsed.data.purpose,
        locationId: location?.id,
      },
      include: instrumentInclude,
    });
    return presentInstrument(instrument);
  });
}
