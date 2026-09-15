import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RoleCode } from "@lm-smart/shared-types";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

export function requireRoles(app: FastifyInstance, roles: RoleCode[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const userRoles = request.user.roles ?? [];
    const allowed = roles.some((role) => userRoles.includes(role));
    if (!allowed) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  };
}

export function registerRbac(_app: FastifyInstance) {
  // Helpers are imported by routes; this keeps RBAC in one module.
}
