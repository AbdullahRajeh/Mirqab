import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";

export type PipelineJobStatus = "queued" | "processing" | "complete" | "failed";

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

function resolvePythonCommand(projectRoot: string): string {
  if (process.env.PIPELINE_PYTHON) {
    return process.env.PIPELINE_PYTHON;
  }

  const venvPython = path.join(projectRoot, "pipeline", "venv", "bin", "python");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  const windowsVenvPython = path.join(projectRoot, "pipeline", "venv", "Scripts", "python.exe");
  if (fs.existsSync(windowsVenvPython)) {
    return windowsVenvPython;
  }

  return "python3";
}

export async function assertModelFileReady(modelPath: string): Promise<void> {
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(modelPath);
  } catch {
    throw new Error(`Pipeline model not found: ${modelPath}`);
  }

  const handle = await fs.promises.open(modelPath, "r");
  const headerBuffer = Buffer.alloc(128);
  const { bytesRead } = await handle.read(headerBuffer, 0, headerBuffer.length, 0);
  await handle.close();
  const header = headerBuffer.subarray(0, bytesRead).toString("utf8");
  if (header.startsWith("version https://git-lfs.github.com/spec/v1")) {
    throw new Error(
      "Pipeline model is a Git LFS pointer, not the real best.pt file. Install git-lfs and pull the model, or copy the real pipeline/models/best.pt file into place.",
    );
  }

  if (stats.size < 1024 * 1024) {
    throw new Error(`Pipeline model file is too small to be valid: ${modelPath}`);
  }
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
    job.status = "processing";
    job.progress = 0;

    try {
      const scriptPath = path.join(this.projectRoot, "pipeline", "scripts", "inference.py");
      const ocrScriptPath = path.join(this.projectRoot, "pipeline", "scripts", "ocr_gps.py");
      const modelPath = path.join(this.projectRoot, "pipeline", "models", "best.pt");

      // Verify the model file is real and not a Git LFS pointer
      await assertModelFileReady(modelPath);

      // inference.py uses project_root as os.path.dirname(os.path.dirname(scriptPath)) which is "pipeline/"
      // So it saves results in "pipeline/runs/inference/RUN_NAME"
      const runDir = path.join(this.projectRoot, "pipeline", "runs", "inference", job.runName);
      const pythonPath = resolvePythonCommand(this.projectRoot);

      // Create output directory
      await fs.promises.mkdir(runDir, { recursive: true });

      const inputPath = await this.prepareInputVideo(job, runDir);

      // 1. Run Inference
      await new Promise<void>((resolve, reject) => {
        let stderrOutput = "";
        const process = spawn(pythonPath, [
          scriptPath,
          "--model",
          modelPath,
          "--input",
          inputPath,
          "--name",
          job.runName,
          "--skip-frames",
          String(skipFrames),
        ]);

        process.stdout?.on("data", (data: Buffer) => {
          const output = data.toString();
          console.log(`[Inference ${job.uploadId}] ${output}`);

          const progressMatch = output.match(/PROGRESS:(\d+)\/(\d+)/i);
          if (progressMatch) {
            const processed = parseInt(progressMatch[1], 10);
            const total = parseInt(progressMatch[2], 10);
            if (total > 0) {
              job.progress = Math.min(90, Math.round((processed / total) * 90));
            }
          }
        });

        process.stderr?.on("data", (data: Buffer) => {
          const output = data.toString();
          stderrOutput += output;
          console.error(`[Inference ${job.uploadId}] ${output}`);
        });

        process.on("close", (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            const detail = stderrOutput.trim().split(/\r?\n/).slice(-8).join("\n");
            reject(new Error(detail || `Inference script exited with code ${code}`));
          }
        });

        process.on("error", (error: Error) => {
          reject(error);
        });
      });

      // 2. Run OCR for GPS
      job.progress = 90;
      await new Promise<void>((resolve, reject) => {
        let stderrOutput = "";
        const process = spawn(pythonPath, [
          ocrScriptPath,
          "--run",
          runDir
        ]);

        process.stdout?.on("data", (data: Buffer) => {
          console.log(`[OCR ${job.uploadId}] ${data.toString()}`);
          job.progress = 95;
        });

        process.stderr?.on("data", (data: Buffer) => {
          const output = data.toString();
          stderrOutput += output;
          console.error(`[OCR ${job.uploadId}] ${output}`);
        });

        process.on("close", (code: number | null) => {
          if (code === 0) {
            const detectionsFile = path.join(runDir, "detections.json");
            if (fs.existsSync(detectionsFile)) {
              job.detectionsPath = detectionsFile;
            }
            job.progress = 100;
            job.status = "complete";
            resolve();
          } else {
            const detail = stderrOutput.trim().split(/\r?\n/).slice(-8).join("\n");
            reject(new Error(detail || `OCR script exited with code ${code}`));
          }
        });
      });
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      console.error(`Pipeline error for ${job.uploadId}:`, error);
    }
  }

  private async prepareInputVideo(job: PipelineJob, runDir: string): Promise<string> {
    const ext = path.extname(job.filePath).toLowerCase();
    if (ext !== ".mov") {
      return job.filePath;
    }

    job.progress = 1;
    const normalizedPath = path.join(runDir, "input.mp4");
    await new Promise<void>((resolve, reject) => {
      let stderrOutput = "";
      const process = spawn("ffmpeg", [
        "-y",
        "-i",
        job.filePath,
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        normalizedPath,
      ]);

      process.stderr?.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });

      process.on("close", (code: number | null) => {
        if (code === 0) {
          resolve();
          return;
        }

        const detail = stderrOutput.trim().split(/\r?\n/).slice(-8).join("\n");
        reject(new Error(detail || `ffmpeg exited with code ${code}`));
      });

      process.on("error", reject);
    });

    return normalizedPath;
  }
}

let singleton: PipelineWorkflowStoreImpl | null = null;

export function getPipelineWorkflowStore(projectRoot: string): PipelineWorkflowStore {
  if (!singleton) {
    singleton = new PipelineWorkflowStoreImpl(projectRoot);
  }
  return singleton;
}
