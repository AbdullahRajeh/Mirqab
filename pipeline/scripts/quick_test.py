"""
============================================================
quick_test.py - Verify Your Setup Works
============================================================
Run this FIRST to make sure everything is installed correctly
before starting training.

USAGE:
  python scripts/quick_test.py
============================================================
"""

import sys


def test_imports():
    """Test that all required packages are installed."""
    print("\n[1/5] Checking package imports...")

    packages = {
        "ultralytics": "YOLO framework",
        "torch": "PyTorch (deep learning)",
        "cv2": "OpenCV (image processing)",
        "numpy": "NumPy (math operations)",
        "yaml": "PyYAML (config files)",
        "PIL": "Pillow (image loading)",
    }

    all_ok = True
    for package, description in packages.items():
        try:
            __import__(package)
            print(f"  OK: {package} ({description})")
        except ImportError:
            print(f"  MISSING: {package} ({description})")
            all_ok = False

    return all_ok


def test_gpu():
    """Test GPU availability and CUDA support."""
    print("\n[2/5] Checking GPU / CUDA...")

    import torch

    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_mem / (1024 ** 3)
        print(f"  OK: GPU detected - {gpu_name}")
        print(f"  OK: VRAM - {vram:.1f} GB")
        print(f"  OK: CUDA version - {torch.version.cuda}")
        print(f"  OK: cuDNN available - {torch.backends.cudnn.is_available()}")

        # Test a simple GPU operation
        try:
            x = torch.randn(100, 100, device="cuda")
            y = x @ x.T
            del x, y
            torch.cuda.empty_cache()
            print(f"  OK: GPU compute test passed")
        except Exception as e:
            print(f"  ERROR: GPU compute test failed: {e}")
            return False
        return True
    else:
        print("  WARNING: No GPU detected!")
        print("  Training will be very slow on CPU.")
        print("  Install CUDA toolkit: https://developer.nvidia.com/cuda-downloads")
        return False


def test_yolo():
    """Test that YOLO model can be loaded."""
    print("\n[3/5] Checking YOLO model loading...")

    try:
        from ultralytics import YOLO
        # Load the smallest model for a quick test
        model = YOLO("yolov8n.pt")
        print(f"  OK: YOLO model loaded successfully")
        print(f"  OK: Ultralytics version: {__import__('ultralytics').__version__}")
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def test_kaggle():
    """Test Kaggle API configuration."""
    print("\n[4/5] Checking Kaggle API...")

    import os

    # Check for kaggle.json
    kaggle_paths = [
        os.path.expanduser("~/.kaggle/kaggle.json"),  # Linux/Mac
        os.path.join(os.environ.get("USERPROFILE", ""), ".kaggle", "kaggle.json"),  # Windows
    ]

    found = False
    for path in kaggle_paths:
        if os.path.exists(path):
            print(f"  OK: kaggle.json found at {path}")
            found = True
            break

    if not found:
        print("  WARNING: kaggle.json not found!")
        print("  To download the dataset automatically:")
        print("    1. Go to kaggle.com -> Account -> Create New API Token")
        print("    2. Save kaggle.json to ~/.kaggle/ (Linux/Mac)")
        print("       or C:\\Users\\<you>\\.kaggle\\ (Windows)")
        print("  Alternatively, download the dataset manually from Kaggle.")

    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        print(f"  OK: kaggle package installed")
    except ImportError:
        print(f"  WARNING: kaggle package not installed (pip install kaggle)")

    return found


def test_project_structure():
    """Verify project files are in place."""
    print("\n[5/5] Checking project structure...")

    import os

    # Get project root (parent of scripts/)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    required_files = [
        "configs/pothole_dataset.yaml",
        "configs/training_config.yaml",
        "scripts/train.py",
        "scripts/inference.py",
        "scripts/validate.py",
        "requirements.txt",
    ]

    all_ok = True
    for f in required_files:
        path = os.path.join(project_root, f)
        if os.path.exists(path):
            print(f"  OK: {f}")
        else:
            print(f"  MISSING: {f}")
            all_ok = False

    # Check for test_media folder
    test_dir = os.path.join(project_root, "test_media")
    if os.path.exists(test_dir):
        files = os.listdir(test_dir)
        print(f"  OK: test_media/ ({len(files)} files)")
    else:
        print(f"  INFO: test_media/ folder is empty (add test images/videos here)")

    return all_ok


# ============================================================
if __name__ == "__main__":
    print("#" * 60)
    print("#  POTHOLE DETECTION - SETUP VERIFICATION")
    print("#" * 60)

    results = {
        "Packages": test_imports(),
        "GPU/CUDA": test_gpu(),
        "YOLO": test_yolo(),
        "Kaggle API": test_kaggle(),
        "Project Structure": test_project_structure(),
    }

    print("\n" + "=" * 60)
    print("SETUP SUMMARY")
    print("=" * 60)

    all_passed = True
    for test, passed in results.items():
        status = "PASS" if passed else "WARN"
        if not passed:
            all_passed = False
        print(f"  [{status}] {test}")

    if all_passed:
        print("\n  All checks passed! You're ready to train.")
        print("  Run: python scripts/train.py")
    else:
        print("\n  Some checks had warnings. Review above for details.")
        print("  Training may still work - GPU and Packages are critical.")

    print("=" * 60 + "\n")
