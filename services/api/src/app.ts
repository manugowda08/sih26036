import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import type { AppEnv } from "@lm-smart/config";
import type { RoleCode } from "@lm-smart/shared-types";
import { authRoutes } from "./routes/auth.js";
import { catalogRoutes } from "./routes/catalog.js";
import { instrumentRoutes } from "./routes/instruments.js";
import { applicationRoutes } from "./routes/applications.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { schedulingRoutes } from "./routes/scheduling.js";
import { inspectionRoutes } from "./routes/inspections.js";
import { certificateRoutes } from "./routes/certificates.js";
import { notificationRoutes } from "./routes/notifications.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      fullName: string;
      roles: RoleCode[];
    };
    user: {
      sub: string;
      email: string;
      fullName: string;
      roles: RoleCode[];
    };
  }
}

export async function buildApp(env: AppEnv) {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const host = new URL(origin).hostname;
        const allowed = origin === env.webOrigin || host === "localhost" || host === "127.0.0.1";
        callback(null, allowed);
      } catch {
        callback(null, false);
      }
    },
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(jwt, {
    secret: env.jwtSecret,
    sign: { expiresIn: "8h" },
  });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "lm-smart-api",
  }));

  await app.register(authRoutes);
  await app.register(catalogRoutes);
  await app.register(instrumentRoutes);
  await app.register(applicationRoutes);
  await app.register(dashboardRoutes);
  await app.register(schedulingRoutes);
  await app.register(inspectionRoutes);
  await app.register(certificateRoutes);
  await app.register(notificationRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (reply.sent) return;
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    return reply.code(status).send({
      error: status >= 500 ? "Internal server error" : error.message,
    });
  });

  return app;
}
