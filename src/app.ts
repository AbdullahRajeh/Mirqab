import express from "express";
import path from "node:path";
import { config } from "./config";
import { createDetectionsController } from "./controllers/detections-controller";
import { createHealthController } from "./controllers/health-controller";
import { getPool } from "./db/pool";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import {
  DetectionRepository,
  type DetectionRepositoryContract,
} from "./repositories/detection-repository";
import { SampleDetectionRepository } from "./repositories/sample-detection-repository";
import { createRouter } from "./routes";
import { DetectionService } from "./services/detection-service";
import type { DetectionServiceContract } from "./services/detection-service";

type AppOverrides = {
  service?: DetectionServiceContract;
  repository?: DetectionRepositoryContract;
  pool?: ReturnType<typeof getPool>;
};

function buildDependencies(overrides: AppOverrides = {}): { service: DetectionServiceContract } {
  if (overrides.service) {
    return { service: overrides.service };
  }

  const repository =
    overrides.repository ??
    (config.databaseUrl
      ? new DetectionRepository(overrides.pool ?? getPool())
      : new SampleDetectionRepository(config.sampleDataPath));
  const service = new DetectionService(repository, config.mediaBaseUrl);
  return { service };
}

export function createApp(overrides: AppOverrides = {}): express.Express {
  const { service } = buildDependencies(overrides);
  const detectionsController = createDetectionsController(service);
  const healthController = createHealthController();

  const app = express();
  app.use(express.json());
  app.use(createRouter({ healthController, detectionsController }));
  app.use(
    "/media",
    express.static(config.mediaRootPath, {
      fallthrough: true,
    }),
  );
  app.use(express.static(config.frontendPublicPath));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(config.frontendPublicPath, "index.html"));
  });
  app.get("/dashboard", (_req, res) => {
    res.sendFile(config.dashboardPagePath);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
