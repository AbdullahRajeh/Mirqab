export type UploadJobStatus = "queued" | "processing" | "complete";

export type UploadJob = {
  uploadId: string;
  videoId: string;
  fileName: string;
  status: UploadJobStatus;
  progress: number;
  createdAtMs: number;
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class MockWorkflowStore {
  private readonly uploads = new Map<string, UploadJob>();

  createUpload(fileName: string, _sizeBytes?: number): UploadJob {
    const uploadId = `upl_${Date.now()}_${randomSuffix()}`;
    const videoId = `mock_vid_${Date.now()}_${randomSuffix()}`;
    const job: UploadJob = {
      uploadId,
      videoId,
      fileName,
      status: "queued",
      progress: 0,
      createdAtMs: Date.now(),
    };
    this.uploads.set(uploadId, job);
    return job;
  }

  getUpload(uploadId: string): UploadJob | undefined {
    return this.uploads.get(uploadId);
  }

  /** Advance fake pipeline for polling UI. */
  tickUpload(uploadId: string): UploadJob | undefined {
    const job = this.uploads.get(uploadId);
    if (!job || job.status === "complete") {
      return job;
    }

    if (job.progress === 0) {
      job.status = "processing";
    }

    job.progress = Math.min(100, job.progress + 34);
    if (job.progress >= 100) {
      job.progress = 100;
      job.status = "complete";
    }

    return job;
  }

  clear(): void {
    this.uploads.clear();
  }
}

let singleton: MockWorkflowStore | null = null;

export function getMockWorkflowStore(): MockWorkflowStore {
  if (!singleton) {
    singleton = new MockWorkflowStore();
  }
  return singleton;
}

/** Test helper: replace singleton with a fresh store. */
export function resetMockWorkflowStore(): void {
  singleton = new MockWorkflowStore();
}
