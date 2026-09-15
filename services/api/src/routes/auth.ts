import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema } from "@lm-smart/validation";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, requireRoles } from "../plugins/rbac.js";

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/register",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { email, password, fullName, phone } = parsed.data;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: "An account with this email already exists" });
      }

      const ownerRole = await prisma.role.findUnique({ where: { code: "OWNER" } });
      if (!ownerRole) {
        return reply.code(500).send({ error: "OWNER role is missing. Run the database seed." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          phone,
          userRoles: { create: { roleId: ownerRole.id } },
        },
        include: { userRoles: { include: { role: true } } },
      });

      const roles = user.userRoles.map((item) => item.role.code);
      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
      });

      return reply.code(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles,
        },
      });
    },
  );

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({
        where: { email },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user || !user.isActive) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      const matches = await bcrypt.compare(password, user.passwordHash);
      if (!matches) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      const roles = user.userRoles.map((item) => item.role.code);
      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
      });

      await writeAudit({
        request,
        userId: user.id,
        action: "LOGIN",
        entity: "user",
        entityId: user.id,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles,
        },
      };
    },
  );

  app.get("/api/users/me", { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      roles: user.userRoles.map((item) => item.role.code),
    };
  });

  app.get("/api/admin/health", { preHandler: requireRoles(app, ["ADMIN"]) }, async () => ({
    ok: true,
    role: "ADMIN",
  }));
}
