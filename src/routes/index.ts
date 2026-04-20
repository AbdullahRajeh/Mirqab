import express from "express";
import { requireAdminApi } from "../middleware/auth";

export function createRouter({
  healthController,
  detectionsController,
  authController,
  mockWorkflowController,
  pipelineWorkflowController,
}: {
  healthController: { health: express.RequestHandler };
  authController: {
    login: express.RequestHandler;
    logout: express.RequestHandler;
    session: express.RequestHandler;
  };
  detectionsController: {
    listVideos: express.RequestHandler;
    listReviews: express.RequestHandler;
    setReview: express.RequestHandler;
    listDetections: express.RequestHandler;
    stats: express.RequestHandler;
    map: express.RequestHandler;
    frame: express.RequestHandler;
  };
  mockWorkflowController: {
    uploadVideo: express.RequestHandler;
    getUploadStatus: express.RequestHandler;
  };
  pipelineWorkflowController: {
    uploadMiddleware: (fieldName: string) => express.RequestHandler;
    uploadVideo: express.RequestHandler;
    getUploadStatus: express.RequestHandler;
  };
}): express.Router {
  const router = express.Router();

  router.get("/health", healthController.health);
  router.post("/auth/login", authController.login);
  router.post("/auth/logout", authController.logout);
  router.get("/auth/session", authController.session);

  router.use("/api/v1", requireAdminApi);
  router.get("/api/v1/videos", detectionsController.listVideos);
  router.get("/api/v1/detections/reviews", detectionsController.listReviews);
  router.patch("/api/v1/detections/:detectionId/review", detectionsController.setReview);
  router.get("/api/v1/detections", detectionsController.listDetections);
  router.get("/api/v1/detections/stats", detectionsController.stats);
  router.get("/api/v1/detections/map", detectionsController.map);
  router.get("/api/v1/frames/:videoId/:frameId", detectionsController.frame);

  router.post("/api/v1/mock/videos/upload", mockWorkflowController.uploadVideo);
  router.get("/api/v1/mock/videos/upload/:uploadId", mockWorkflowController.getUploadStatus);

  router.post(
    "/api/v1/pipeline/upload",
    pipelineWorkflowController.uploadMiddleware("video"),
    pipelineWorkflowController.uploadVideo,
  );
  router.get("/api/v1/pipeline/upload/:uploadId", pipelineWorkflowController.getUploadStatus);

  return router;
}
