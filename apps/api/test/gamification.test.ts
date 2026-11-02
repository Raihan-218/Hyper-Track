import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

process.env.NODE_ENV = "test";
process.env.PORT = "4000";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/hyper-track-test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-to-pass-validation";
process.env.JWT_EXPIRES_IN = "15m";
process.env.CORS_ORIGIN = "http://localhost";

const [{ awardXp }, { XPTransaction }, { UserGamification }] = await Promise.all([
  import("../src/services/gamification.js"),
  import("../src/models/XPTransaction.js"),
  import("../src/models/UserGamification.js"),
]);

const authenticatedUserId = "507f1f77bcf86cd799439011";

test("XP awards persist the authenticated owner for task, habit, and milestone events", async () => {
  const originalCreate = XPTransaction.create;
  const originalUpdate = UserGamification.updateOne;
  const saved: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  XPTransaction.create = (async (input: Record<string, unknown>) => {
    const document = new XPTransaction(input);
    const validationError = document.validateSync();
    if (validationError) throw validationError;
    saved.push(input);
    return document;
  }) as typeof XPTransaction.create;
  UserGamification.updateOne = (async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    updated.push({ filter, update });
    return {};
  }) as typeof UserGamification.updateOne;

  try {
    for (const activityType of ["task", "habit", "milestone"] as const) {
      await awardXp({
        userId: authenticatedUserId,
        eventKey: `${activityType}-event`,
        activityType,
        activityId: new Types.ObjectId(),
        description: `${activityType} reward`,
        amount: 10,
        localDate: "2026-11-02",
      });
    }

    assert.equal(saved.length, 3);
    for (const transaction of saved) {
      assert.equal(String(transaction.user), authenticatedUserId);
      assert.equal("userId" in transaction, false, "service input alias must not be sent as a document field");
    }
    assert.deepEqual(updated.map((entry) => (entry.filter as Record<string, unknown>).user), [authenticatedUserId, authenticatedUserId, authenticatedUserId]);
  } finally {
    XPTransaction.create = originalCreate;
    UserGamification.updateOne = originalUpdate;
  }
});

test("XP award rejects missing or invalid authenticated user context before persistence", async () => {
  const originalCreate = XPTransaction.create;
  let writes = 0;
  XPTransaction.create = (async () => { writes += 1; return {}; }) as typeof XPTransaction.create;
  try {
    const input = {
      userId: undefined as unknown as string,
      eventKey: "missing-user",
      activityType: "task" as const,
      activityId: new Types.ObjectId(),
      description: "Task reward",
      amount: 10,
      localDate: "2026-11-02",
    };
    await assert.rejects(awardXp(input), /Authenticated user context is required/);
    await assert.rejects(awardXp({ ...input, userId: "not-an-object-id" }), /Authenticated user context is required/);
    assert.equal(writes, 0);
  } finally {
    XPTransaction.create = originalCreate;
  }
});
