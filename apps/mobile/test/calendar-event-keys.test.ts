import assert from "node:assert/strict";
import test from "node:test";
import { taskCompletionEventKey, uniqueTaskCompletionEvents } from "../src/lib/calendarEventKeys.ts";

test("completion history keys distinguish different tasks and repeated completions", () => {
  const events = [
    { _id: "event-1", task: "task-a", reversedAt: null },
    { _id: "event-2", task: "task-b", reversedAt: null },
    { _id: "event-3", task: "task-a", reversedAt: "2026-11-02T10:00:00.000Z" },
    { _id: "event-4", task: "task-a", reversedAt: null },
  ];

  const keys = events.map(taskCompletionEventKey);
  assert.deepEqual(keys, ["event-1", "event-2", "event-3", "event-4"]);
  assert.equal(new Set(keys).size, events.length);
  assert.equal(events.length, 4, "distinct completion records must remain visible");
});

test("duplicate copies of one event are collapsed but separate events for the same task remain", () => {
  const event = { _id: "event-1", task: "task-a", reversedAt: null };
  const sourceRecords = [event, { ...event },
    { _id: "event-2", task: "task-a", reversedAt: null },
    { _id: "event-3", task: "task-a", reversedAt: "2026-11-02T10:00:00.000Z" },
  ];
  const uniqueEvents = uniqueTaskCompletionEvents(sourceRecords);

  assert.deepEqual(uniqueEvents.map(taskCompletionEventKey), ["event-1", "event-2", "event-3"]);
  assert.equal(uniqueEvents.length, 3, "only the repeated copy of the same event is removed");
  assert.equal(taskCompletionEventKey(event), taskCompletionEventKey({ ...event }), "the event key remains stable across rerenders");
  assert.deepEqual([...uniqueEvents].reverse().map(taskCompletionEventKey), ["event-3", "event-2", "event-1"]);
});

test("a task can have separate keys in separate task and completion sections", () => {
  const plannedTaskKey = "task-a";
  const completionKey = taskCompletionEventKey({ _id: "event-1" });
  assert.notEqual(plannedTaskKey, completionKey);
});
