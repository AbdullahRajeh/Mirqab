import { z } from "zod";
import { HttpError } from "../utils/http-error";

const reviewBodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export function validateReviewBody(body: unknown): { decision: "approved" | "rejected" } {
  const parsed = reviewBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_body", "Invalid review payload", parsed.error.flatten());
  }
  return parsed.data;
}
