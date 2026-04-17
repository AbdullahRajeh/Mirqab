import express from "express";

export function createRouter({
  healthController,
  detectionsController,
}: {
  healthController: { health: express.RequestHandler };
  detectionsController: {
    listVideos: express.RequestHandler;
    listDetections: express.RequestHandler;
    stats: express.RequestHandler;
    map: express.RequestHandler;
    frame: express.RequestHandler;
  };
}): express.Router {
  const router = express.Router();

  router.get("/health", healthController.health);
  router.get("/api/v1/videos", detectionsController.listVideos);
  router.get("/api/v1/detections", detectionsController.listDetections);
  router.get("/api/v1/detections/stats", detectionsController.stats);
  router.get("/api/v1/detections/map", detectionsController.map);
  router.get("/api/v1/frames/:videoId/:frameId", detectionsController.frame);

  return router;
}
