import type { FastifyRequest } from "fastify";
import type { AuditAction } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function writeAudit(opts: {
  request?: FastifyRequest;
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
}) {
  await prisma.auditLog.create({
    data: {
      userId: opts.userId ?? null,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId,
      ip: opts.request?.ip,
      userAgent: opts.request?.headers["user-agent"],
    },
  });
}
