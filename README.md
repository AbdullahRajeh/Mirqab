# مرقاب — MIRQAB

### A Smart Pothole Detection System for Drone Footage

> Graduation Project · Imam Mohammad Ibn Saud Islamic University   
> Supervised by **Dr. Saad Alabbad**

---

## Overview

Manual road inspection is slow, expensive, and often unreliable. MIRQAB automates this process by combining **drone footage**, **YOLOv8 deep learning**, and **EasyOCR GPS extraction** to detect potholes, pin them on an interactive map, and generate actionable reports — all without human intervention in the field.

---

## Team


| Name                 
| ------------------------ 
| Rayan Mazen Alharbi      
| Abdullah Rajeh Alshehri 
| Ziyad Abdulaziz Almansif 
| Mazen Saleh AlAbdulalfar 

---

![MIRQAB Poster](docs/gp2_poster_page-0001.jpg)

---

## System Architecture

```
Drone Camera → Video Acquisition → GPS Module
       ↓
YOLOv8 Object Detection → Frame Analysis → OCR GPS Extraction
       ↓
Detection Storage → REST API → PostgreSQL + PostGIS
       ↓
Interactive Map · Detection Review · Statistics & Reports
```

### Pipeline at a glance

1. **Drone Subsystem** — captures video with embedded OSD GPS data
2. **AI Detection** — YOLOv8 runs per-frame pothole detection; annotated frames are saved with bounding boxes
3. **GPS Extraction** — EasyOCR reads the drone's on-screen GPS coordinates from each detected frame
4. **Backend** — Node.js + Express REST API stores results in PostgreSQL/PostGIS
5. **Dashboard** — Leaflet map pins every detection; analytics view shows statistics and lets you review annotated frames

---

## Technologies


| Layer     | Technology              |
| --------- | ----------------------- |
| AI Model  | YOLOv8                  |
| OCR       | EasyOCR                 |
| Backend   | Node.js + Express       |
| Frontend  | HTML / CSS / JavaScript |
| Database  | PostgreSQL + PostGIS    |
| Mapping   | Leaflet                 |
| Languages | Python & TypeScript     |


---

## Features

- Accurate pothole detection via fine-tuned YOLOv8
- GPS coordinates automatically linked to each detection
- Real-time upload and processing with a live progress bar
- Interactive map dashboard — pan, zoom, and inspect every pin
- Annotated frames saved with YOLO bounding boxes
- Scalable road-monitoring workflow requiring no manual field effort

---

## Requirements

- [Node.js 20+](https://nodejs.org/)
- [Python 3.10+](https://www.python.org/)
- [Git LFS](https://git-lfs.com/) — for model weights and test media

---

## Setup

### 1. Pull LFS assets

```bash
git lfs pull
```

Downloads `pipeline/models/best.pt` and the demo upload video.

### 2. Install Node dependencies

```bash
npm install
```

### 3. Set up Python environment

```bash
npm run setup:pipeline
```

On Windows this creates `pipeline\venv` and installs inference dependencies from `pipeline\requirements.txt`.

---

## Running the App

```bash
npm start
```

Open **[http://localhost:3000](http://localhost:3000)** and log in:


| Field    | Value      |
| -------- | ---------- |
| Username | `admin`    |
| Password | `admin123` |


---

## Uploading a Video

1. Go to the **Dashboard**
2. Click **اختيار ملف فيديو** and pick a drone video (`.mp4`, `.mov`, `.avi`)
3. Set **تخطي الإطارات** (skip frames) — higher = faster, fewer detections. **30** is a good default
4. Wait for the progress bar to reach 100%
5. The dashboard reloads automatically with new detections pinned on the map

For a quick local test use `for_testing\dji.mov`.

> Processing time depends on video length and GPU availability.  
> A 5-minute video at skip=30 takes ~2 minutes on CPU.

---

## Known Challenges

- OCR accuracy degrades under motion blur
- GPS extraction reliability varies with OSD font and size
- Long inference time for full-resolution videos
- Handling large drone video files (multi-GB)

---

## Future Work

- Real-time drone video streaming
- Multi-drone concurrent support
- Mobile application integration
- Improved GPS precision and coordinate smoothing
- Advanced road damage classification (cracks, rutting, etc.)

---

## Conclusion

MIRQAB provides a smart, scalable solution for automated road inspection using drones and AI. It reduces manual effort, improves inspection efficiency, and supports safer road maintenance operations.
