import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.PORT = "4000";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/hyper-track-test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-to-pass-validation";
process.env.JWT_EXPIRES_IN = "15m";
process.env.CORS_ORIGIN = "http://localhost";

const [{ tasksRouter }, { habitsRouter }, { calendarRouter }, { gamificationRouter }, { focusRouter }, { exportRouter }, { errorHandler }, { requireAuth }, { Task }, { Habit }] = await Promise.all([
  import("../src/routes/tasks.routes.js"),
  import("../src/routes/habits.routes.js"),
  import("../src/routes/calendar.routes.js"),
  import("../src/routes/gamification.routes.js"),
  import("../src/routes/focus.routes.js"),
  import("../src/routes/export.routes.js"),
  import("../src/middleware/errors.js"),
  import("../src/middleware/auth.js"),
  import("../src/models/Task.js"),
  import("../src/models/Habit.js")
]);

const userId = "507f1f77bcf86cd799439011";
const token = jwt.sign({}, process.env.JWT_SECRET!, { subject: userId, expiresIn: "15m" });
type FakeRequest = Record<string, any>;
type FakeResponse = { statusCode: number; body?: unknown; status: (code: number) => FakeResponse; json: (body: unknown) => FakeResponse; send: () => FakeResponse };
type RouterLayer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: FakeRequest, res: FakeResponse, next: (error?: unknown) => void) => Promise<void> }[] } };

function response(): FakeResponse {
  const value: FakeResponse = {
    statusCode: 200,
    status(code) { value.statusCode = code; return value; },
    json(body) { value.body = body; return value; },
    send() { return value; }
  };
  return value;
}

async function callRoute(router: unknown, method: string, path: string, body: unknown = {}, params: Record<string, string> = {}, authorization = `Bearer ${token}`) {
  const layer = (router as { stack: RouterLayer[] }).stack.find((candidate) => candidate.route?.path === path && candidate.route.methods[method.toLowerCase()]);
  assert.ok(layer?.route, `Missing ${method} ${path} route`);
  const res = response();
  const req: FakeRequest = {
    body, params, query: {}, userId: undefined,
    header: (name: string) => name.toLowerCase() === "authorization" ? authorization : undefined
  };
  let authorized = false;
  requireAuth(req, res as never, () => { authorized = true; });
  if (!authorized) return res;
  const handler = layer.route.stack.at(-1)!.handle;
  await handler(req, res, (error) => {
    if (error) errorHandler(error, req as never, res as never, (() => undefined) as never);
  });
  return res;
}

test("task routes reject requests without authentication", async () => {
  const result = await callRoute(tasksRouter, "get", "/", {}, {}, "");
  assert.equal(result.statusCode, 401);
});

test("calendar, gamification, focus, and export routes reject anonymous requests", async () => {
  for (const router of [calendarRouter, gamificationRouter, focusRouter, exportRouter]) {
    const result = await callRoute(router, "get", "/", {}, {}, "");
    assert.equal(result.statusCode, 401);
  }
});

test("task creation validates input and assigns the authenticated owner", async () => {
  const original = Task.create;
  let created: Record<string, unknown> | undefined;
  Task.create = (async (input: Record<string, unknown>) => {
    created = input;
    return { ...input, _id: "507f1f77bcf86cd799439012" };
  }) as typeof Task.create;
  try {
    const response = await callRoute(tasksRouter, "post", "/", { title: "Write weekly plan", priority: "high" });
    assert.equal(response.statusCode, 201);
    assert.equal(created?.user, userId);
    assert.equal(created?.title, "Write weekly plan");
  } finally { Task.create = original; }
});

test("task updates scope lookup to the authenticated owner", async () => {
  const original = Task.findOne;
  let lookup: Record<string, unknown> | undefined;
  Task.findOne = ((filter: Record<string, unknown>) => {
    lookup = filter;
    return { lean: async () => null };
  }) as typeof Task.findOne;
  try {
    const response = await callRoute(tasksRouter, "patch", "/:id", { title: "Changed title" }, { id: "507f1f77bcf86cd799439012" });
    assert.equal(response.statusCode, 404);
    assert.equal(lookup?.user, userId);
    assert.equal(lookup?.archivedAt, null);
  } finally { Task.findOne = original; }
});

test("habit updates reject invalid schedules before touching persistence", async () => {
  const original = Habit.findOneAndUpdate;
  let called = false;
  Habit.findOneAndUpdate = (async () => { called = true; return null; }) as typeof Habit.findOneAndUpdate;
  try {
    const response = await callRoute(habitsRouter, "patch", "/:id", { targetPerWeek: 9 }, { id: "507f1f77bcf86cd799439012" });
    assert.equal(response.statusCode, 400);
    assert.equal(called, false);
  } finally { Habit.findOneAndUpdate = original; }
});
