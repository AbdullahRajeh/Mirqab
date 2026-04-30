"""
============================================================
validate.py - Model Evaluation Script
============================================================
Evaluate your trained model on the test set.
Generates detailed metrics: mAP, precision, recall, F1-score.

USAGE:
  python scripts/validate.py --model runs/train/pothole_detection/weights/best.pt

OUTPUTS:
  - Confusion matrix
  - Precision-Recall curves
  - F1 curve
  - Per-class metrics
============================================================
"""

import argparse
import os
import sys
import yaml
import torch


def validate(args):
    """
    Run validation/evaluation on the test set.

    This gives you the real performance numbers for your model:
    - mAP@50: Mean Average Precision at IoU 0.50
    - mAP@50-95: Mean Average Precision across IoU 0.50 to 0.95
    - Precision: How many detections are correct
    - Recall: How many real potholes were found
    """
    from ultralytics import YOLO

    if not os.path.exists(args.model):
        print(f"  ERROR: Model not found: {args.model}")
        sys.exit(1)

    # Load trained model
    model = YOLO(args.model)

    # Load dataset config to get test set path
    dataset_yaml = os.path.join(args.project_root, "configs", "pothole_dataset.yaml")

    if not os.path.exists(dataset_yaml):
        print(f"  ERROR: Dataset config not found: {dataset_yaml}")
        print("  Run training first to set up the dataset.")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("MODEL VALIDATION")
    print("=" * 60)
    print(f"  Model: {args.model}")
    print(f"  Dataset config: {dataset_yaml}")
    print(f"  Split: {args.split}")
    print("=" * 60 + "\n")

    # Run validation
    # 'split' can be "val" or "test"
    results = model.val(
        data=dataset_yaml,
        split=args.split,
        conf=args.conf,
        device=0 if torch.cuda.is_available() else "cpu",
        half=torch.cuda.is_available(),
        plots=True,       # Generate confusion matrix, PR curves, etc.
        project=os.path.join(args.project_root, "runs", "validate"),
        name=args.name,
        verbose=True,
    )

    # Display key metrics
    print("\n" + "=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print(f"  mAP@50:    {results.box.map50:.4f}")
    print(f"  mAP@50-95: {results.box.map:.4f}")
    print(f"  Precision:  {results.box.mp:.4f}")
    print(f"  Recall:     {results.box.mr:.4f}")
    print(f"\n  Detailed plots saved to: runs/validate/{args.name}/")
    print("=" * 60 + "\n")

    return results


def parse_args():
    parser = argparse.ArgumentParser(description="Validate Pothole Detection Model")

    parser.add_argument(
        "--model", type=str, required=True,
        help="Path to trained model weights (.pt file)"
    )

    parser.add_argument(
        "--conf", type=float, default=0.001,
        help="Confidence threshold (default: 0.001)"
    )

    parser.add_argument(
        "--split", type=str, default="test",
        choices=["val", "test"],
        help="Dataset split to evaluate on (default: test)"
    )
    parser.add_argument(
        "--name", type=str, default="pothole_eval",
        help="Name for this validation run"
    )

    args = parser.parse_args()
    args.project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return args


if __name__ == "__main__":
    args = parse_args()
    validate(args)
