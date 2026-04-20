"""
ocr_gps.py - GPS Extraction from Drone OSD Overlay

Post-processing step: reads saved frames from an inference run,
extracts GPS coordinates via OCR, and updates detections.json.

Usage:
  python scripts/ocr_gps.py --run runs/inference/ocr_test

Drone OSD layout: LON top-left, LAT top-right.
Uses EasyOCR (deep learning) on raw frames — works better than Tesseract
on thin white OSD text at low resolution.
"""

import argparse
import json
import os
import re
import sys
import cv2
import easyocr


def _parse_segments(segments):
    """
    Parse EasyOCR segments into a coordinate value.
    EasyOCR reads the OSD as separate text blocks, e.g.:
      ['LON', '4 4', '1 3 5 4 6 1 6']  -> 44.1354616
      ['LAT', '2 6', '2 2 2 8 9 1 4']  -> 26.2228914

    Strategy: strip the label (LON/LAT), join remaining segments,
    remove spaces, then split into integer part (2-3 digits) and
    decimal part (the rest).
    """
    # Filter out label segments
    digit_segments = []
    for seg in segments:
        cleaned = re.sub(r"[^0-9. ]", "", seg)
        if cleaned.strip():
            digit_segments.append(cleaned)

    if not digit_segments:
        return None

    # Join all digit segments, remove spaces and dots (reinsert dot later)
    digits = "".join(digit_segments).replace(" ", "").replace(".", "")

    # Need at least 6 digits for a meaningful coordinate (e.g. 26.2224)
    if len(digits) < 6:
        return None

    # Try 2-digit and 3-digit integer parts, pick the first valid one
    for int_len in [2, 3]:
        if len(digits) > int_len:
            try:
                val = float(f"{digits[:int_len]}.{digits[int_len:]}")
            except ValueError:
                continue
            if -180 <= val <= 180:
                return val

    return None


def extract_gps(frame, reader):
    """
    Extract GPS from drone OSD: LON top-left, LAT top-right.
    Returns {"latitude": float, "longitude": float} or None.
    """
    h, w = frame.shape[:2]

    top_h = int(h * 0.08)
    lon_crop = frame[0:top_h, 0:int(w * 0.35)]
    lat_crop = frame[0:top_h, int(w * 0.65):w]

    coords = {}
    for label, crop in [("longitude", lon_crop), ("latitude", lat_crop)]:
        scaled = cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        results = reader.readtext(scaled, detail=0, paragraph=False)
        val = _parse_segments(results)
        if val is not None:
            coords[label] = val

    if "latitude" in coords and "longitude" in coords:
        lat, lon = coords["latitude"], coords["longitude"]
        # Validate ranges
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return {"latitude": lat, "longitude": lon}
    return None


def run_ocr(run_dir):
    """Read detections.json, OCR each unique frame, update GPS fields."""
    json_path = os.path.join(run_dir, "detections.json")
    if not os.path.exists(json_path):
        print(f"ERROR: {json_path} not found")
        sys.exit(1)

    with open(json_path) as f:
        detections = json.load(f)

    if not detections:
        print("  No detections to process.")
        return

    # Group detections by frame to avoid OCR-ing the same frame twice
    frames = {}
    for det in detections:
        img = det["image_path"]
        if img not in frames:
            frames[img] = []
        frames[img].append(det)

    print(f"  Detections: {len(detections)}")
    print(f"  Unique frames: {len(frames)}")
    print()

    # Load EasyOCR model once
    print("  Loading OCR model...")
    reader = easyocr.Reader(["en"], gpu=True, verbose=False)
    print("  Ready.\n")

    success = 0
    failed = 0
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    for img_path, dets in frames.items():
        full_path = os.path.join(project_root, img_path)
        if not os.path.exists(full_path):
            print(f"  SKIP {img_path} (file not found)")
            failed += 1
            continue

        frame = cv2.imread(full_path)
        gps = extract_gps(frame, reader)

        frame_id = dets[0]["frame_id"]
        if gps:
            print(f"  frame {frame_id}: lat={gps['latitude']}, lon={gps['longitude']}")
            success += 1
        else:
            print(f"  frame {frame_id}: OCR failed")
            failed += 1

        for det in dets:
            det["gps"] = gps

    # Write updated detections
    with open(json_path, "w") as f:
        json.dump(detections, f, indent=2)

    print(f"\n  GPS extracted: {success}/{success + failed} frames")
    print(f"  Updated: {json_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract GPS from drone OSD overlay")
    parser.add_argument("--run", type=str, required=True, help="Path to inference run directory")
    args = parser.parse_args()
    run_ocr(args.run)
