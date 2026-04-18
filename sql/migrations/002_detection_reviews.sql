ALTER TABLE detections
  ADD COLUMN IF NOT EXISTS review_status TEXT
    CHECK (review_status IS NULL OR review_status IN ('approved', 'rejected'));

ALTER TABLE detections
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
