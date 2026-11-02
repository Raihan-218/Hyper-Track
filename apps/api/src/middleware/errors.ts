import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    console.warn(`[request-validation] ${req.method} ${req.originalUrl}: ${details.map((issue) => `${issue.path || "request"}: ${issue.message}`).join("; ")}`);
    res.status(400).json({ error: "Please check your input.", source: "request-validation", details });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((issue) => ({ path: issue.path, message: issue.message }));
    console.error(`[persistence-validation] ${req.method} ${req.originalUrl}: ${details.map((issue) => `${issue.path || "document"}: ${issue.message}`).join("; ")}`);
    res.status(400).json({ error: "Please check your input.", source: "persistence-validation", details });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};
