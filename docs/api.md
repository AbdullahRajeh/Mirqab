# API Reference

This API is a read-only internal dashboard API for video detections.

Base path for versioned routes: `/api/v1`

## Conventions

- All responses are JSON.
- All list endpoints are read-only.
- Coordinates are returned as `gps.latitude` and `gps.longitude`.
- Image paths are stored internally as `image_path` and exposed to clients as `image_url`.
- Validation errors return `400`.
- Missing frame resources return `404`.

## Error format

Every handled error uses this JSON shape:

```json
{
  "code": "invalid_query",
  "message": "Invalid query parameters",
  "details": {}
}
```

Fields:

- `code`: machine-readable error code
- `message`: human-readable summary
- `details`: optional validation details

## GET /health

Simple health-check endpoint for load balancers, uptime checks, and local smoke tests.

### Response

```json
{
  "status": "ok"
}
```

## GET /api/v1/videos

Returns one item per video/run. Use this endpoint to populate video filters in the dashboard.

### Response

```json
{
  "items": [
    {
      "video_id": "run_001",
      "detection_count": 9,
      "frame_count": 5,
      "first_detection_sec": 2.85,
      "last_detection_sec": 4.68
    }
  ]
}
```

### Field behavior

- `video_id`: external identifier for the run
- `detection_count`: number of detections in that video
- `frame_count`: number of distinct frames that contain detections
- `first_detection_sec`: first detection timestamp in seconds, or `null`
- `last_detection_sec`: last detection timestamp in seconds, or `null`

## Shared query filters

These query params are supported by:

- `GET /api/v1/detections`
- `GET /api/v1/detections/stats`
- `GET /api/v1/detections/map`

### Supported params

- `videoId`: string, exact `video_id` match
- `minConfidence`: number from `0` to `1`
- `maxConfidence`: number from `0` to `1`
- `frameId`: non-negative integer
- `fromSec`: non-negative number
- `toSec`: non-negative number
- `limit`: integer from `1` to `500`, default `50`
- `offset`: integer `>= 0`, default `0`
- `sortBy`: one of `videoId`, `timestampSec`, `frameId`, `confidence`, `detectionId`
- `sortOrder`: `asc` or `desc`

### Validation rules

- `minConfidence` cannot be greater than `maxConfidence`
- `fromSec` cannot be greater than `toSec`
- `frameId`, `limit`, and `offset` must be non-negative integers
- unsupported `sortBy` and `sortOrder` values return `400`

### Default sort

The API preserves deterministic ordering using:

1. requested sort field and direction
2. `video_id ASC`
3. `video_timestamp_sec ASC`
4. `frame_id ASC`
5. `detection_id ASC`

## GET /api/v1/detections

Returns the main detection table for the dashboard with pagination metadata.

### Example

`GET /api/v1/detections?videoId=run_001&minConfidence=0.3&limit=25&offset=0`

### Response

```json
{
  "items": [
    {
      "detection_id": "2411aabd",
      "video_id": "run_001",
      "frame_id": 241,
      "video_timestamp_sec": 4.02,
      "gps": {
        "latitude": 26.222426,
        "longitude": 44.135455
      },
      "confidence": 0.78,
      "image_path": "runs/inference/run_001/frames/frame_0241.jpg",
      "image_url": "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg"
    }
  ],
  "total": 1,
  "limit": 25,
  "offset": 0
}
```

### How it works

- Applies all supported query filters
- Returns individual detection records, not grouped frames
- Includes `total` for the full filtered result count
- Includes `limit` and `offset` so the frontend can paginate without recomputing state

## GET /api/v1/detections/stats

Returns rollups for dashboard summary cards and high-level charts.

### Example

`GET /api/v1/detections/stats?videoId=run_001`

### Response

```json
{
  "total_detections": 9,
  "unique_videos": 1,
  "unique_frames": 5,
  "average_confidence": 0.517,
  "min_confidence": 0.26,
  "max_confidence": 0.78,
  "per_video": [
    {
      "video_id": "run_001",
      "detection_count": 9,
      "frame_count": 5,
      "average_confidence": 0.517,
      "first_detection_sec": 2.85,
      "last_detection_sec": 4.68
    }
  ]
}
```

### How it works

- Uses the same filter set as the detections endpoint
- Counts distinct frames correctly even when multiple detections share one frame
- Returns a top-level aggregate and a per-video breakdown

## GET /api/v1/detections/map

Returns lightweight map-ready data grouped by video. Each point represents a frame/timestamp location and includes the number of detections found there.

### Example

`GET /api/v1/detections/map?videoId=run_001`

### Response

```json
{
  "videos": [
    {
      "video_id": "run_001",
      "points": [
        {
          "frame_id": 171,
          "video_timestamp_sec": 2.85,
          "gps": {
            "latitude": 26.2224174,
            "longitude": 44.1354616
          },
          "detection_count": 1,
          "max_confidence": 0.26,
          "image_path": "runs/inference/run_001/frames/frame_0171.jpg",
          "image_url": "http://localhost:3000/media/runs/inference/run_001/frames/frame_0171.jpg"
        }
      ]
    }
  ]
}
```

### How it works

- Uses the same filter set as the detections endpoint
- Groups output by `video_id`
- Groups multiple detections that occurred on the same frame/timestamp/location into one point
- Exposes `detection_count` for marker sizing or clustering logic
- Exposes `max_confidence` so the frontend can use the strongest detection at that point

## GET /api/v1/frames/:videoId/:frameId

Returns all detections for one frame plus shared frame metadata. Use this when the dashboard needs to open a frame detail panel or modal.

### Route params

- `videoId`: external video identifier such as `run_001`
- `frameId`: non-negative integer frame id

### Example

`GET /api/v1/frames/run_001/241`

### Response

```json
{
  "video_id": "run_001",
  "frame_id": 241,
  "video_timestamp_sec": 4.02,
  "image_path": "runs/inference/run_001/frames/frame_0241.jpg",
  "image_url": "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg",
  "gps": {
    "latitude": 26.222426,
    "longitude": 44.135455
  },
  "detections": [
    {
      "detection_id": "16fe7ce1",
      "video_id": "run_001",
      "frame_id": 241,
      "video_timestamp_sec": 4.02,
      "gps": {
        "latitude": 26.222426,
        "longitude": 44.135455
      },
      "confidence": 0.39,
      "image_path": "runs/inference/run_001/frames/frame_0241.jpg",
      "image_url": "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg"
    },
    {
      "detection_id": "2411aabd",
      "video_id": "run_001",
      "frame_id": 241,
      "video_timestamp_sec": 4.02,
      "gps": {
        "latitude": 26.222426,
        "longitude": 44.135455
      },
      "confidence": 0.78,
      "image_path": "runs/inference/run_001/frames/frame_0241.jpg",
      "image_url": "http://localhost:3000/media/runs/inference/run_001/frames/frame_0241.jpg"
    }
  ]
}
```

### How it works

- Looks up detections by exact `videoId` and `frameId`
- Returns one shared frame wrapper with nested detection records
- Returns `404` with `code: "frame_not_found"` if no detections exist for that frame

## Notes for dashboard consumers

- Use `/api/v1/videos` to build filter dropdowns
- Use `/api/v1/detections` for the main table
- Use `/api/v1/detections/stats` for cards and aggregate widgets
- Use `/api/v1/detections/map` for map overlays
- Use `/api/v1/frames/:videoId/:frameId` for frame detail views
