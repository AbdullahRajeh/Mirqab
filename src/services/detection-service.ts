import type {
  DetectionListQuery,
  DetectionRecord,
  FrameResponse,
  MapPoint,
  StatsSummary,
  VideoSummary,
} from "../types";
import { HttpError } from "../utils/http-error";
import { buildImageUrl } from "../utils/image-url";
import type { DetectionRepositoryContract } from "../repositories/detection-repository";

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

export class DetectionService {
  constructor(
    private readonly repository: DetectionRepositoryContract,
    private readonly mediaBaseUrl: string,
  ) {}

  private serializeDetection(row: {
    detection_id: string;
    video_id: string;
    frame_id: number;
    video_timestamp_sec: string | number;
    confidence: string | number;
    latitude: string | number;
    longitude: string | number;
    image_path: string;
    review_status?: "approved" | "rejected" | null;
  }): DetectionRecord {
    return {
      detection_id: row.detection_id,
      video_id: row.video_id,
      frame_id: row.frame_id,
      video_timestamp_sec: Number(row.video_timestamp_sec),
      gps: {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      },
      confidence: Number(row.confidence),
      image_path: row.image_path,
      image_url: buildImageUrl(row.image_path, this.mediaBaseUrl),
      review_status: row.review_status,
    };
  }

  async listVideos(): Promise<VideoSummary[]> {
    const rows = await this.repository.listVideos();
    return rows.map((row) => ({
      video_id: row.video_id,
      detection_count: Number(row.detection_count),
      frame_count: Number(row.frame_count),
      first_detection_sec: toNumber(row.first_detection_sec),
      last_detection_sec: toNumber(row.last_detection_sec),
    }));
  }

  async listDetections(
    filters: DetectionListQuery,
  ): Promise<{ items: DetectionRecord[]; total: number; limit: number; offset: number }> {
    const result = await this.repository.listDetections(filters);
    return {
      items: result.rows.map((row) => this.serializeDetection(row)),
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  async getStats(filters: DetectionListQuery): Promise<StatsSummary> {
    const { summary, perVideo } = await this.repository.getStats(filters);

    return {
      total_detections: Number(summary?.total_detections ?? 0),
      unique_videos: Number(summary?.unique_videos ?? 0),
      unique_frames: Number(summary?.unique_frames ?? 0),
      average_confidence: toNumber(summary?.average_confidence),
      min_confidence: toNumber(summary?.min_confidence),
      max_confidence: toNumber(summary?.max_confidence),
      per_video: perVideo.map((row) => ({
        video_id: row.video_id,
        detection_count: Number(row.detection_count),
        frame_count: Number(row.frame_count),
        average_confidence: toNumber(row.average_confidence),
        first_detection_sec: toNumber(row.first_detection_sec),
        last_detection_sec: toNumber(row.last_detection_sec),
      })),
    };
  }

  async getMapData(
    filters: DetectionListQuery,
  ): Promise<{ videos: Array<{ video_id: string; points: MapPoint[] }> }> {
    const rows = await this.repository.getMapData(filters);
    const grouped = new Map<string, MapPoint[]>();

    for (const row of rows) {
      const points = grouped.get(row.video_id) ?? [];
      points.push({
        frame_id: row.frame_id,
        video_timestamp_sec: Number(row.video_timestamp_sec),
        gps: {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        },
        detection_count: Number(row.detection_count),
        max_confidence: Number(row.max_confidence),
        image_path: row.image_path,
        image_url: buildImageUrl(row.image_path, this.mediaBaseUrl),
        review_status: row.review_status,
      });
      grouped.set(row.video_id, points);
    }

    return {
      videos: Array.from(grouped.entries()).map(([video_id, points]) => ({ video_id, points })),
    };
  }

  private toReviewApiPayload(row: {
    detection_id: string;
    decision: "approved" | "rejected";
    reviewed_at: Date | string;
  }): { detection_id: string; decision: "approved" | "rejected"; updatedAt: string } {
    const reviewedAt =
      row.reviewed_at instanceof Date ? row.reviewed_at : new Date(row.reviewed_at);
    return {
      detection_id: row.detection_id,
      decision: row.decision,
      updatedAt: reviewedAt.toISOString(),
    };
  }

  async listReviews(): Promise<
    Array<{ detection_id: string; decision: "approved" | "rejected"; updatedAt: string }>
  > {
    const rows = await this.repository.listReviews();
    return rows.map((row) => this.toReviewApiPayload(row));
  }

  async setReview(
    detectionId: string,
    decision: "approved" | "rejected",
  ): Promise<{ detection_id: string; decision: "approved" | "rejected"; updatedAt: string }> {
    const row = await this.repository.setReview(detectionId, decision);
    if (!row) {
      throw new HttpError(404, "detection_not_found", "Detection not found");
    }
    return this.toReviewApiPayload(row);
  }

  async getFrame(videoId: string, frameId: number): Promise<FrameResponse> {
    const rows = await this.repository.getFrame(videoId, frameId);

    if (rows.length === 0) {
      throw new HttpError(404, "frame_not_found", "Frame not found");
    }

    const [first] = rows;
    return {
      video_id: first.video_id,
      frame_id: first.frame_id,
      video_timestamp_sec: Number(first.video_timestamp_sec),
      image_path: first.image_path,
      image_url: buildImageUrl(first.image_path, this.mediaBaseUrl),
      gps: {
        latitude: Number(first.latitude),
        longitude: Number(first.longitude),
      },
      detections: rows.map((row) => this.serializeDetection(row)),
    };
  }
}

export type DetectionServiceContract = Pick<
  DetectionService,
  | "listVideos"
  | "listDetections"
  | "getStats"
  | "getMapData"
  | "getFrame"
  | "listReviews"
  | "setReview"
>;
