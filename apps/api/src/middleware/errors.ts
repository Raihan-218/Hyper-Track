import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: "Validation failed" });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};
