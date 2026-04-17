import fs from "node:fs/promises";
import { config } from "../config";
import { getPool } from "./pool";

type SeedDetection = {
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
};

async function seed(): Promise<void> {
  const pool = getPool();
  const raw = await fs.readFile(config.sampleDataPath, "utf8");
  const detections = JSON.parse(raw) as SeedDetection[];

  for (const detection of detections) {
    const videoResult = await pool.query<{ id: number }>(
      `
        INSERT INTO videos (video_id)
        VALUES ($1)
        ON CONFLICT (video_id) DO UPDATE SET video_id = EXCLUDED.video_id
        RETURNING id
      `,
      [detection.video_id],
    );

    const videoRef = videoResult.rows[0].id;

    await pool.query(
      `
        INSERT INTO detections (
          detection_id,
          video_ref,
          frame_id,
          video_timestamp_sec,
          confidence,
          latitude,
          longitude,
          gps,
          image_path
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
          $8
        )
        ON CONFLICT (detection_id) DO UPDATE SET
          video_ref = EXCLUDED.video_ref,
          frame_id = EXCLUDED.frame_id,
          video_timestamp_sec = EXCLUDED.video_timestamp_sec,
          confidence = EXCLUDED.confidence,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          gps = EXCLUDED.gps,
          image_path = EXCLUDED.image_path
      `,
      [
        detection.detection_id,
        videoRef,
        detection.frame_id,
        detection.video_timestamp_sec,
        detection.confidence,
        detection.gps.latitude,
        detection.gps.longitude,
        detection.image_path,
      ],
    );
  }

  console.log(`Seeded ${detections.length} detections from ${config.sampleDataPath}`);
}

seed()
  .then(async () => {
    await getPool().end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    try {
      await getPool().end();
    } catch {
      // Ignore shutdown errors after a failed seed.
    }
    process.exitCode = 1;
  });
