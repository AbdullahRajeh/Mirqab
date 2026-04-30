import { z } from "zod";
import { HttpError } from "../utils/http-error";

const uploadBodySchema = z.object({
  fileName: z.string().trim().min(1).max(512),
  sizeBytes: z.coerce.number().int().nonnegative().max(50 * 1024 * 1024 * 1024).optional(),
});

export function validateMockUploadBody(body: unknown): { fileName: string; sizeBytes?: number } {
  const parsed = uploadBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_body", "Invalid upload payload", parsed.error.flatten());
  }
  return parsed.data;
}

const detectionIdParamSchema = z.string().trim().min(1).max(128);

export function validateDetectionIdParam(value: string): string {
  const parsed = detectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_params", "Invalid detection id", parsed.error.flatten());
  }
  return parsed.data;
}

const uploadIdParamSchema = z.string().trim().min(1).max(128);

export function validateUploadIdParam(value: string): string {
  const parsed = uploadIdParamSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_params", "Invalid upload id", parsed.error.flatten());
  }
  return parsed.data;
}
