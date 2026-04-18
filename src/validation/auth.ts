import { z } from "zod";
import { HttpError } from "../utils/http-error";

const loginBodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export function validateLoginBody(body: unknown): { username: string; password: string } {
  const parsed = loginBodySchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, "invalid_body", "Invalid login payload", parsed.error.flatten());
  }

  return parsed.data;
}
