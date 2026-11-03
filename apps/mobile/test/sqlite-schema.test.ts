import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_SCHEMA, SCHEMA_VERSION } from "../src/database/schema";

test("SQLite schema is versioned and creates every established product domain", () => {
  assert.equal(SCHEMA_VERSION, 1);
  const sql = INITIAL_SCHEMA.join("\n");
  for (const table of ["users", "tasks", "projects", "goals", "milestones", "habits", "habit_completions", "task_completions", "focus_sessions", "xp_transactions", "user_progress", "sync_queue", "sync_metadata", "api_cache"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(sql, /FOREIGN KEY|REFERENCES projects\(id\)/);
  assert.match(sql, /UNIQUE\(habit_id, local_date\)/);
  assert.match(sql, /event_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/);
});

test("initial migration is additive and safe to rerun", () => {
  assert.ok(INITIAL_SCHEMA.every((statement) => /CREATE (TABLE|INDEX) IF NOT EXISTS/i.test(statement)));
  assert.doesNotMatch(INITIAL_SCHEMA.join("\n"), /\bDROP\s+(TABLE|DATABASE)|\bDELETE\s+FROM\b/i);
});
