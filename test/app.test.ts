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
import { resetMockWorkflowStore } from "../src/services/mock-workflow-store";
import { HttpError } from "../src/utils/http-error";

class FakeService {
  private readonly reviewStore = new Map<
    string,
    { decision: "approved" | "rejected"; updatedAtMs: number }
  >();
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

  async listReviews(): Promise<
    Array<{ detection_id: string; decision: "approved" | "rejected"; updatedAt: string }>
  > {
    return [...this.reviewStore.entries()]
      .map(([detection_id, entry]) => ({
        detection_id,
        decision: entry.decision,
        updatedAt: new Date(entry.updatedAtMs).toISOString(),
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async setReview(
    detectionId: string,
    decision: "approved" | "rejected",
  ): Promise<{ detection_id: string; decision: "approved" | "rejected"; updatedAt: string }> {
    const known = new Set(["2411aabd", "16fe7ce1"]);
    if (!known.has(detectionId)) {
      throw new HttpError(404, "detection_not_found", "Detection not found");
    }
    const updatedAtMs = Date.now();
    this.reviewStore.set(detectionId, { decision, updatedAtMs });
    return {
      detection_id: detectionId,
      decision,
      updatedAt: new Date(updatedAtMs).toISOString(),
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

async function loginAsAdmin(agent: ReturnType<typeof request.agent>): Promise<void> {
  const response = await agent
    .post("/auth/login")
    .set("Content-Type", "application/json")
    .send({ username: "admin", password: "admin123" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
}

test("GET /health returns ok", async () => {
  const app = createTestApp();
  const response = await request(app).get("/health");
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.ok(["missing", "lfs_pointer", "ready"].includes(response.body.pipeline?.model));
});

test("GET /dashboard is public for unauthenticated viewers", async () => {
  const app = createTestApp();
  const response = await request(app).get("/dashboard");

  assert.equal(response.statusCode, 200);
  assert.match(response.text, /MIRQAB/);
});

test("GET /api/v1/detections is now public", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/detections");

  assert.equal(response.statusCode, 200);
});

test("POST /auth/login rejects invalid credentials", async () => {
  const app = createTestApp();
  const response = await request(app)
    .post("/auth/login")
    .set("Content-Type", "application/json")
    .send({ username: "admin", password: "wrong" });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, "invalid_credentials");
});

test("POST /auth/logout invalidates session", async () => {
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const logoutResponse = await agent.post("/auth/logout");
  assert.equal(logoutResponse.statusCode, 200);

  // Use a protected endpoint to verify logout
  const response = await agent.get("/api/v1/detections/reviews");
  assert.equal(response.statusCode, 401);
});

test("GET /api/v1/detections returns paginated items", async () => {
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const response = await agent
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
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const response = await agent
    .get("/api/v1/detections")
    .query({ minConfidence: 0.9, maxConfidence: 0.2 });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, "invalid_query");
});

test("GET /api/v1/detections/stats returns summary cards", async () => {
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const response = await agent.get("/api/v1/detections/stats");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.unique_frames, 5);
  assert.equal(response.body.per_video[0].detection_count, 9);
});

test("GET /api/v1/detections/map returns ordered map groups", async () => {
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const response = await agent.get("/api/v1/detections/map");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.videos[0].video_id, "run_001");
  assert.equal(response.body.videos[0].points[0].frame_id, 171);
});

test("GET /api/v1/frames/:videoId/:frameId returns grouped frame data", async () => {
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const response = await agent.get("/api/v1/frames/run_001/241");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.frame_id, 241);
  assert.equal(response.body.detections.length, 2);
});

test("GET /api/v1/frames/:videoId/:frameId returns not found for empty frame", async () => {
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const response = await agent.get("/api/v1/frames/run_001/999");

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.code, "frame_not_found");
});

test("GET /api/v1/videos returns video summaries", async () => {
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const response = await agent.get("/api/v1/videos");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.items[0].video_id, "run_001");
});

test("mock workflow routes return 401 without admin session", async () => {
  resetMockWorkflowStore();
  const app = createTestApp();

  const upload = await request(app).post("/api/v1/mock/videos/upload").send({ fileName: "a.mp4" });
  assert.equal(upload.statusCode, 401);

  const status = await request(app).get("/api/v1/mock/videos/upload/upl_x");
  assert.equal(status.statusCode, 401);

  const review = await request(app).patch("/api/v1/detections/abc/review").send({ decision: "approved" });
  assert.equal(review.statusCode, 401);

  const list = await request(app).get("/api/v1/detections/reviews");
  assert.equal(list.statusCode, 401);
});

test("POST /api/v1/mock/videos/upload and GET status succeed when authenticated", async () => {
  resetMockWorkflowStore();
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const created = await agent.post("/api/v1/mock/videos/upload").send({ fileName: "clip.mp4", sizeBytes: 4096 });
  assert.equal(created.statusCode, 201);
  assert.match(created.body.uploadId, /^upl_/);
  assert.match(created.body.videoId, /^mock_vid_/);
  assert.equal(created.body.status, "queued");

  const uploadId = created.body.uploadId as string;
  const polled = await agent.get(`/api/v1/mock/videos/upload/${uploadId}`);
  assert.equal(polled.statusCode, 200);
  assert.equal(polled.body.uploadId, uploadId);
  assert.ok(polled.body.progress >= 0);
});

test("PATCH /api/v1/detections/:id/review and GET reviews succeed when authenticated", async () => {
  resetMockWorkflowStore();
  const app = createTestApp();
  const agent = request.agent(app);
  await loginAsAdmin(agent);

  const patch = await agent.patch("/api/v1/detections/2411aabd/review").send({ decision: "rejected" });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.body.detection_id, "2411aabd");
  assert.equal(patch.body.decision, "rejected");

  const list = await agent.get("/api/v1/detections/reviews");
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].detection_id, "2411aabd");
});
