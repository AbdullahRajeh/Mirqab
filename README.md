# Mirqab

# Getting Started

Pothole detection dashboard — upload a drone video, the model runs locally, results appear on the map.

## Requirements

- [Node.js 20+](https://nodejs.org/)
- [Python 3.10+](https://www.python.org/)
- [Git LFS](https://git-lfs.com/) for model weights and test media

---

## Setup (do this once)

### 1. Pull LFS assets

```bash
git lfs pull
```

This downloads `pipeline/models/best.pt` and the demo upload video.

### 2. Install Node dependencies

```bash
npm install
```

### 3. Set up Python environment

```bash
npm run setup:pipeline
```

On Windows this creates `pipeline\venv` and installs the inference dependencies from
`pipeline\requirements.txt`. The committed `.env` already points the upload worker at
that venv and serves media from `pipeline`.

---

## Running the app

```bash
npm start
```

Open **http://localhost:3000** in your browser, log in with:
- Username: `admin`
- Password: `admin123`

---

## Uploading a video

1. Go to the Dashboard
2. Click **اختيار ملف فيديو** and pick a drone video (`.mp4`, `.mov`, `.avi`)
3. Set **تخطي الإطارات** (skip frames) — higher = faster but fewer detections. **30** is a good starting point
4. Wait for the progress bar to reach 100%
5. The dashboard reloads automatically with the new detections and map pins

For a full local test, use `for_testing\dji.mov`.

> Processing time depends on video length and whether you have a GPU. A 5-minute video at skip=30 takes ~2 minutes on CPU.

---

## What changed in this branch

- **Real upload flow** — the dashboard now accepts actual video files and runs the YOLOv8 model locally
- **Live progress bar** — reflects real inference progress, not a fake timer
- **Annotated frames** — detected frames are saved with YOLO bounding boxes drawn on them
- **Hot-swap** — after processing, the dashboard updates without restarting the server
- **Skip frames control** — pick speed vs. accuracy from the UI
- **GPS extraction** — uploads run EasyOCR after inference to attach drone OSD coordinates to each detection
