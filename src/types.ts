export interface DetectionRecord {
  detection_id: string;
  video_id: string;
  frame_id: number;
  video_timestamp_sec: number;
  gps: {
    latitude: number;
    longitude: number;
  };
  confidence: number;
  image_path: string;
  image_url: string;
}

export interface DetectionListQuery {
  videoId?: string;
  minConfidence?: number;
  maxConfidence?: number;
  frameId?: number;
  fromSec?: number;
  toSec?: number;
  limit: number;
  offset: number;
  sortBy: "videoId" | "timestampSec" | "frameId" | "confidence" | "detectionId";
  sortOrder: "asc" | "desc";
}

export interface VideoSummary {
  video_id: string;
  detection_count: number;
  frame_count: number;
  first_detection_sec: number | null;
  last_detection_sec: number | null;
}

export interface VideoStatsSummary extends VideoSummary {
  average_confidence: number | null;
}

export interface StatsSummary {
  total_detections: number;
  unique_videos: number;
  unique_frames: number;
  average_confidence: number | null;
  min_confidence: number | null;
  max_confidence: number | null;
  per_video: VideoStatsSummary[];
}

export interface MapPoint {
  frame_id: number;
  video_timestamp_sec: number;
  gps: {
    latitude: number;
    longitude: number;
  };
  detection_count: number;
  max_confidence: number;
  image_path: string;
  image_url: string;
}

export interface FrameResponse {
  video_id: string;
  frame_id: number;
  video_timestamp_sec: number;
  image_path: string;
  image_url: string;
  gps: {
    latitude: number;
    longitude: number;
  };
  detections: DetectionRecord[];
}

export interface AuthSessionUser {
  username: string;
  role: "admin";
}

declare module "express-session" {
  interface SessionData {
    adminUser?: AuthSessionUser;
  }
}
