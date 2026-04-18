import type { Request, Response } from "express";
import type { DetectionServiceContract } from "../services/detection-service";
import { validateFrameParams, validateListQuery } from "../validation/detections";
import { validateDetectionIdParam } from "../validation/mock-workflow";
import { validateReviewBody } from "../validation/reviews";

export function createDetectionsController(service: DetectionServiceContract): {
  listVideos: (_req: Request, res: Response) => Promise<void>;
  listReviews: (_req: Request, res: Response) => Promise<void>;
  setReview: (req: Request, res: Response) => Promise<void>;
  listDetections: (req: Request, res: Response) => Promise<void>;
  stats: (req: Request, res: Response) => Promise<void>;
  map: (req: Request, res: Response) => Promise<void>;
  frame: (req: Request, res: Response) => Promise<void>;
} {
  return {
    async listVideos(_req: Request, res: Response): Promise<void> {
      const items = await service.listVideos();
      res.json({ items });
    },

    async listReviews(_req: Request, res: Response): Promise<void> {
      const items = await service.listReviews();
      res.json({ items });
    },

    async setReview(req: Request, res: Response): Promise<void> {
      const rawId = req.params.detectionId;
      const detectionId = validateDetectionIdParam(typeof rawId === "string" ? rawId : rawId?.[0] ?? "");
      const { decision } = validateReviewBody(req.body);
      const payload = await service.setReview(detectionId, decision);
      res.json(payload);
    },

    async listDetections(req: Request, res: Response): Promise<void> {
      const query = validateListQuery(req.query);
      const payload = await service.listDetections(query);
      res.json(payload);
    },

    async stats(req: Request, res: Response): Promise<void> {
      const query = validateListQuery(req.query);
      const payload = await service.getStats(query);
      res.json(payload);
    },

    async map(req: Request, res: Response): Promise<void> {
      const query = validateListQuery(req.query);
      const payload = await service.getMapData(query);
      res.json(payload);
    },

    async frame(req: Request, res: Response): Promise<void> {
      const params = validateFrameParams(req.params);
      const payload = await service.getFrame(params.videoId, params.frameId);
      res.json(payload);
    },
  };
}
