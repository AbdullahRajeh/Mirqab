import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/http-error";
import { assertModelFileReady, type PipelineWorkflowStore } from "../services/pipeline-workflow-store";
import type { DynamicDetectionRepository } from "../repositories/dynamic-detection-repository";
import { SampleDetectionRepository } from "../repositories/sample-detection-repository";
import type { DetectionRepositoryContract } from "../repositories/detection-repository";


const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);

function buildUploadDir(projectRoot: string): string {
  const dir = path.join(projectRoot, "pipeline", "uploads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function createPipelineWorkflowController(
  store: PipelineWorkflowStore,
  dynamicRepo: DynamicDetectionRepository | null,
  repository: DetectionRepositoryContract,
  _mediaBaseUrl: string,
): {
  uploadMiddleware: ReturnType<typeof multer>["single"];
  uploadVideo: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  getUploadStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
} {
  const projectRoot = process.cwd();
  const uploadDir = buildUploadDir(projectRoot);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) {
        cb(null, true);
      } else {
        cb(new HttpError(400, "unsupported_format", `Unsupported file type: ${ext}`));
      }
    },
  });

  return {
    uploadMiddleware: (fieldName: string) => {
      const middleware = upload.single(fieldName);
      return (req: Request, res: Response, next: NextFunction) => {
        middleware(req, res, (err: any) => {
          if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return next(new HttpError(400, "file_too_large", "File size exceeds 4GB limit"));
            }
            if (err instanceof HttpError) {
              return next(err);
            }
            return next(new HttpError(400, "upload_error", err.message || "Upload failed"));
          }
          next();
        });
      };
    },

    async uploadVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
      if (!req.file) {
        throw new HttpError(400, "missing_file", "No video file provided");
      }

      const modelPath = path.join(projectRoot, "pipeline", "models", "best.pt");
      try {
        await assertModelFileReady(modelPath);
      } catch (error) {
        await fs.promises.unlink(req.file.path).catch(() => undefined);
        const message = error instanceof Error ? error.message : "Pipeline model is not ready";
        throw new HttpError(503, "pipeline_model_not_ready", message);
      }

      const rawSkip = req.body?.skipFrames;
      const skipFrames = Math.max(1, Math.min(120, Number.parseInt(String(rawSkip ?? "10"), 10) || 10));
      const job = store.createJob(req.file.originalname, req.file.path, skipFrames);
      res.status(201).json({
        uploadId: job.uploadId,
        runName: job.runName,
        status: job.status,
        progress: job.progress,
      });
    },

    async getUploadStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
      const { uploadId } = req.params;
      if (typeof uploadId !== "string" || !uploadId) {
        throw new HttpError(400, "invalid_upload_id", "Invalid upload ID");
      }

      const job = store.getJob(uploadId);
      if (!job) {
        throw new HttpError(404, "upload_not_found", "Upload not found");
      }

      // When the pipeline finishes, hot-swap the repository OR import into DB
      if (job.status === "complete" && job.detectionsPath && !job._swapped) {
        try {
          const raw = fs.readFileSync(job.detectionsPath, "utf8");
          const detections = JSON.parse(raw);

          if (dynamicRepo) {
            const newRepo = new SampleDetectionRepository(job.detectionsPath);
            dynamicRepo.swap(newRepo);
          } else if (typeof (repository as any).importDetections === 'function') {
            // Import into Postgres
            await (repository as any).importDetections(detections);
          }
          job._swapped = true;
        } catch (err) {
          console.error("Failed to import/swap detections:", err);
        }
      }

      res.json({
        uploadId: job.uploadId,
        runName: job.runName,
        fileName: job.fileName,
        status: job.status,
        progress: job.progress,
        error: job.error,
      });
    },
  };
}
