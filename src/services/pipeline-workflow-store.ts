import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";

export type PipelineJobStatus = "queued" | "processing" | "complete" | "error";

export type PipelineJob = {
  uploadId: string;
  runName: string;
  fileName: string;
  filePath: string;
  status: PipelineJobStatus;
  progress: number;
  error?: string;
  detectionsPath?: string;
  _swapped?: boolean;
  createdAtMs: number;
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type PipelineWorkflowStore = {
  createJob(fileName: string, filePath: string, skipFrames: number): PipelineJob;
  getJob(uploadId: string): PipelineJob | undefined;
};

class PipelineWorkflowStoreImpl {
  private readonly jobs = new Map<string, PipelineJob>();
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  createJob(fileName: string, filePath: string, skipFrames: number): PipelineJob {
    const uploadId = `upl_${Date.now()}_${randomSuffix()}`;
    const runName = `run_${Date.now()}_${randomSuffix()}`;
    const job: PipelineJob = {
      uploadId,
      runName,
      fileName,
      filePath,
      status: "queued",
      progress: 0,
      createdAtMs: Date.now(),
    };

    this.jobs.set(uploadId, job);
    this.startPipeline(job, skipFrames);
    return job;
  }

  getJob(uploadId: string): PipelineJob | undefined {
    return this.jobs.get(uploadId);
  }

  private startPipeline(job: PipelineJob, skipFrames: number): void {
    // Run the pipeline asynchronously without blocking
    setImmediate(() => {
      this.runPipelineAsync(job, skipFrames).catch((error) => {
        job.status = "error";
        job.error = error instanceof Error ? error.message : String(error);
        console.error(`Pipeline error for ${job.uploadId}:`, error);
      });
    });
  }

  private async runPipelineAsync(job: PipelineJob, skipFrames: number): Promise<void> {
    job.status = "processing";
    job.progress = 0;

    try {
      const scriptPath = path.join(this.projectRoot, "pipeline", "scripts", "inference.py");
      const outputDir = path.join(this.projectRoot, "pipeline", "outputs", job.runName);

      // Create output directory
      await fs.promises.mkdir(outputDir, { recursive: true });

      // Call the Python inference script
      await new Promise<void>((resolve, reject) => {
        const process = spawn("python", [scriptPath, job.filePath, "--output", outputDir, "--skip-frames", String(skipFrames)]);

        process.stdout?.on("data", (data: Buffer) => {
          const output = data.toString();
          console.log(`[${job.uploadId}] ${output}`);

          // Try to extract progress from output
          const progressMatch = output.match(/progress[:\s]+(\d+)/i);
          if (progressMatch) {
            job.progress = Math.min(100, parseInt(progressMatch[1], 10));
          }
        });

        process.stderr?.on("data", (data: Buffer) => {
          console.error(`[${job.uploadId}] ${data.toString()}`);
        });

        process.on("close", (code: number | null) => {
          if (code === 0) {
            // Look for the detections output file
            const detectionsFile = path.join(outputDir, "detections.json");
            if (fs.existsSync(detectionsFile)) {
              job.detectionsPath = detectionsFile;
            }
            job.progress = 100;
            job.status = "complete";
            resolve();
          } else {
            reject(new Error(`Pipeline script exited with code ${code}`));
          }
        });

        process.on("error", (error: Error) => {
          reject(error);
        });
      });
    } catch (error) {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
      console.error(`Pipeline error for ${job.uploadId}:`, error);
    }
  }
}

let singleton: PipelineWorkflowStoreImpl | null = null;

export function getPipelineWorkflowStore(projectRoot: string): PipelineWorkflowStore {
  if (!singleton) {
    singleton = new PipelineWorkflowStoreImpl(projectRoot);
  }
  return singleton;
}
