import assert from "node:assert/strict";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import { test } from "node:test";
import { errorHandler } from "../src/middleware/errors.js";

test("Mongoose validation responses identify fields without exposing document values in logs", () => {
  const error = new mongoose.Error.ValidationError();
  error.addError("dueDate", new mongoose.Error.ValidatorError({
    message: "Cast to date failed.",
    path: "dueDate",
    type: "cast",
    value: "not-a-date"
  }));
  let statusCode = 0;
  let body: Record<string, unknown> = {};
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: Record<string, unknown>) { body = value; return this; }
  } as unknown as Response;
  const request = { method: "PATCH", originalUrl: "/api/tasks/task-id" } as Request;
  const originalError = console.error;
  let log = "";
  console.error = (...values: unknown[]) => { log = values.join(" "); };
  try {
    errorHandler(error, request, response, (() => undefined) as never);
  } finally { console.error = originalError; }

  assert.equal(statusCode, 400);
  assert.equal(body.error, "Please check your input.");
  assert.equal(body.source, "persistence-validation");
  assert.deepEqual(body.details, [{ path: "dueDate", message: "Cast to date failed." }]);
  assert.match(log, /PATCH \/api\/tasks\/task-id/);
  assert.match(log, /dueDate/);
  assert.doesNotMatch(log, /not-a-date/);
});
