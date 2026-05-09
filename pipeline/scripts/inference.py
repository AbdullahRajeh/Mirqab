"""
inference.py - Pothole Detection Inference

Usage:
  python scripts/inference.py --model <weights> --input <source>

Supports: images, video files (.mp4 output), folders, webcam (device index).
Results saved to runs/inference/<name>/

GPS extraction is handled separately by ocr_gps.py as a post-processing step.
"""

import argparse
import json
import os
import sys
import time
import uuid
import cv2
import torch
from ultralytics import YOLO


def get_input_type(input_path):
    """Classify input as webcam, image, video, or folder."""
    if input_path.isdigit():
        return "webcam"
    if not os.path.exists(input_path):
        print(f"ERROR: path not found: {input_path}")
        sys.exit(1)
    if os.path.isdir(input_path):
        return "folder"

    ext = os.path.splitext(input_path)[1].lower()
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
    video_exts = {".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm"}

    if ext in image_exts:
        return "image"
    if ext in video_exts:
        return "video"
    return "image"


def run_image_inference(model, args, output_dir):
    """Run inference on a single image or folder of images."""
    results = model.predict(
        source=args.input,
        conf=args.conf,
        iou=args.iou,
        device=0 if torch.cuda.is_available() else "cpu",
        half=torch.cuda.is_available(),
        show=args.show,
        save=True,
        save_txt=args.save_txt,
        project=output_dir,
        name=args.name,
        line_width=2,
        verbose=False,
    )

    if not isinstance(results, list):
        results = [results]

    for r in results:
        n = len(r.boxes) if r.boxes is not None else 0
        fname = os.path.basename(r.path)
        if n > 0:
            print(f"  {fname}: {n} detection(s)")
            for i, box in enumerate(r.boxes):
                conf = box.conf.item()
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                print(f"    [{i+1}] conf={conf:.2f}  "
                      f"pos=({x1:.0f},{y1:.0f})  "
                      f"size={x2-x1:.0f}x{y2-y1:.0f}px")
        else:
            print(f"  {fname}: no detections")


def run_video_inference(model, args, output_dir):
    """
    Run inference on a video file or webcam stream.
    Writes annotated output as .mp4 (H.264).
    Prints frame number and detection count only for frames with detections.
    """
    source = int(args.input) if args.input.isdigit() else args.input
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        print(f"ERROR: cannot open video source: {source}")
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    # Prepare output path
    os.makedirs(os.path.join(output_dir, args.name), exist_ok=True)
    if isinstance(source, int):
        out_filename = "webcam_output.mp4"
    else:
        base = os.path.splitext(os.path.basename(args.input))[0]
        out_filename = f"{base}_detected.mp4"
    out_path = os.path.join(output_dir, args.name, out_filename)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    if not writer.isOpened():
        print(f"ERROR: cannot create output video: {out_path}")
        sys.exit(1)

    # Prepare frames directory and detections list
    run_dir = os.path.join(output_dir, args.name)
    frames_dir = os.path.join(run_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)
    json_path = os.path.join(run_dir, "detections.json")
    detections = []
    skip = args.skip_frames
    device = 0 if torch.cuda.is_available() else "cpu"

    # Get total frame count upfront for progress reporting
    cap = cv2.VideoCapture(source)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    total_to_process = max(1, (total_frames + skip - 1) // skip)
    print(f"TOTAL_FRAMES:{total_frames}", flush=True)
    cap.release()

    # Read frames manually so we can skip redundant ones
    cap = cv2.VideoCapture(source)
    frame_idx = 0
    processed = 0
    start = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        # Skip frames: only process every Nth frame
        if skip > 1 and frame_idx % skip != 1:
            writer.write(frame)
            continue

        # Run YOLO on this single frame
        results = model.predict(
            source=frame,
            conf=args.conf,
            iou=args.iou,
            device=device,
            half=torch.cuda.is_available(),
            save=False,
            line_width=2,
            verbose=False,
        )
        r = results[0]
        processed += 1
        n = len(r.boxes) if r.boxes is not None else 0

        annotated = r.plot()
        writer.write(annotated)

        if n > 0:
            timestamp_sec = round(frame_idx / fps, 2)
            frame_filename = f"frame_{frame_idx:04d}.jpg"
            frame_path = os.path.join(frames_dir, frame_filename)
            cv2.imwrite(frame_path, annotated)

            for box in r.boxes:
                detections.append({
                    "detection_id": uuid.uuid4().hex[:8],
                    "video_id": args.name,
                    "frame_id": frame_idx,
                    "video_timestamp_sec": timestamp_sec,
                    "gps": None,
                    "confidence": round(box.conf.item(), 2),
                    "image_path": os.path.join("runs", "inference", args.name, "frames", frame_filename).replace("\\", "/"),
                })

        # Report real progress after every processed frame
        print(f"PROGRESS:{processed}/{total_to_process}", flush=True)

        # Write JSON incrementally so partial results survive if the process is killed
        with open(json_path, "w") as f:
            json.dump(detections, f, indent=2)

        if args.show:
            cv2.imshow("Pothole Detection", annotated)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    writer.release()
    if args.show:
        try:
            cv2.destroyAllWindows()
        except cv2.error:
            pass
    elapsed = time.time() - start

    print(f"\n  Total frames: {frame_idx}")
    print(f"  Processed: {processed} (skip={skip})")
    print(f"  Detections: {len(detections)}")
    print(f"  Processing speed: {processed / elapsed:.1f} FPS")
    print(f"  Output saved: {out_path}")
    print(f"  Detections JSON: {json_path}")


def run_inference(args):
    """Load model and dispatch to the appropriate inference handler."""
    if not os.path.exists(args.model):
        print(f"ERROR: model not found: {args.model}")
        sys.exit(1)

    if torch.cuda.is_available():
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

    model = YOLO(args.model)
    input_type = get_input_type(args.input)
    output_dir = os.path.join(args.project_root, "runs", "inference")

    print(f"  Model:  {args.model}")
    print(f"  Input:  {args.input} ({input_type})")
    print(f"  Conf:   {args.conf}")
    print(f"  Device: {'cuda' if torch.cuda.is_available() else 'cpu'}")
    print()

    if input_type in ("video", "webcam"):
        run_video_inference(model, args, output_dir)
    else:
        run_image_inference(model, args, output_dir)


def parse_args():
    parser = argparse.ArgumentParser(description="Pothole Detection Inference")
    parser.add_argument("--model", type=str, required=True, help="Path to model weights (.pt)")
    parser.add_argument("--input", type=str, required=True, help="Image, video, folder, or device index")
    parser.add_argument("--conf", type=float, default=0.21, help="Confidence threshold (default: 0.25)")
    parser.add_argument("--iou", type=float, default=0.50, help="NMS IoU threshold (default: 0.45)")
    parser.add_argument("--show", action="store_true", help="Display live preview window")
    parser.add_argument("--save-txt", action="store_true", help="Save detection labels as .txt")
    parser.add_argument("--skip-frames", type=int, default=1, help="Process every Nth frame (default: 1 = all frames)")
    parser.add_argument("--name", type=str, default="pothole_results", help="Run name (default: pothole_results)")
    args = parser.parse_args()
    args.project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return args


if __name__ == "__main__":
    args = parse_args()
    run_inference(args)
