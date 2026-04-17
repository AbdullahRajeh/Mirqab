import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, "not_found", "Route not found"));
}

export function errorHandler(
  error: Error & { statusCode?: number; code?: string; details?: unknown },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = error.statusCode ?? 500;
  const payload: { code: string; message: string; details?: unknown } = {
    code: error.code ?? "internal_error",
    message: error.message ?? "Internal server error",
  };

  if (error.details !== undefined) {
    payload.details = error.details;
  }

  if (statusCode === 500) {
    console.error(error);
  }

  res.status(statusCode).json(payload);
}
