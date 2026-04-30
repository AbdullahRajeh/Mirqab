import type { Request, Response } from "express";
import { HttpError } from "../utils/http-error";
import type { MockWorkflowStore } from "../services/mock-workflow-store";
import { validateMockUploadBody, validateUploadIdParam } from "../validation/mock-workflow";

export function createMockWorkflowController(store: MockWorkflowStore): {
  uploadVideo: (req: Request, res: Response) => Promise<void>;
  getUploadStatus: (req: Request, res: Response) => Promise<void>;
} {
  return {
    async uploadVideo(req: Request, res: Response): Promise<void> {
      const { fileName, sizeBytes } = validateMockUploadBody(req.body);
      const job = store.createUpload(fileName, sizeBytes);
      res.status(201).json({
        uploadId: job.uploadId,
        videoId: job.videoId,
        status: job.status,
        progress: job.progress,
      });
    },

    async getUploadStatus(req: Request, res: Response): Promise<void> {
      const rawUploadId = req.params.uploadId;
      const uploadId = validateUploadIdParam(
        typeof rawUploadId === "string" ? rawUploadId : rawUploadId?.[0] ?? "",
      );
      const job = store.tickUpload(uploadId);
      if (!job) {
        throw new HttpError(404, "upload_not_found", "Upload not found");
      }
      res.json({
        uploadId: job.uploadId,
        videoId: job.videoId,
        fileName: job.fileName,
        status: job.status,
        progress: job.progress,
      });
    },

  };
}
