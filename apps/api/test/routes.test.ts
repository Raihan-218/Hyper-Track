import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.PORT = "4000";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/hyper-track-test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-to-pass-validation";
process.env.JWT_EXPIRES_IN = "15m";
process.env.CORS_ORIGIN = "http://localhost";

const [{ tasksRouter }, { habitsRouter }, { calendarRouter }, { gamificationRouter }, { focusRouter }, { exportRouter }, { projectsRouter }, { goalsRouter }, { errorHandler }, { requireAuth }, { Task }, { Habit }, { Project }, { Goal }, { TaskCompletion }, { HabitCompletion }, { HabitScheduleSnapshot }, { User }, { XPTransaction }, { UserGamification }] = await Promise.all([
  import("../src/routes/tasks.routes.js"),
  import("../src/routes/habits.routes.js"),
  import("../src/routes/calendar.routes.js"),
  import("../src/routes/gamification.routes.js"),
  import("../src/routes/focus.routes.js"),
  import("../src/routes/export.routes.js"),
  import("../src/routes/projects.routes.js"),
  import("../src/routes/goals.routes.js"),
  import("../src/middleware/errors.js"),
  import("../src/middleware/auth.js"),
  import("../src/models/Task.js"),
  import("../src/models/Habit.js"),
  import("../src/models/Project.js"),
  import("../src/models/Goal.js"),
  import("../src/models/TaskCompletion.js"),
  import("../src/models/HabitCompletion.js"),
  import("../src/models/HabitScheduleSnapshot.js"),
  import("../src/models/User.js"),
  import("../src/models/XPTransaction.js"),
  import("../src/models/UserGamification.js")
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

async function callRoute(router: unknown, method: string, path: string, body: unknown = {}, params: Record<string, string> = {}, authorization = `Bearer ${token}`, query: Record<string, string> = {}) {
  const layer = (router as { stack: RouterLayer[] }).stack.find((candidate) => candidate.route?.path === path && candidate.route.methods[method.toLowerCase()]);
  assert.ok(layer?.route, `Missing ${method} ${path} route`);
  const res = response();
  const req: FakeRequest = {
    body, params, query, userId: undefined, method: method.toUpperCase(), originalUrl: path,
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

test("authentication rejects a signed token with no user subject before creation", async () => {
  const original = Task.create;
  let writes = 0;
  Task.create = (async () => { writes += 1; return {}; }) as typeof Task.create;
  try {
    const tokenWithoutSubject = jwt.sign({}, process.env.JWT_SECRET!);
    const result = await callRoute(tasksRouter, "post", "/", { title: "Should not save" }, {}, `Bearer ${tokenWithoutSubject}`);
    assert.equal(result.statusCode, 401);
    assert.equal(writes, 0);
  } finally { Task.create = original; }
});

test("archived task listing remains scoped to the authenticated user", async () => {
  const originalFind = Task.find; const originalCount = Task.countDocuments;
  let lookup: Record<string, unknown> | undefined;
  Task.find = ((filter: Record<string, unknown>) => {
    lookup = filter;
    const chain = {
      populate() { return chain; }, sort() { return chain; }, skip() { return chain; }, limit() { return chain; },
      lean: async () => [{ _id: "507f1f77bcf86cd799439012", title: "Archived task" }]
    };
    return chain as never;
  }) as typeof Task.find;
  Task.countDocuments = (async () => 1) as typeof Task.countDocuments;
  try {
    const result = await callRoute(tasksRouter, "get", "/", {}, {}, undefined, { archived: "true" });
    assert.equal(result.statusCode, 200);
    assert.equal(lookup?.user, userId);
    assert.deepEqual(lookup?.archivedAt, { $ne: null });
  } finally { Task.find = originalFind; Task.countDocuments = originalCount; }
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
    const response = await callRoute(tasksRouter, "post", "/", { title: "Write weekly plan", priority: "high", user: "507f1f77bcf86cd799439099" });
    assert.equal(response.statusCode, 201);
    assert.equal(created?.user, userId);
    assert.equal(created?.title, "Write weekly plan");
  } finally { Task.create = original; }
});

test("task creation accepts the mobile editor's explicit nullable optional fields", async () => {
  const original = Task.create;
  Task.create = (async (input: Record<string, unknown>) => ({ ...input, _id: "507f1f77bcf86cd799439013" })) as typeof Task.create;
  try {
    const result = await callRoute(tasksRouter, "post", "/", {
      title: "Mobile form task", priority: "medium", dueDate: null, plannedDate: null,
      reminderAt: null, recurrence: "none", projectId: null, parentTaskId: null
    });
    assert.equal(result.statusCode, 201);
  } finally { Task.create = original; }
});

test("offline task creation preserves its client-generated ObjectId and mutation identity", async () => {
  const originalFind = Task.findOne; const originalCreate = Task.create;
  let created: Record<string, unknown> | undefined;
  Task.findOne = (() => ({ lean: async () => null })) as typeof Task.findOne;
  Task.create = (async (input: Record<string, unknown>) => { created = input; return { ...input, _id: input._id }; }) as typeof Task.create;
  try {
    const localId = "66b9a1812000000000000001";
    const result = await callRoute(tasksRouter, "post", "/", { _id: localId, clientMutationId: `offline-${localId}`, title: "Offline task" });
    assert.equal(result.statusCode, 201);
    assert.equal(created?._id, localId);
    assert.equal(created?.clientMutationId, `offline-${localId}`);
    assert.equal(created?.user, userId);
  } finally { Task.findOne = originalFind; Task.create = originalCreate; }
});

test("project create retries with the same client mutation ID return the existing owned project", async () => {
  const originalFind = Project.findOne; const originalCreate = Project.create;
  let writes = 0;
  Project.findOne = (() => ({ lean: async () => ({ _id: "66b9a1812000000000000002", user: userId, name: "Offline project" }) })) as typeof Project.findOne;
  Project.create = (async () => { writes += 1; return {}; }) as typeof Project.create;
  try {
    const result = await callRoute(projectsRouter, "post", "/", { _id: "66b9a1812000000000000002", clientMutationId: "offline-project-1", name: "Offline project" });
    assert.equal(result.statusCode, 200);
    assert.equal(writes, 0);
    assert.equal((result.body as { project: { user: string } }).project.user, userId);
  } finally { Project.findOne = originalFind; Project.create = originalCreate; }
});

test("goal create retries with the same client mutation ID return the existing owned goal", async () => {
  const originalFind = Goal.findOne; const originalCreate = Goal.create;
  let writes = 0;
  Goal.findOne = (() => ({ lean: async () => ({ _id: "66b9a1812000000000000003", user: userId, title: "Offline goal" }) })) as typeof Goal.findOne;
  Goal.create = (async () => { writes += 1; return {}; }) as typeof Goal.create;
  try {
    const result = await callRoute(goalsRouter, "post", "/", { _id: "66b9a1812000000000000003", clientMutationId: "offline-goal-1", title: "Offline goal" });
    assert.equal(result.statusCode, 200);
    assert.equal(writes, 0);
    assert.equal((result.body as { goal: { user: string } }).goal.user, userId);
  } finally { Goal.findOne = originalFind; Goal.create = originalCreate; }
});

test("task completion records one completion event and awards XP after a valid status update", async () => {
  const originalFind = Task.findOne;
  const originalUpdate = Task.findOneAndUpdate;
  const originalCompletionCreate = TaskCompletion.create;
  const originalUserFind = User.findById;
  const originalXpCreate = XPTransaction.create;
  const originalGameUpdate = UserGamification.updateOne;
  const taskId = "507f1f77bcf86cd799439014";
  const current = { _id: taskId, title: "Finish the report", priority: "high", status: "todo", recurrence: "none", dueDate: undefined, plannedDate: undefined, project: null, parentTask: null };
  let completion: Record<string, unknown> | undefined;
  let xp: Record<string, unknown> | undefined;
  Task.findOne = (() => ({ lean: async () => current })) as typeof Task.findOne;
  Task.findOneAndUpdate = (async () => ({ ...current, status: "done", completedAt: new Date() })) as typeof Task.findOneAndUpdate;
  TaskCompletion.create = (async (input: Record<string, unknown>) => { completion = input; return { ...input, _id: "507f1f77bcf86cd799439015" }; }) as typeof TaskCompletion.create;
  User.findById = (() => ({ select: () => ({ lean: async () => ({ timezone: "Asia/Kolkata" }) }) })) as typeof User.findById;
  XPTransaction.create = (async (input: Record<string, unknown>) => { xp = input; }) as typeof XPTransaction.create;
  UserGamification.updateOne = (async () => ({})) as typeof UserGamification.updateOne;
  try {
    const result = await callRoute(tasksRouter, "patch", "/:id", { status: "done" }, { id: taskId });
    assert.equal(result.statusCode, 200);
    assert.equal(completion?.task, taskId);
    assert.equal(completion?.timezone, "Asia/Kolkata");
    assert.equal(completion?.priority, "high");
    assert.equal(xp?.amount, 15);
    assert.equal(xp?.activityType, "task");
    assert.equal(xp?.user, userId, "the XP ledger is owned by the authenticated user");
    assert.equal("userId" in (xp ?? {}), false);
  } finally {
    Task.findOne = originalFind; Task.findOneAndUpdate = originalUpdate;
    TaskCompletion.create = originalCompletionCreate; User.findById = originalUserFind;
    XPTransaction.create = originalXpCreate; UserGamification.updateOne = originalGameUpdate;
  }
});

test("habit creation accepts the mobile editor's weekly schedule payload", async () => {
  const originalCreate = Habit.create;
  const originalSnapshotCreate = HabitScheduleSnapshot.create;
  let saved: Record<string, unknown> | undefined;
  Habit.create = (async (input: Record<string, unknown>) => {
    saved = input;
    return { ...input, _id: "507f1f77bcf86cd799439016", createdAt: new Date() };
  }) as typeof Habit.create;
  HabitScheduleSnapshot.create = (async () => ({})) as typeof HabitScheduleSnapshot.create;
  try {
    const result = await callRoute(habitsRouter, "post", "/", {
      name: "Weekly review", category: "Personal", difficulty: "medium", frequency: "weekly", targetPerWeek: 3, daysOfWeek: [1, 3, 5], user: "507f1f77bcf86cd799439099"
    });
    assert.equal(result.statusCode, 201);
    assert.equal(saved?.targetPerWeek, 3);
    assert.deepEqual(saved?.daysOfWeek, [1, 3, 5]);
    assert.equal(saved?.user, userId);
  } finally { Habit.create = originalCreate; HabitScheduleSnapshot.create = originalSnapshotCreate; }
});

test("habit completion and its XP ledger use the authenticated owner", async () => {
  const originalEventFind = HabitCompletion.findOne;
  const originalHabitUpdate = Habit.findOneAndUpdate;
  const originalEventCreate = HabitCompletion.create;
  const originalUserFind = User.findById;
  const originalXpCreate = XPTransaction.create;
  const originalGameUpdate = UserGamification.updateOne;
  const habitId = "507f1f77bcf86cd799439016";
  let completion: Record<string, unknown> | undefined;
  let xp: Record<string, unknown> | undefined;
  HabitCompletion.findOne = (async () => null) as typeof HabitCompletion.findOne;
  Habit.findOneAndUpdate = (async () => ({ _id: habitId, name: "Read", completions: ["2026-11-02"] })) as typeof Habit.findOneAndUpdate;
  HabitCompletion.create = (async (input: Record<string, unknown>) => { completion = input; return { ...input, _id: "507f1f77bcf86cd799439017" }; }) as typeof HabitCompletion.create;
  User.findById = (() => ({ select: () => ({ lean: async () => ({ timezone: "Asia/Kolkata" }) }) })) as typeof User.findById;
  XPTransaction.create = (async (input: Record<string, unknown>) => { xp = input; }) as typeof XPTransaction.create;
  UserGamification.updateOne = (async () => ({})) as typeof UserGamification.updateOne;
  try {
    const result = await callRoute(habitsRouter, "post", "/:id/completions", { date: "2026-11-02" }, { id: habitId });
    assert.equal(result.statusCode, 200);
    assert.equal(completion?.user, userId);
    assert.equal(completion?.habit, habitId);
    assert.equal(xp?.user, userId);
    assert.equal(xp?.activityType, "habit");
    assert.equal("userId" in (xp ?? {}), false);
  } finally {
    HabitCompletion.findOne = originalEventFind; Habit.findOneAndUpdate = originalHabitUpdate;
    HabitCompletion.create = originalEventCreate; User.findById = originalUserFind;
    XPTransaction.create = originalXpCreate; UserGamification.updateOne = originalGameUpdate;
  }
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

test("task updates ignore client-supplied owner changes and retain authenticated ownership scope", async () => {
  const originalFind = Task.findOne;
  const originalUpdate = Task.findOneAndUpdate;
  const taskId = "507f1f77bcf86cd799439018";
  const current = { _id: taskId, title: "Original", priority: "medium", status: "todo", recurrence: "none", project: null, parentTask: null };
  let lookup: Record<string, unknown> | undefined;
  let filter: Record<string, unknown> | undefined;
  let changes: Record<string, unknown> | undefined;
  Task.findOne = ((query: Record<string, unknown>) => { lookup = query; return { lean: async () => current }; }) as typeof Task.findOne;
  Task.findOneAndUpdate = (async (query: Record<string, unknown>, update: Record<string, unknown>) => { filter = query; changes = update; return { ...current, title: "Updated" }; }) as typeof Task.findOneAndUpdate;
  try {
    const response = await callRoute(tasksRouter, "patch", "/:id", { title: "Updated", user: "507f1f77bcf86cd799439099" }, { id: taskId });
    assert.equal(response.statusCode, 200);
    assert.equal(lookup?.user, userId);
    assert.equal(filter?.user, userId);
    assert.equal((changes?.$set as Record<string, unknown>).user, undefined);
  } finally { Task.findOne = originalFind; Task.findOneAndUpdate = originalUpdate; }
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
