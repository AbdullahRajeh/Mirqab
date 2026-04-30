import express from "express";
import session from "express-session";
import path from "node:path";
import { config } from "./config";
import { createAuthController } from "./controllers/auth-controller";
import { createDetectionsController } from "./controllers/detections-controller";
import { createHealthController } from "./controllers/health-controller";
import { createPipelineWorkflowController } from "./controllers/pipeline-workflow-controller";
import { getPool } from "./db/pool";
import { redirectAuthedAdmin, requireAdminPage } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import {
  DetectionRepository,
  type DetectionRepositoryContract,
} from "./repositories/detection-repository";
import { DynamicDetectionRepository } from "./repositories/dynamic-detection-repository";
import { SampleDetectionRepository } from "./repositories/sample-detection-repository";
import { createMockWorkflowController } from "./controllers/mock-workflow-controller";
import { createRouter } from "./routes";
import { getMockWorkflowStore } from "./services/mock-workflow-store";
import { getPipelineWorkflowStore } from "./services/pipeline-workflow-store";
import { DetectionService } from "./services/detection-service";
import type { DetectionServiceContract } from "./services/detection-service";

type AppOverrides = {
  service?: DetectionServiceContract;
  repository?: DetectionRepositoryContract;
  pool?: ReturnType<typeof getPool>;
};

function buildDependencies(overrides: AppOverrides = {}): {
  service: DetectionServiceContract;
  dynamicRepo: DynamicDetectionRepository | null;
} {
  if (overrides.service) {
    return { service: overrides.service, dynamicRepo: null };
  }

  if (overrides.repository) {
    const service = new DetectionService(overrides.repository, config.mediaBaseUrl);
    return { service, dynamicRepo: null };
  }

  if (config.databaseUrl) {
    const repository = new DetectionRepository(overrides.pool ?? getPool());
    const service = new DetectionService(repository, config.mediaBaseUrl);
    return { service, dynamicRepo: null };
  }

  const inner = new SampleDetectionRepository(config.sampleDataPath);
  const dynamicRepo = new DynamicDetectionRepository(inner);
  const service = new DetectionService(dynamicRepo, config.mediaBaseUrl);
  return { service, dynamicRepo };
}

export function createApp(overrides: AppOverrides = {}): express.Express {
  const { service, dynamicRepo } = buildDependencies(overrides);
  const detectionsController = createDetectionsController(service);
  const mockWorkflowController = createMockWorkflowController(getMockWorkflowStore());
  const pipelineWorkflowController = createPipelineWorkflowController(
    getPipelineWorkflowStore(process.cwd()),
    dynamicRepo,
    config.mediaBaseUrl,
  );
  const healthController = createHealthController();
  const authController = createAuthController({
    adminUsername: config.adminUsername,
    adminPassword: config.adminPassword,
    cookieName: config.authCookieName,
  });

  const app = express();
  app.use(express.json());
  app.use(
    session({
      name: config.authCookieName,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.env === "production",
        maxAge: config.sessionMaxAgeMs,
      },
    }),
  );
  app.use(
    createRouter({
      healthController,
      detectionsController,
      authController,
      mockWorkflowController,
      pipelineWorkflowController,
    }),
  );
  app.use(
    "/media",
    express.static(config.mediaRootPath, {
      fallthrough: true,
    }),
  );
  app.use(express.static(config.frontendPublicPath));
  app.get("/login", redirectAuthedAdmin, (_req, res) => {
    res.sendFile(path.join(config.frontendPublicPath, "login.html"));
  });
  app.get("/", (_req, res) => {
    res.sendFile(path.join(config.frontendPublicPath, "index.html"));
  });
  app.get("/dashboard", requireAdminPage, (_req, res) => {
    res.sendFile(config.dashboardPagePath);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
