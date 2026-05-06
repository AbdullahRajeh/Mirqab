import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";

export function createHealthController(): {
  health: (_req: Request, res: Response) => void;
} {
  return {
    health(_req: Request, res: Response) {
      const modelPath = path.join(process.cwd(), "pipeline", "models", "best.pt");
      let modelStatus = "missing";
      
      if (fs.existsSync(modelPath)) {
        const stats = fs.statSync(modelPath);
        if (stats.size < 1024 * 1024) {
          modelStatus = "lfs_pointer";
        } else {
          modelStatus = "ready";
        }
      }

      res.json({ 
        status: "ok",
        pipeline: {
          model: modelStatus
        }
      });
    },
  };
}
