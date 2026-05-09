import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",
  sessionSecret: process.env.SESSION_SECRET ?? "change-me-in-production",
  authCookieName: process.env.AUTH_COOKIE_NAME ?? "gpdash.sid",
  sessionMaxAgeMs: parsePositiveInt(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 8),
  mediaBaseUrl: process.env.MEDIA_BASE_URL ?? `http://localhost:${port}/media`,
  mediaRootPath: process.env.MEDIA_ROOT_PATH ?? path.join(process.cwd(), "media"),
  pipelineMode: process.env.PIPELINE_MODE === "true",
  sampleDataPath:
    process.env.SAMPLE_DATA_PATH ?? path.join(process.cwd(), "data", "detections.sample.json"),
  frontendPublicPath: path.join(process.cwd(), "public"),
  dashboardPagePath: path.join(process.cwd(), "dashboard.html"),
};
