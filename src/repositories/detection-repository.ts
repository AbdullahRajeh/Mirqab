import type { Pool } from "pg";
import type { DetectionListQuery } from "../types";

export type DetectionRow = {
  detection_id: string;
  video_id: string;
  frame_id: number;
  video_timestamp_sec: string | number;
  confidence: string | number;
  latitude: string | number;
  longitude: string | number;
  image_path: string;
  total_count?: number;
};

export type VideoRow = {
  video_id: string;
  detection_count: number;
  frame_count: number;
  first_detection_sec: string | number | null;
  last_detection_sec: string | number | null;
};

export type StatsSummaryRow = {
  total_detections: number | null;
  unique_videos: number | null;
  unique_frames: number | null;
  average_confidence: string | number | null;
  min_confidence: string | number | null;
  max_confidence: string | number | null;
};

export type PerVideoStatsRow = {
  video_id: string;
  detection_count: number;
  frame_count: number;
  average_confidence: string | number | null;
  first_detection_sec: string | number | null;
  last_detection_sec: string | number | null;
};

export type MapRow = {
  video_id: string;
  frame_id: number;
  video_timestamp_sec: string | number;
  latitude: string | number;
  longitude: string | number;
  detection_count: number;
  max_confidence: string | number;
  image_path: string;
};

export type ReviewRecord = {
  detection_id: string;
  decision: "approved" | "rejected";
  reviewed_at: Date;
};

export interface DetectionRepositoryContract {
  listVideos(): Promise<VideoRow[]>;
  listDetections(filters: DetectionListQuery): Promise<{ rows: DetectionRow[]; total: number }>;
  getStats(
    filters: DetectionListQuery,
  ): Promise<{ summary: StatsSummaryRow | undefined; perVideo: PerVideoStatsRow[] }>;
  getMapData(filters: DetectionListQuery): Promise<MapRow[]>;
  getFrame(videoId: string, frameId: number): Promise<DetectionRow[]>;
  listReviews(): Promise<ReviewRecord[]>;
  setReview(
    detectionId: string,
    decision: "approved" | "rejected",
  ): Promise<ReviewRecord | null>;
}

const SORT_COLUMN_MAP: Record<DetectionListQuery["sortBy"], string> = {
  videoId: "v.video_id",
  timestampSec: "d.video_timestamp_sec",
  frameId: "d.frame_id",
  confidence: "d.confidence",
  detectionId: "d.detection_id",
};

export class DetectionRepository implements DetectionRepositoryContract {
  constructor(private readonly pool: Pool) {}

  async listVideos(): Promise<VideoRow[]> {
    const result = await this.pool.query<VideoRow>(`
      SELECT
        v.video_id,
        COUNT(d.id)::int AS detection_count,
        COUNT(DISTINCT d.frame_id)::int AS frame_count,
        MIN(d.video_timestamp_sec) AS first_detection_sec,
        MAX(d.video_timestamp_sec) AS last_detection_sec
      FROM videos v
      LEFT JOIN detections d ON d.video_ref = v.id
      GROUP BY v.id, v.video_id
      ORDER BY v.video_id ASC
    `);

    return result.rows;
  }

  private buildWhere(filters: DetectionListQuery): { values: Array<string | number>; whereClause: string } {
    const values: Array<string | number> = [];
    const conditions: string[] = [];

    if (filters.videoId) {
      values.push(filters.videoId);
      conditions.push(`v.video_id = $${values.length}`);
    }
    if (filters.minConfidence !== undefined) {
      values.push(filters.minConfidence);
      conditions.push(`d.confidence >= $${values.length}`);
    }
    if (filters.maxConfidence !== undefined) {
      values.push(filters.maxConfidence);
      conditions.push(`d.confidence <= $${values.length}`);
    }
    if (filters.frameId !== undefined) {
      values.push(filters.frameId);
      conditions.push(`d.frame_id = $${values.length}`);
    }
    if (filters.fromSec !== undefined) {
      values.push(filters.fromSec);
      conditions.push(`d.video_timestamp_sec >= $${values.length}`);
    }
    if (filters.toSec !== undefined) {
      values.push(filters.toSec);
      conditions.push(`d.video_timestamp_sec <= $${values.length}`);
    }

    return {
      values,
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    };
  }

  async listDetections(filters: DetectionListQuery): Promise<{ rows: DetectionRow[]; total: number }> {
    const { values, whereClause } = this.buildWhere(filters);
    const sortColumn = SORT_COLUMN_MAP[filters.sortBy];
    const sortDirection = filters.sortOrder.toUpperCase();

    values.push(filters.limit);
    const limitPlaceholder = `$${values.length}`;
    values.push(filters.offset);
    const offsetPlaceholder = `$${values.length}`;

    const result = await this.pool.query<DetectionRow>(
      `
        SELECT
          d.detection_id,
          v.video_id,
          d.frame_id,
          d.video_timestamp_sec,
          d.confidence,
          d.latitude,
          d.longitude,
          d.image_path,
          COUNT(*) OVER()::int AS total_count
        FROM detections d
        INNER JOIN videos v ON v.id = d.video_ref
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}, v.video_id ASC, d.video_timestamp_sec ASC, d.frame_id ASC, d.detection_id ASC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      values,
    );

    return {
      rows: result.rows,
      total: result.rows[0]?.total_count ?? 0,
    };
  }

  async getStats(
    filters: DetectionListQuery,
  ): Promise<{ summary: StatsSummaryRow | undefined; perVideo: PerVideoStatsRow[] }> {
    const { values, whereClause } = this.buildWhere(filters);

    const [summaryResult, perVideoResult] = await Promise.all([
      this.pool.query<StatsSummaryRow>(
        `
          SELECT
            COUNT(*)::int AS total_detections,
            COUNT(DISTINCT v.video_id)::int AS unique_videos,
            COUNT(DISTINCT (v.video_id, d.frame_id))::int AS unique_frames,
            ROUND(AVG(d.confidence)::numeric, 3) AS average_confidence,
            MIN(d.confidence) AS min_confidence,
            MAX(d.confidence) AS max_confidence
          FROM detections d
          INNER JOIN videos v ON v.id = d.video_ref
          ${whereClause}
        `,
        values,
      ),
      this.pool.query<PerVideoStatsRow>(
        `
          SELECT
            v.video_id,
            COUNT(*)::int AS detection_count,
            COUNT(DISTINCT d.frame_id)::int AS frame_count,
            ROUND(AVG(d.confidence)::numeric, 3) AS average_confidence,
            MIN(d.video_timestamp_sec) AS first_detection_sec,
            MAX(d.video_timestamp_sec) AS last_detection_sec
          FROM detections d
          INNER JOIN videos v ON v.id = d.video_ref
          ${whereClause}
          GROUP BY v.video_id
          ORDER BY v.video_id ASC
        `,
        values,
      ),
    ]);

    return {
      summary: summaryResult.rows[0],
      perVideo: perVideoResult.rows,
    };
  }

  async getMapData(filters: DetectionListQuery): Promise<MapRow[]> {
    const { values, whereClause } = this.buildWhere(filters);
    const result = await this.pool.query<MapRow>(
      `
        SELECT
          v.video_id,
          d.frame_id,
          d.video_timestamp_sec,
          d.latitude,
          d.longitude,
          COUNT(*)::int AS detection_count,
          MAX(d.confidence) AS max_confidence,
          MIN(d.image_path) AS image_path
        FROM detections d
        INNER JOIN videos v ON v.id = d.video_ref
        ${whereClause}
        GROUP BY v.video_id, d.frame_id, d.video_timestamp_sec, d.latitude, d.longitude
        ORDER BY v.video_id ASC, d.video_timestamp_sec ASC, d.frame_id ASC
      `,
      values,
    );

    return result.rows;
  }

  async getFrame(videoId: string, frameId: number): Promise<DetectionRow[]> {
    const result = await this.pool.query<DetectionRow>(
      `
        SELECT
          d.detection_id,
          v.video_id,
          d.frame_id,
          d.video_timestamp_sec,
          d.confidence,
          d.latitude,
          d.longitude,
          d.image_path
        FROM detections d
        INNER JOIN videos v ON v.id = d.video_ref
        WHERE v.video_id = $1 AND d.frame_id = $2
        ORDER BY d.detection_id ASC
      `,
      [videoId, frameId],
    );

    return result.rows;
  }

  async listReviews(): Promise<ReviewRecord[]> {
    const result = await this.pool.query<{
      detection_id: string;
      decision: "approved" | "rejected";
      reviewed_at: Date;
    }>(
      `
        SELECT
          d.detection_id,
          d.review_status AS decision,
          d.reviewed_at
        FROM detections d
        WHERE d.review_status IS NOT NULL
        ORDER BY d.reviewed_at DESC NULLS LAST, d.detection_id ASC
      `,
    );

    return result.rows.map((row) => ({
      detection_id: row.detection_id,
      decision: row.decision,
      reviewed_at: row.reviewed_at,
    }));
  }

  async setReview(
    detectionId: string,
    decision: "approved" | "rejected",
  ): Promise<ReviewRecord | null> {
    const result = await this.pool.query<{
      detection_id: string;
      decision: "approved" | "rejected";
      reviewed_at: Date;
    }>(
      `
        UPDATE detections
        SET review_status = $1, reviewed_at = NOW()
        WHERE detection_id = $2
        RETURNING detection_id, review_status AS decision, reviewed_at
      `,
      [decision, detectionId],
    );

    const [row] = result.rows;
    if (!row) {
      return null;
    }

    return {
      detection_id: row.detection_id,
      decision: row.decision,
      reviewed_at: row.reviewed_at,
    };
  }
}
