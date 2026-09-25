import path from "node:path";
import { config as loadDotenv } from "dotenv";

function repoRoot(): string {
  const cwd = process.cwd().replace(/\\/g, "/");
  if (cwd.endsWith("/services/api")) {
    return path.resolve(process.cwd(), "../..");
  }
  return process.cwd();
}

function findEnvPath(): string {
  return path.resolve(repoRoot(), ".env");
}

export type AppEnv = {
  nodeEnv: string;
  apiPort: number;
  databaseUrl: string;
  jwtSecret: string;
  hmacSecret: string;
  webOrigin: string;
  storagePath: string;
  intelligenceUrl: string;
  intelligenceTimeoutMs: number;
};

export function loadEnv(): AppEnv {
  loadDotenv({ path: findEnvPath() });

  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;
  const hmacSecret = process.env.HMAC_SECRET;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error("JWT_SECRET must be set to a string of at least 16 characters");
  }
  if (!hmacSecret || hmacSecret.length < 16) {
    throw new Error("HMAC_SECRET must be set to a string of at least 16 characters");
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiPort: Number(process.env.API_PORT ?? 4000),
    databaseUrl,
    jwtSecret,
    hmacSecret,
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    storagePath: path.resolve(repoRoot(), process.env.STORAGE_PATH ?? "./storage"),
    intelligenceUrl: (process.env.AI_URL ?? `http://localhost:${process.env.AI_PORT ?? 8000}`).replace(/\/$/, ""),
    intelligenceTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 20000),
  };
}
