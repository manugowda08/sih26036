import { loadEnv } from "@lm-smart/config";
import { prisma } from "./lib/prisma.js";
import { buildApp } from "./app.js";

const env = loadEnv();
const app = await buildApp(env);

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: env.apiPort, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
