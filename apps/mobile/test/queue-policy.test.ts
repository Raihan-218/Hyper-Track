import assert from "node:assert/strict";
import test from "node:test";
import { readyQueuePrefix } from "../src/database/queuePolicy";

test("outbox preserves dependent FIFO order when an earlier item is backing off", () => {
  const rows = [
    { id: "create", status: "pending", nextAttemptAt: "2026-11-03T10:01:00.000Z" },
    { id: "edit", status: "pending", nextAttemptAt: "2026-11-03T10:00:00.000Z" }
  ];
  assert.deepEqual(readyQueuePrefix(rows, "2026-11-03T10:00:30.000Z", 50), []);
});

test("outbox returns only due rows and respects the batch limit", () => {
  const rows = [1, 2, 3].map((id) => ({ id, status: "pending", nextAttemptAt: "2026-11-03T10:00:00.000Z" }));
  assert.deepEqual(readyQueuePrefix(rows, "2026-11-03T10:00:30.000Z", 2).map((row) => row.id), [1, 2]);
});
