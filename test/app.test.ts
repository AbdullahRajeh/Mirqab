import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import type {
  DetectionListQuery,
  DetectionRecord,
  FrameResponse,
  MapPoint,
  StatsSummary,
  VideoSummary,
} from "../src/types";
import type { DetectionServiceContract } from "../src/services/detection-service";

class FakeService {
  async listVideos(): Promise<VideoSummary[]> {
    return [
      {
        video_id: "run_001",
        detection_count: 9,
        frame_count: 5,
        first_detection_sec: 2.85,
        last_detection_sec: 4.68,
      },
    ];
  }

  async listDetections(
    filters: DetectionListQuery,
  ): Promise<{ items: DetectionRecord[]; total: number; limit: number; offset: number }> {
    return {
      items: [
        {
          detection_id: "2411aabd",
          video_id: "run_001",
          frame_id: 241,
          video_timestamp_sec: 4.02,
          gps: { latitude: 26.222426, longitude: 44.135455 },
          confidence: 0.78,
          image_path: "runs/inference/run_001/frames/frame_0241.jpg",
          image_url: "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg",
        },
      ],
      total: 1,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  async getStats(): Promise<StatsSummary> {
    return {
      total_detections: 9,
      unique_videos: 1,
      unique_frames: 5,
      average_confidence: 0.517,
      min_confidence: 0.26,
      max_confidence: 0.78,
      per_video: [
        {
          video_id: "run_001",
          detection_count: 9,
          frame_count: 5,
          average_confidence: 0.517,
          first_detection_sec: 2.85,
          last_detection_sec: 4.68,
        },
      ],
    };
  }

  async getMapData(): Promise<{ videos: Array<{ video_id: string; points: MapPoint[] }> }> {
    return {
      videos: [
        {
          video_id: "run_001",
          points: [
            {
              frame_id: 171,
              video_timestamp_sec: 2.85,
              gps: { latitude: 26.2224174, longitude: 44.1354616 },
              detection_count: 1,
              max_confidence: 0.26,
              image_path: "runs/inference/run_001/frames/frame_0171.jpg",
              image_url: "http://localhost:3000/media/runs/inference/run_001/frames/frame_0171.jpg",
            },
          ],
        },
      ],
    };
  }

  async getFrame(videoId: string, frameId: number): Promise<FrameResponse> {
    if (videoId !== "run_001" || frameId !== 241) {
      const error = new Error("Frame not found") as Error & {
        statusCode?: number;
        code?: string;
      };
      error.statusCode = 404;
      error.code = "frame_not_found";
      throw error;
    }

    return {
      video_id: "run_001",
      frame_id: 241,
      video_timestamp_sec: 4.02,
      image_path: "runs/inference/run_001/frames/frame_0241.jpg",
      image_url: "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg",
      gps: { latitude: 26.222426, longitude: 44.135455 },
      detections: [
        {
          detection_id: "2411aabd",
          video_id: "run_001",
          frame_id: 241,
          video_timestamp_sec: 4.02,
          gps: { latitude: 26.222426, longitude: 44.135455 },
          confidence: 0.78,
          image_path: "runs/inference/run_001/frames/frame_0241.jpg",
          image_url: "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg",
        },
        {
          detection_id: "16fe7ce1",
          video_id: "run_001",
          frame_id: 241,
          video_timestamp_sec: 4.02,
          gps: { latitude: 26.222426, longitude: 44.135455 },
          confidence: 0.39,
          image_path: "runs/inference/run_001/frames/frame_0241.jpg",
          image_url: "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg",
        },
      ],
    };
  }
}

function createTestApp() {
  return createApp({ service: new FakeService() satisfies DetectionServiceContract });
}

test("GET /health returns ok", async () => {
  const app = createTestApp();
  const response = await request(app).get("/health");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("GET /api/v1/detections returns paginated items", async () => {
  const app = createTestApp();
  const response = await request(app)
    .get("/api/v1/detections")
    .query({ videoId: "run_001", minConfidence: 0.3, limit: 10, offset: 0 });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.limit, 10);
  assert.equal(response.body.offset, 0);
  assert.equal(response.body.items[0].video_id, "run_001");
});

test("GET /api/v1/detections rejects invalid confidence filters", async () => {
  const app = createTestApp();
  const response = await request(app)
    .get("/api/v1/detections")
    .query({ minConfidence: 0.9, maxConfidence: 0.2 });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, "invalid_query");
});

test("GET /api/v1/detections/stats returns summary cards", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/detections/stats");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.unique_frames, 5);
  assert.equal(response.body.per_video[0].detection_count, 9);
});

test("GET /api/v1/detections/map returns ordered map groups", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/detections/map");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.videos[0].video_id, "run_001");
  assert.equal(response.body.videos[0].points[0].frame_id, 171);
});

test("GET /api/v1/frames/:videoId/:frameId returns grouped frame data", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/frames/run_001/241");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.frame_id, 241);
  assert.equal(response.body.detections.length, 2);
});

test("GET /api/v1/frames/:videoId/:frameId returns not found for empty frame", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/frames/run_001/999");

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.code, "frame_not_found");
});

test("GET /api/v1/videos returns video summaries", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/videos");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.items[0].video_id, "run_001");
});
