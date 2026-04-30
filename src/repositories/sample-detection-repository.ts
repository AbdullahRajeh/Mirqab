import fs from "node:fs";
import type { DetectionListQuery } from "../types";
import type {
  DetectionRepositoryContract,
  DetectionRow,
  MapRow,
  PerVideoStatsRow,
  ReviewRecord,
  StatsSummaryRow,
  VideoRow,
} from "./detection-repository";

type SeedDetection = {
  detection_id: string;
  video_id: string;
  frame_id: number;
  video_timestamp_sec: number;
  gps: { latitude: number; longitude: number } | null;
  confidence: number;
  image_path: string;
};

const SORTERS: Record<
  DetectionListQuery["sortBy"],
  (left: SeedDetection, right: SeedDetection) => number
> = {
  videoId: (left, right) => left.video_id.localeCompare(right.video_id),
  timestampSec: (left, right) => left.video_timestamp_sec - right.video_timestamp_sec,
  frameId: (left, right) => left.frame_id - right.frame_id,
  confidence: (left, right) => left.confidence - right.confidence,
  detectionId: (left, right) => left.detection_id.localeCompare(right.detection_id),
};

export class SampleDetectionRepository implements DetectionRepositoryContract {
  private readonly detections: SeedDetection[];
  private readonly reviews = new Map<string, { decision: "approved" | "rejected"; reviewedAtMs: number }>();

  constructor(sampleDataPath: string) {
    const raw = fs.readFileSync(sampleDataPath, "utf8");
    this.detections = JSON.parse(raw) as SeedDetection[];
  }

  private filterDetections(filters: DetectionListQuery): SeedDetection[] {
    return this.detections.filter((detection) => {
      if (filters.videoId && detection.video_id !== filters.videoId) {
        return false;
      }
      if (
        filters.minConfidence !== undefined &&
        detection.confidence < filters.minConfidence
      ) {
        return false;
      }
      if (
        filters.maxConfidence !== undefined &&
        detection.confidence > filters.maxConfidence
      ) {
        return false;
      }
      if (filters.frameId !== undefined && detection.frame_id !== filters.frameId) {
        return false;
      }
      if (
        filters.fromSec !== undefined &&
        detection.video_timestamp_sec < filters.fromSec
      ) {
        return false;
      }
      if (filters.toSec !== undefined && detection.video_timestamp_sec > filters.toSec) {
        return false;
      }
      return true;
    });
  }

  private sortDetections(
    detections: SeedDetection[],
    filters: DetectionListQuery,
  ): SeedDetection[] {
    const direction = filters.sortOrder === "asc" ? 1 : -1;
    return [...detections].sort((left, right) => {
      const primary = SORTERS[filters.sortBy](left, right) * direction;
      if (primary !== 0) {
        return primary;
      }
      return (
        left.video_id.localeCompare(right.video_id) ||
        left.video_timestamp_sec - right.video_timestamp_sec ||
        left.frame_id - right.frame_id ||
        left.detection_id.localeCompare(right.detection_id)
      );
    });
  }

  private toRow(detection: SeedDetection): DetectionRow {
    return {
      detection_id: detection.detection_id,
      video_id: detection.video_id,
      frame_id: detection.frame_id,
      video_timestamp_sec: detection.video_timestamp_sec,
      confidence: detection.confidence,
      latitude: detection.gps?.latitude ?? 0,
      longitude: detection.gps?.longitude ?? 0,
      image_path: detection.image_path,
    };
  }

  async listVideos(): Promise<VideoRow[]> {
    const byVideo = new Map<string, SeedDetection[]>();

    for (const detection of this.detections) {
      const items = byVideo.get(detection.video_id) ?? [];
      items.push(detection);
      byVideo.set(detection.video_id, items);
    }

    return Array.from(byVideo.entries())
      .map(([video_id, items]) => ({
        video_id,
        detection_count: items.length,
        frame_count: new Set(items.map((item) => item.frame_id)).size,
        first_detection_sec: Math.min(...items.map((item) => item.video_timestamp_sec)),
        last_detection_sec: Math.max(...items.map((item) => item.video_timestamp_sec)),
      }))
      .sort((left, right) => left.video_id.localeCompare(right.video_id));
  }

  async listDetections(
    filters: DetectionListQuery,
  ): Promise<{ rows: DetectionRow[]; total: number }> {
    const filtered = this.sortDetections(this.filterDetections(filters), filters);
    const rows = filtered
      .slice(filters.offset, filters.offset + filters.limit)
      .map((detection) => ({
        ...this.toRow(detection),
        total_count: filtered.length,
      }));

    return {
      rows,
      total: filtered.length,
    };
  }

  async getStats(
    filters: DetectionListQuery,
  ): Promise<{ summary: StatsSummaryRow | undefined; perVideo: PerVideoStatsRow[] }> {
    const filtered = this.filterDetections(filters);
    const byVideo = new Map<string, SeedDetection[]>();

    for (const detection of filtered) {
      const items = byVideo.get(detection.video_id) ?? [];
      items.push(detection);
      byVideo.set(detection.video_id, items);
    }

    const summary: StatsSummaryRow = {
      total_detections: filtered.length,
      unique_videos: byVideo.size,
      unique_frames: new Set(filtered.map((item) => `${item.video_id}:${item.frame_id}`)).size,
      average_confidence:
        filtered.length > 0
          ? Number(
              (
                filtered.reduce((sum, item) => sum + item.confidence, 0) / filtered.length
              ).toFixed(3),
            )
          : null,
      min_confidence:
        filtered.length > 0 ? Math.min(...filtered.map((item) => item.confidence)) : null,
      max_confidence:
        filtered.length > 0 ? Math.max(...filtered.map((item) => item.confidence)) : null,
    };

    const perVideo = Array.from(byVideo.entries())
      .map(([video_id, items]) => ({
        video_id,
        detection_count: items.length,
        frame_count: new Set(items.map((item) => item.frame_id)).size,
        average_confidence: Number(
          (items.reduce((sum, item) => sum + item.confidence, 0) / items.length).toFixed(3),
        ),
        first_detection_sec: Math.min(...items.map((item) => item.video_timestamp_sec)),
        last_detection_sec: Math.max(...items.map((item) => item.video_timestamp_sec)),
      }))
      .sort((left, right) => left.video_id.localeCompare(right.video_id));

    return { summary, perVideo };
  }

  async getMapData(filters: DetectionListQuery): Promise<MapRow[]> {
    const filtered = this.filterDetections(filters);
    const grouped = new Map<string, SeedDetection[]>();

    for (const detection of filtered) {
      // Skip detections with no GPS — they have no map pin
      if (!detection.gps) continue;
      const key = [
        detection.video_id,
        detection.frame_id,
        detection.video_timestamp_sec,
        detection.gps.latitude,
        detection.gps.longitude,
      ].join(":");
      const items = grouped.get(key) ?? [];
      items.push(detection);
      grouped.set(key, items);
    }

    return Array.from(grouped.values())
      .map((items) => {
        const [first] = items;
        return {
          video_id: first.video_id,
          frame_id: first.frame_id,
          video_timestamp_sec: first.video_timestamp_sec,
          latitude: first.gps!.latitude,
          longitude: first.gps!.longitude,
          detection_count: items.length,
          max_confidence: Math.max(...items.map((item) => item.confidence)),
          image_path: [...items]
            .map((item) => item.image_path)
            .sort((left, right) => left.localeCompare(right))[0],
        };
      })
      .sort((left, right) => {
        return (
          left.video_id.localeCompare(right.video_id) ||
          Number(left.video_timestamp_sec) - Number(right.video_timestamp_sec) ||
          left.frame_id - right.frame_id
        );
      });
  }

  async getFrame(videoId: string, frameId: number): Promise<DetectionRow[]> {
    return this.detections
      .filter((detection) => detection.video_id === videoId && detection.frame_id === frameId)
      .sort((left, right) => left.detection_id.localeCompare(right.detection_id))
      .map((detection) => this.toRow(detection));
  }

  async listReviews(): Promise<ReviewRecord[]> {
    return [...this.reviews.entries()]
      .map(([detection_id, entry]) => ({
        detection_id,
        decision: entry.decision,
        reviewed_at: new Date(entry.reviewedAtMs),
      }))
      .sort((left, right) => right.reviewed_at.getTime() - left.reviewed_at.getTime());
  }

  async setReview(
    detectionId: string,
    decision: "approved" | "rejected",
  ): Promise<ReviewRecord | null> {
    if (!this.detections.some((d) => d.detection_id === detectionId)) {
      return null;
    }
    const reviewedAtMs = Date.now();
    this.reviews.set(detectionId, { decision, reviewedAtMs });
    return {
      detection_id: detectionId,
      decision,
      reviewed_at: new Date(reviewedAtMs),
    };
  }
}
