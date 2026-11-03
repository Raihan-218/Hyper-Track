/** SQLite schema version 1. Data is owned by the signed-in account and never
 * recreated on normal startup; later schema changes must use migrations. */
export const SCHEMA_VERSION = 1;

export const INITIAL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, archived_at TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL, title TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, due_date TEXT, planned_date TEXT, completed_at TEXT, archived_at TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, target_date TEXT, archived_at TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, title TEXT NOT NULL, completed_at TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, frequency TEXT NOT NULL, archived_at TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  // Completion facts survive when their parent entity is archived or removed.
  `CREATE TABLE IF NOT EXISTS habit_completions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, habit_id TEXT NOT NULL, local_date TEXT NOT NULL, completed_at TEXT, reversed_at TEXT, payload_json TEXT NOT NULL, UNIQUE(habit_id, local_date))`,
  `CREATE TABLE IF NOT EXISTS task_completions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, task_id TEXT NOT NULL, local_date TEXT NOT NULL, completed_at TEXT NOT NULL, reversed_at TEXT, payload_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS focus_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL, started_at TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS xp_transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_key TEXT NOT NULL UNIQUE, local_date TEXT NOT NULL, amount INTEGER NOT NULL, payload_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS user_progress (user_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, body_json TEXT, idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user_planned ON tasks(user_id, planned_date, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, archived_at)`,
  `CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON habit_completions(user_id, local_date)`,
  `CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(user_id, local_date)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(status, next_attempt_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_api_cache_user ON api_cache(user_id, updated_at)`
] as const;
