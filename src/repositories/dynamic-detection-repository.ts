import type {
  DetectionRepositoryContract,
  DetectionRow,
  MapRow,
  PerVideoStatsRow,
  ReviewRecord,
  StatsSummaryRow,
  VideoRow,
} from "./detection-repository";
import type { DetectionListQuery } from "../types";

/**
 * Wraps a DetectionRepositoryContract and lets callers swap the inner
 * implementation at runtime (e.g. after a new pipeline run completes).
 */
export class DynamicDetectionRepository implements DetectionRepositoryContract {
  constructor(private inner: DetectionRepositoryContract) {}

  swap(next: DetectionRepositoryContract): void {
    this.inner = next;
  }

  listVideos(): Promise<VideoRow[]> {
    return this.inner.listVideos();
  }

  listDetections(filters: DetectionListQuery): Promise<{ rows: DetectionRow[]; total: number }> {
    return this.inner.listDetections(filters);
  }

  getStats(
    filters: DetectionListQuery,
  ): Promise<{ summary: StatsSummaryRow | undefined; perVideo: PerVideoStatsRow[] }> {
    return this.inner.getStats(filters);
  }

  getMapData(filters: DetectionListQuery): Promise<MapRow[]> {
    return this.inner.getMapData(filters);
  }

  getFrame(videoId: string, frameId: number): Promise<DetectionRow[]> {
    return this.inner.getFrame(videoId, frameId);
  }

  listReviews(): Promise<ReviewRecord[]> {
    return this.inner.listReviews();
  }

  setReview(
    detectionId: string,
    decision: "approved" | "rejected",
  ): Promise<ReviewRecord | null> {
    return this.inner.setReview(detectionId, decision);
  }
}
