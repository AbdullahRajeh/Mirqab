"""
============================================================
train.py - Pothole Detection Model Training Script
============================================================
This script handles:
  1. Downloading the MWPD dataset from Kaggle
  2. Auto-detecting and fixing the dataset folder structure
  3. Training a YOLOv8 model optimized for your RTX 3060
  4. Saving the best model weights for inference

USAGE:
  python scripts/train.py
  python scripts/train.py --epochs 50 --batch 8
  python scripts/train.py --model yolov8s.pt --resume

REQUIREMENTS:
  - Kaggle API key configured (~/.kaggle/kaggle.json)
  - NVIDIA GPU with CUDA support
  - Dependencies from requirements.txt installed
============================================================
"""

import argparse
import os
import sys
import shutil
import glob
import yaml
import torch


def check_gpu():
    """
    Verify that CUDA (GPU support) is available.
    Prints GPU info so you can confirm the 3060 is detected.
    """
    print("\n" + "=" * 60)
    print("GPU STATUS CHECK")
    print("=" * 60)

    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram_total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"  GPU Found: {gpu_name}")
        print(f"  VRAM: {vram_total:.1f} GB")
        print(f"  CUDA Version: {torch.version.cuda}")
        print(f"  PyTorch CUDA: {torch.cuda.is_available()}")

        # Enable TF32 for faster matrix operations on Ampere GPUs
        # RTX 3060 is Ampere architecture - this gives ~2x speedup
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        print(f"  TF32 Enabled: True (Ampere optimization)")
    else:
        print("  WARNING: No GPU detected! Training will be very slow on CPU.")
        print("  Make sure CUDA toolkit and cuDNN are installed.")
    print("=" * 60 + "\n")


def download_dataset(dataset_handle, data_dir):
    """
    Download the MWPD dataset from Kaggle using the Kaggle API.

    SETUP REQUIRED (one-time):
      1. Go to kaggle.com -> Account -> Create New API Token
      2. Save the downloaded kaggle.json to:
         - Windows: C:\\Users\\<you>\\.kaggle\\kaggle.json
         - Linux/Mac: ~/.kaggle/kaggle.json

    Args:
        dataset_handle: Kaggle dataset identifier
            (e.g., "jocelyndumlao/multi-weather-pothole-detection-mwpd")
        data_dir: Local directory to save the dataset
    """
    print("\n" + "=" * 60)
    print("DATASET DOWNLOAD")
    print("=" * 60)

    # Check if dataset already exists to avoid re-downloading
    if os.path.exists(data_dir) and any(os.scandir(data_dir)):
        print(f"  Dataset already exists at: {data_dir}")
        print("  Skipping download. Delete the folder to re-download.")
        return

    try:
        from kaggle.api.kaggle_api_extended import KaggleApi

        # Authenticate with your Kaggle API key
        api = KaggleApi()
        api.authenticate()

        print(f"  Downloading: {dataset_handle}")
        print(f"  Destination: {data_dir}")
        print("  This may take a few minutes depending on your connection...")

        # Download and unzip the dataset
        os.makedirs(data_dir, exist_ok=True)
        api.dataset_download_files(
            dataset_handle,
            path=data_dir,
            unzip=True  # Automatically extract the ZIP
        )
        print("  Download complete!")

    except ImportError:
        print("  ERROR: kaggle package not installed.")
        print("  Run: pip install kaggle")
        sys.exit(1)
    except Exception as e:
        print(f"  ERROR: {e}")
        print("\n  TROUBLESHOOTING:")
        print("  1. Check that ~/.kaggle/kaggle.json exists")
        print("  2. Check your internet connection")
        print("  3. Verify the dataset handle is correct")
        sys.exit(1)

    print("=" * 60 + "\n")


def find_and_fix_dataset(data_dir, yaml_path):
    """
    Auto-detect the dataset structure and update the YAML config.

    The MWPD dataset from Kaggle typically extracts to a structure like:
      data/MWPD/
        ├── train/
        │   ├── images/
        │   └── labels/
        ├── valid/
        │   ├── images/
        │   └── labels/
        └── test/
            ├── images/
            └── labels/

    This function searches for this structure even if there are
    extra nested folders, then updates the YAML config to point
    to the correct paths.

    Args:
        data_dir: Root data directory where Kaggle downloaded files
        yaml_path: Path to the dataset YAML config to update
    """
    print("\n" + "=" * 60)
    print("DATASET STRUCTURE DETECTION")
    print("=" * 60)

    # Search for the 'train/images' directory pattern
    # This handles cases where Kaggle adds extra nested folders
    train_images_dirs = glob.glob(
        os.path.join(data_dir, "**/train/images"),
        recursive=True
    )

    if not train_images_dirs:
        print(f"  ERROR: Could not find 'train/images' inside {data_dir}")
        print("  Expected YOLO format: train/images/, valid/images/, test/images/")
        print("\n  Please check the dataset structure manually:")
        print(f"  ls -la {data_dir}")
        sys.exit(1)

    # Use the first match and go up two levels to get the dataset root
    dataset_root = os.path.dirname(os.path.dirname(train_images_dirs[0]))
    abs_dataset_root = os.path.abspath(dataset_root)

    print(f"  Found dataset root: {abs_dataset_root}")

    # Verify all expected folders exist
    expected_splits = {
        "train": ["images", "labels"],
        "valid": ["images", "labels"],
        "test": ["images", "labels"],
    }

    for split, subfolders in expected_splits.items():
        split_path = os.path.join(abs_dataset_root, split)
        if os.path.exists(split_path):
            for sub in subfolders:
                sub_path = os.path.join(split_path, sub)
                if os.path.exists(sub_path):
                    file_count = len(os.listdir(sub_path))
                    print(f"  {split}/{sub}: {file_count} files")
                else:
                    print(f"  WARNING: Missing {split}/{sub}")
        else:
            # Some datasets use 'val' instead of 'valid'
            alt_split = "val" if split == "valid" else split
            alt_path = os.path.join(abs_dataset_root, alt_split)
            if os.path.exists(alt_path):
                print(f"  Found '{alt_split}' instead of '{split}' - OK")
            else:
                print(f"  WARNING: Missing split folder: {split}")

    # Update the YAML config with the absolute path
    with open(yaml_path, "r") as f:
        config = yaml.safe_load(f)

    config["path"] = abs_dataset_root

    # Auto-detect if validation folder is 'val' or 'valid'
    if os.path.exists(os.path.join(abs_dataset_root, "valid")):
        config["val"] = "valid/images"
    elif os.path.exists(os.path.join(abs_dataset_root, "val")):
        config["val"] = "val/images"

    with open(yaml_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    print(f"\n  Updated config: {yaml_path}")
    print(f"  Dataset path set to: {abs_dataset_root}")
    print("=" * 60 + "\n")

    return abs_dataset_root


def train(args):
    """
    Main training function.

    This loads the YOLOv8 model, applies your training config,
    and starts the training loop. All GPU optimizations are
    applied automatically.

    Args:
        args: Parsed command-line arguments
    """
    # Delayed import so GPU check happens first
    from ultralytics import YOLO

    # ---- Load training config ----
    config_path = os.path.join(args.project_root, "configs", "training_config.yaml")
    with open(config_path, "r") as f:
        train_config = yaml.safe_load(f)

    # Command-line args override config file values
    epochs = args.epochs or train_config.get("epochs", 100)
    batch = args.batch or train_config.get("batch", 16)
    imgsz = args.imgsz or train_config.get("imgsz", 640)
    model_name = args.model or train_config.get("model", "yolov8m.pt")
    device = train_config.get("device", 0)

    # ---- Dataset setup ----
    dataset_yaml = os.path.join(args.project_root, "configs", "pothole_dataset.yaml")
    data_dir = os.path.join(args.project_root, "data", "MWPD")

    # Download dataset if not already present
    if not args.skip_download:
        download_dataset(
            "jocelyndumlao/multi-weather-pothole-detection-mwpd",
            data_dir
        )

    # Fix dataset paths in the YAML config
    find_and_fix_dataset(data_dir, dataset_yaml)

    # ---- Load YOLO model ----
    print("\n" + "=" * 60)
    print("MODEL SETUP")
    print("=" * 60)

    if args.resume and os.path.exists(args.resume):
        # Resume from a previous training run
        print(f"  Resuming training from: {args.resume}")
        model = YOLO(args.resume)
    else:
        # Start fresh with a pretrained model
        print(f"  Loading pretrained model: {model_name}")
        print("  (Pretrained on COCO dataset - will be fine-tuned for potholes)")
        model = YOLO(model_name)

    print("=" * 60 + "\n")

    # ---- Start Training ----
    print("\n" + "=" * 60)
    print("TRAINING START")
    print("=" * 60)
    print(f"  Model: {model_name}")
    print(f"  Epochs: {epochs}")
    print(f"  Batch size: {batch}")
    print(f"  Image size: {imgsz}")
    print(f"  Device: cuda:{device}")
    print(f"  Mixed Precision (AMP): {train_config.get('amp', True)}")
    print("=" * 60 + "\n")

    # The YOLO .train() method handles everything:
    # - Data loading & augmentation
    # - Forward/backward pass
    # - Learning rate scheduling
    # - Checkpointing & early stopping
    # - Validation after each epoch
    # - Generating plots & metrics
    results = model.train(
        data=dataset_yaml,           # Path to dataset config
        epochs=epochs,               # Number of training epochs
        batch=batch,                 # Batch size
        imgsz=imgsz,                 # Input image size
        device=device,               # GPU device index
        amp=train_config.get("amp", True),  # Mixed precision

        # Learning rate settings
        lr0=train_config.get("lr0", 0.01),
        lrf=train_config.get("lrf", 0.01),
        warmup_epochs=train_config.get("warmup_epochs", 3),

        # Early stopping
        patience=train_config.get("patience", 20),

        # Data augmentation
        hsv_h=train_config.get("hsv_h", 0.015),
        hsv_s=train_config.get("hsv_s", 0.7),
        hsv_v=train_config.get("hsv_v", 0.4),
        degrees=train_config.get("degrees", 10.0),
        translate=train_config.get("translate", 0.1),
        scale=train_config.get("scale", 0.5),
        fliplr=train_config.get("fliplr", 0.5),
        flipud=train_config.get("flipud", 0.2),
        mosaic=train_config.get("mosaic", 1.0),
        mixup=train_config.get("mixup", 0.1),

        # Output settings
        project=os.path.join(args.project_root, train_config.get("project", "runs/train")),
        name=train_config.get("name", "pothole_detection"),
        save_period=train_config.get("save_period", 10),
        plots=train_config.get("plots", True),

        # Data loading
        workers=train_config.get("workers", 8),

        # Verbose output
        verbose=True,
    )

    # ---- Training Complete ----
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)

    # Find the best model weights
    best_model_path = os.path.join(
        args.project_root,
        train_config.get("project", "runs/train"),
        train_config.get("name", "pothole_detection"),
        "weights",
        "best.pt"
    )

    if os.path.exists(best_model_path):
        print(f"  Best model saved to: {best_model_path}")
        print(f"\n  To run inference:")
        print(f"  python scripts/inference.py --model {best_model_path} --input <image_or_video>")
    else:
        print("  Check the runs/ folder for your trained weights.")

    print("=" * 60 + "\n")

    return results


def parse_args():
    """Parse command-line arguments with sensible defaults."""
    parser = argparse.ArgumentParser(
        description="Train YOLOv8 for Pothole Detection (Drone Footage)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
EXAMPLES:
  # Train with default settings (recommended for first run)
  python scripts/train.py

  # Train with fewer epochs for quick test
  python scripts/train.py --epochs 10 --batch 8

  # Use a smaller/faster model
  python scripts/train.py --model yolov8s.pt

  # Use a larger/more accurate model (needs more VRAM)
  python scripts/train.py --model yolov8l.pt --batch 8

  # Resume interrupted training
  python scripts/train.py --resume runs/train/pothole_detection/weights/last.pt

  # Skip dataset download (if already downloaded)
  python scripts/train.py --skip-download
        """
    )

    parser.add_argument(
        "--model", type=str, default=None,
        help="YOLO model to use (default: from config, yolov8m.pt)"
    )
    parser.add_argument(
        "--epochs", type=int, default=None,
        help="Number of training epochs (default: from config, 100)"
    )
    parser.add_argument(
        "--batch", type=int, default=None,
        help="Batch size (default: from config, 16). Lower to 8 if OOM."
    )
    parser.add_argument(
        "--imgsz", type=int, default=None,
        help="Input image size (default: from config, 640)"
    )
    parser.add_argument(
        "--resume", type=str, default=None,
        help="Path to checkpoint to resume training from"
    )
    parser.add_argument(
        "--skip-download", action="store_true",
        help="Skip dataset download (use if already downloaded)"
    )

    args = parser.parse_args()

    # Auto-detect project root (parent of scripts/ folder)
    args.project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    return args


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    args = parse_args()

    print("\n" + "#" * 60)
    print("#  POTHOLE DETECTION - TRAINING PIPELINE")
    print("#  Optimized for RTX 3060 12GB")
    print("#" * 60)

    # Step 1: Check GPU availability
    check_gpu()

    # Step 2: Train the model
    train(args)
