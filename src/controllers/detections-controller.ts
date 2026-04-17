import type { Request, Response } from "express";
import type { DetectionServiceContract } from "../services/detection-service";
import { validateFrameParams, validateListQuery } from "../validation/detections";

export function createDetectionsController(service: DetectionServiceContract): {
  listVideos: (_req: Request, res: Response) => Promise<void>;
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
