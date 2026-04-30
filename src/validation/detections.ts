import { z } from "zod";
import type { DetectionListQuery } from "../types";
import { HttpError } from "../utils/http-error";

const listQuerySchema = z.object({
  videoId: z.string().trim().min(1).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  frameId: z.coerce.number().int().nonnegative().optional(),
  fromSec: z.coerce.number().nonnegative().optional(),
  toSec: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z
    .enum(["videoId", "timestampSec", "frameId", "confidence", "detectionId"])
    .default("timestampSec"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export function validateListQuery(query: unknown): DetectionListQuery {
  const parsed = listQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw new HttpError(400, "invalid_query", "Invalid query parameters", parsed.error.flatten());
  }

  const data = parsed.data;

  if (
    data.minConfidence !== undefined &&
    data.maxConfidence !== undefined &&
    data.minConfidence > data.maxConfidence
  ) {
    throw new HttpError(
      400,
      "invalid_query",
      "minConfidence cannot be greater than maxConfidence",
    );
  }

  if (data.fromSec !== undefined && data.toSec !== undefined && data.fromSec > data.toSec) {
    throw new HttpError(400, "invalid_query", "fromSec cannot be greater than toSec");
  }

  return data;
}

const frameParamsSchema = z.object({
  videoId: z.string().trim().min(1),
  frameId: z.coerce.number().int().nonnegative(),
});

export function validateFrameParams(params: unknown): { videoId: string; frameId: number } {
  const parsed = frameParamsSchema.safeParse(params);

  if (!parsed.success) {
    throw new HttpError(400, "invalid_params", "Invalid route parameters", parsed.error.flatten());
  }

  return parsed.data;
}
