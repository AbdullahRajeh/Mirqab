import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";

export type PipelineJobStatus = "queued" | "inference" | "complete" | "failed";

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

export function buildPipelineCommand(projectRoot: string, job: PipelineJob, skipFrames: number): {
  command: string;
  args: string[];
  detectionsPath: string;
} {
  const pipelineRoot = path.join(projectRoot, "pipeline");
  const scriptPath = path.join(pipelineRoot, "scripts", "inference.py");
  const modelPath = path.join(pipelineRoot, "models", "best.pt");
  const detectionsPath = path.join(pipelineRoot, "runs", "inference", job.runName, "detections.json");
  const command = process.env.PYTHON_BIN ?? "python";

  return {
    command,
    args: [
      scriptPath,
      "--model",
      modelPath,
      "--input",
      job.filePath,
      "--name",
      job.runName,
      "--skip-frames",
      String(skipFrames),
    ],
    detectionsPath,
  };
}

export function parsePipelineProgress(output: string): number | null {
  const fractionMatch = output.match(/PROGRESS:\s*(\d+)\s*\/\s*(\d+)/i);
  if (fractionMatch) {
    const processed = Number.parseInt(fractionMatch[1], 10);
    const total = Number.parseInt(fractionMatch[2], 10);
    if (Number.isFinite(processed) && Number.isFinite(total) && total > 0) {
      return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
    }
  }

  const percentMatch = output.match(/progress[:\s]+(\d+)(?:\s*%)?/i);
  if (percentMatch) {
    return Math.min(100, Math.max(0, Number.parseInt(percentMatch[1], 10)));
  }

  return null;
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
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        console.error(`Pipeline error for ${job.uploadId}:`, error);
      });
    });
  }

  private async runPipelineAsync(job: PipelineJob, skipFrames: number): Promise<void> {
    job.status = "inference";
    job.progress = 0;

    try {
      const { command, args, detectionsPath } = buildPipelineCommand(this.projectRoot, job, skipFrames);

      // Call the Python inference script
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args);
        let stderrTail = "";

        child.stdout?.on("data", (data: Buffer) => {
          const output = data.toString();
          console.log(`[${job.uploadId}] ${output}`);

          const progress = parsePipelineProgress(output);
          if (progress !== null) {
            job.progress = progress;
          }
        });

        child.stderr?.on("data", (data: Buffer) => {
          const output = data.toString();
          stderrTail = `${stderrTail}${output}`.slice(-4000);
          console.error(`[${job.uploadId}] ${output}`);
        });

        child.on("close", (code: number | null) => {
          if (code === 0) {
            if (fs.existsSync(detectionsPath)) {
              job.detectionsPath = detectionsPath;
            }
            job.progress = 100;
            job.status = "complete";
            resolve();
          } else {
            const detail = stderrTail.trim();
            reject(new Error(`Pipeline script exited with code ${code}${detail ? `: ${detail}` : ""}`));
          }
        });

        child.on("error", (error: Error) => {
          reject(error);
        });
      });
    } catch (error) {
      job.status = "failed";
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
