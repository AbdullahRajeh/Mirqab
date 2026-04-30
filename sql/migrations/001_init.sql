CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS videos (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE,
  source_path TEXT,
  started_at TIMESTAMPTZ,
  duration_sec NUMERIC(10, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detections (
  id BIGSERIAL PRIMARY KEY,
  detection_id TEXT NOT NULL UNIQUE,
  video_ref BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  frame_id INTEGER NOT NULL CHECK (frame_id >= 0),
  video_timestamp_sec NUMERIC(10, 3) NOT NULL CHECK (video_timestamp_sec >= 0),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  gps GEOGRAPHY(POINT, 4326) NOT NULL,
  image_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS detections_video_time_idx
  ON detections (video_ref, video_timestamp_sec, frame_id);

CREATE INDEX IF NOT EXISTS detections_video_confidence_idx
  ON detections (video_ref, confidence);

CREATE INDEX IF NOT EXISTS detections_frame_idx
  ON detections (video_ref, frame_id);

CREATE INDEX IF NOT EXISTS detections_gps_idx
  ON detections USING GIST (gps);
