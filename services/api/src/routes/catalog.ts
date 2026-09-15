import type { FastifyInstance } from "fastify";
import { createBusinessSchema } from "@lm-smart/validation";
import { prisma } from "../lib/prisma.js";
import { createLocation } from "../lib/location.js";
import { presentBusiness } from "../lib/present.js";
import { requireAuth, requireRoles } from "../plugins/rbac.js";

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/api/instrument-types", { preHandler: requireAuth }, async () => {
    const types = await prisma.instrumentType.findMany({ orderBy: { name: "asc" } });
    return types.map((type) => ({
      id: type.id,
      code: type.code,
      name: type.name,
      category: type.category,
      unit: type.unit,
      defaultPermissibleError: Number(type.defaultPermissibleError.toString()),
    }));
  });

  app.get("/api/businesses", { preHandler: requireRoles(app, ["OWNER", "ADMIN"]) }, async (request) => {
    const ownerId = request.user.roles.includes("ADMIN") ? undefined : request.user.sub;
    const businesses = await prisma.business.findMany({
      where: ownerId ? { ownerId } : undefined,
      include: { location: true },
      orderBy: { name: "asc" },
    });
    return businesses.map(presentBusiness);
  });

  app.post("/api/businesses", { preHandler: requireRoles(app, ["OWNER"]) }, async (request, reply) => {
    const parsed = createBusinessSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const location = parsed.data.location ? await createLocation(parsed.data.location) : null;
    const business = await prisma.business.create({
      data: {
        ownerId: request.user.sub,
        name: parsed.data.name,
        gstin: parsed.data.gstin || null,
        locationId: location?.id,
      },
      include: { location: true },
    });

    return reply.code(201).send(presentBusiness(business));
  });
}
