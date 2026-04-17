import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
  mediaBaseUrl: process.env.MEDIA_BASE_URL ?? `http://localhost:${port}/media`,
  mediaRootPath: process.env.MEDIA_ROOT_PATH ?? path.join(process.cwd(), "media"),
  sampleDataPath:
    process.env.SAMPLE_DATA_PATH ?? path.join(process.cwd(), "data", "detections.sample.json"),
  frontendPublicPath: path.join(process.cwd(), "public"),
  dashboardPagePath: path.join(process.cwd(), "dashboard.html"),
};
