import assert from "node:assert/strict";
import { test } from "node:test";
import { longestScheduledStreak, type HabitSchedulePeriod } from "../src/services/habitStreaks.js";

const schedule = (frequency: "daily" | "weekly", daysOfWeek: number[], from: string, to: string | null = null): HabitSchedulePeriod => ({ frequency, daysOfWeek, validFromAt: new Date(from), validToAt: to ? new Date(to) : null });

test("longest habit streak counts consecutive completed scheduled days", () => {
  const result = longestScheduledStreak(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-03"], [schedule("daily", [], "2026-10-30T00:00:00Z")], "2026-11-03", "UTC");
  assert.equal(result, 3);
});

test("weekly habit streak skips weekdays outside the saved schedule", () => {
  const result = longestScheduledStreak(["2026-10-26", "2026-10-28", "2026-11-02"], [schedule("weekly", [1, 3], "2026-10-26T00:00:00Z")], "2026-11-02", "UTC");
  assert.equal(result, 3);
});

test("flexible weekly periods do not imply a daily streak", () => {
  const result = longestScheduledStreak(["2026-10-30", "2026-10-31"], [schedule("weekly", [], "2026-10-30T00:00:00Z")], "2026-11-01", "UTC");
  assert.equal(result, 0);
});

test("schedule changes use the schedule recorded for each local day", () => {
  const result = longestScheduledStreak(["2026-10-30", "2026-10-31", "2026-11-01"], [
    schedule("weekly", [5], "2026-10-30T00:00:00Z", "2026-10-31T00:00:00Z"),
    schedule("daily", [], "2026-10-31T00:00:00Z")
  ], "2026-11-01", "UTC");
  assert.equal(result, 3);
});
