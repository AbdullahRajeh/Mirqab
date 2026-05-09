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
import glob
import json
import math
import os
import re
import sys
import cv2
import easyocr


V_MAX_MPS = 30.0
HEARTBEAT_INTERVAL_SEC = 30.0
CLUSTER_SIZE = 5
CLUSTER_AGREE_M = 50.0
CLUSTER_MIN_AGREE = 3
CONE_EPSILON_M = 50.0

try:
    import torch
except ImportError:
    torch = None


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


def _haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _find_video(run_dir):
    matches = glob.glob(os.path.join(run_dir, "*_detected.mp4"))
    return matches[0] if matches else None


def _ocr_at(cap, frame_idx, fps, reader):
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ok, frame = cap.read()
    if not ok or frame is None:
        return None
    gps = extract_gps(frame, reader)
    if not gps:
        return None
    return {"t": frame_idx / fps, "lat": gps["latitude"], "lon": gps["longitude"]}


def _cluster_anchor(readings):
    # Frames milliseconds apart must be near-identical in space; pick the largest
    # subset that agrees within CLUSTER_AGREE_M, return its median position.
    if not readings:
        return None
    best = []
    for ref in readings:
        agreeing = [r for r in readings
                    if _haversine_m(ref["lat"], ref["lon"], r["lat"], r["lon"]) <= CLUSTER_AGREE_M]
        if len(agreeing) > len(best):
            best = agreeing
    if len(best) < CLUSTER_MIN_AGREE:
        return None
    lats = sorted(r["lat"] for r in best)
    lons = sorted(r["lon"] for r in best)
    ts = sorted(r["t"] for r in best)
    mid = len(best) // 2
    return {"t": ts[mid], "lat": lats[mid], "lon": lons[mid]}


def _validate_cone(lat, lon, t, anchors):
    nearest = min(anchors, key=lambda a: abs(a["t"] - t))
    dt = abs(nearest["t"] - t)
    max_r = V_MAX_MPS * dt + CONE_EPSILON_M
    return _haversine_m(lat, lon, nearest["lat"], nearest["lon"]) <= max_r


def _interpolate(t, anchors):
    if not anchors:
        return None, None
    prev_a = None
    next_a = None
    for a in anchors:
        if a["t"] <= t:
            prev_a = a
        if a["t"] >= t and next_a is None:
            next_a = a
    if prev_a and next_a and prev_a is not next_a:
        span = next_a["t"] - prev_a["t"]
        frac = (t - prev_a["t"]) / span if span > 0 else 0.0
        return (
            {
                "latitude": prev_a["lat"] + frac * (next_a["lat"] - prev_a["lat"]),
                "longitude": prev_a["lon"] + frac * (next_a["lon"] - prev_a["lon"]),
            },
            "interpolated",
        )
    a = prev_a or next_a
    return {"latitude": a["lat"], "longitude": a["lon"]}, "extrapolated"


def _collect_anchors(video_path, reader):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        return []
    duration = total / fps

    anchors = []

    start_readings = []
    for i in range(min(CLUSTER_SIZE, total)):
        r = _ocr_at(cap, i, fps, reader)
        if r:
            start_readings.append(r)
    start_anchor = _cluster_anchor(start_readings)
    if start_anchor:
        anchors.append(start_anchor)

    last = anchors[-1] if anchors else None
    t = HEARTBEAT_INTERVAL_SEC
    while t < duration - HEARTBEAT_INTERVAL_SEC:
        idx = int(t * fps)
        if 0 <= idx < total:
            r = _ocr_at(cap, idx, fps, reader)
            if r and (last is None or _validate_cone(r["lat"], r["lon"], r["t"], [last])):
                anchors.append(r)
                last = r
        t += HEARTBEAT_INTERVAL_SEC

    end_readings = []
    for i in range(min(CLUSTER_SIZE, total)):
        idx = total - 1 - i
        if idx < 0:
            break
        r = _ocr_at(cap, idx, fps, reader)
        if r:
            end_readings.append(r)
    end_anchor = _cluster_anchor(end_readings)
    if end_anchor and (not anchors or end_anchor["t"] > anchors[-1]["t"]):
        anchors.append(end_anchor)

    cap.release()
    anchors.sort(key=lambda a: a["t"])
    return anchors


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

    print("  Loading OCR model...")
    use_gpu = bool(torch and torch.cuda.is_available())
    reader = easyocr.Reader(["en"], gpu=use_gpu, verbose=False)
    print("  Ready.\n")

    video_path = _find_video(run_dir)
    anchors = []
    if video_path:
        print(f"  Building anchor track from {os.path.basename(video_path)}...")
        anchors = _collect_anchors(video_path, reader)
        print(f"  Anchors: {len(anchors)}\n")
    else:
        print("  WARN: no *_detected.mp4 found; cone validation disabled.\n")

    ocr_used = 0
    interp_used = 0
    failed = 0
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    for img_path, dets in frames.items():
        full_path = os.path.join(project_root, img_path)
        frame_id = dets[0]["frame_id"]
        t = dets[0].get("video_timestamp_sec", 0.0)

        gps = None
        if os.path.exists(full_path):
            frame = cv2.imread(full_path)
            if frame is not None:
                gps = extract_gps(frame, reader)
        else:
            print(f"  SKIP {img_path} (file not found)")

        source = None
        if gps and (not anchors or _validate_cone(gps["latitude"], gps["longitude"], t, anchors)):
            source = "ocr"
            ocr_used += 1
            print(f"  frame {frame_id}: lat={gps['latitude']}, lon={gps['longitude']} [ocr]")
        elif anchors:
            est, source = _interpolate(t, anchors)
            if est:
                gps = est
                interp_used += 1
                print(f"  frame {frame_id}: lat={gps['latitude']:.6f}, lon={gps['longitude']:.6f} [{source}]")
            else:
                gps = None
                source = None
                failed += 1
                print(f"  frame {frame_id}: no GPS")
        else:
            failed += 1
            print(f"  frame {frame_id}: OCR failed, no anchors")

        for det in dets:
            det["gps"] = gps
            det["gps_source"] = source

    with open(json_path, "w") as f:
        json.dump(detections, f, indent=2)

    print(f"\n  GPS: {ocr_used} ocr / {interp_used} from anchors / {failed} failed (of {len(frames)} frames)")
    print(f"  Updated: {json_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract GPS from drone OSD overlay")
    parser.add_argument("--run", type=str, required=True, help="Path to inference run directory")
    args = parser.parse_args()
    run_ocr(args.run)
