import type { Request, Response } from "express";

export function createHealthController(): {
  health: (_req: Request, res: Response) => void;
} {
  return {
    health(_req: Request, res: Response) {
      res.json({ status: "ok" });
    },
  };
}
