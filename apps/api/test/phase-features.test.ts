import test from "node:test";
import assert from "node:assert/strict";
import { levelForXp } from "../src/services/levels.js";
import { dateRange, isDateKey, longestConsecutive, nextDateKey, shiftLocalInstant, startOfLocalDay } from "../src/services/dateMetrics.js";

test("level thresholds are monotonic with 100 XP per squared level", () => {
  assert.deepEqual(levelForXp(0), { level: 1, currentLevelXp: 0, nextLevelXp: 100, progress: 0 });
  assert.equal(levelForXp(99).level, 1);
  assert.equal(levelForXp(100).level, 2);
  assert.equal(levelForXp(400).level, 3);
  assert.equal(levelForXp(900).level, 4);
});

test("consecutive-day streak logic handles leap day and duplicate entries", () => {
  assert.equal(longestConsecutive(["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-01"]), 3);
  assert.equal(longestConsecutive(["2026-10-31", "2026-11-01", "2026-11-03"]), 2);
});

test("date ranges include both endpoints across month and year boundaries", () => {
  assert.deepEqual(dateRange("2024-02-28", "2024-03-01"), ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.deepEqual(dateRange("2026-12-31", "2027-01-01"), ["2026-12-31", "2027-01-01"]);
});

test("date validation rejects impossible month-end dates and accepts leap days", () => {
  assert.equal(isDateKey("2024-02-29"), true);
  assert.equal(isDateKey("2026-02-29"), false);
  assert.equal(isDateKey("2026-13-01"), false);
});

test("local day boundaries preserve 23 and 25 hour daylight-saving days", () => {
  const spring = startOfLocalDay("2026-03-08", "America/New_York");
  const springEnd = startOfLocalDay(nextDateKey("2026-03-08"), "America/New_York");
  assert.equal((springEnd.getTime() - spring.getTime()) / 3_600_000, 23);
  const fall = startOfLocalDay("2026-11-01", "America/New_York");
  const fallEnd = startOfLocalDay(nextDateKey("2026-11-01"), "America/New_York");
  assert.equal((fallEnd.getTime() - fall.getTime()) / 3_600_000, 25);
});

test("daily recurrence preserves local wall time through a daylight-saving gap", () => {
  const beforeSpringForward = new Date("2026-03-07T07:30:00.000Z"); // 02:30 in New York
  const next = shiftLocalInstant(beforeSpringForward, 1, "America/New_York");
  assert.equal(next.toISOString(), "2026-03-08T07:00:00.000Z"); // first valid local minute is 03:00
});
