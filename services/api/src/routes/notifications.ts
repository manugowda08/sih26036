import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { syncExpiryState } from "../lib/notifications.js";
import { requireRoles } from "../plugins/rbac.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications", { preHandler: requireRoles(app, ["OWNER", "ADMIN", "LMO", "GATC"]) }, async (request) => {
    await syncExpiryState();
    const rows = await prisma.notification.findMany({
      where: { userId: request.user.sub },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body.replace(/\n<!--expiry:.*-->$/, "").trim(),
      channel: row.channel,
      readAt: row.readAt,
      createdAt: row.createdAt,
    }));
  });

  app.post("/api/notifications/refresh", { preHandler: requireRoles(app, ["OWNER", "ADMIN", "LMO", "GATC"]) }, async () => {
    return syncExpiryState();
  });

  app.post("/api/notifications/:id/read", { preHandler: requireRoles(app, ["OWNER", "ADMIN", "LMO", "GATC"]) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== request.user.sub) return reply.code(404).send({ error: "Notification not found" });
    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: row.readAt ?? new Date() },
    });
    return { id: updated.id, readAt: updated.readAt };
  });
}
