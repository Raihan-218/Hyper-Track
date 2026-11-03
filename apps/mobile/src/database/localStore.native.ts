import { getDatabase, runInTransaction } from "./database";
import { readyQueuePrefix } from "./queuePolicy";

const now = () => new Date().toISOString();

export async function getCachedResponse<T>(userId: string, cacheKey: string): Promise<T | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload_json: string }>("SELECT payload_json FROM api_cache WHERE user_id = ? AND cache_key = ?", userId, cacheKey);
  if (!row) return null;
  try { return JSON.parse(row.payload_json) as T; } catch { return null; }
}

export async function saveCachedResponse(userId: string, cacheKey: string, value: unknown): Promise<void> {
  const timestamp = now();
  await runInTransaction(async (db) => {
    await db.runAsync("INSERT INTO api_cache(cache_key,user_id,payload_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET user_id=excluded.user_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at", cacheKey, userId, JSON.stringify(value), timestamp);
    await persistDomainPayload(db, userId, cacheKey, value, timestamp);
  });
}

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const text = (value: unknown): string | null => value == null ? null : typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value);
const idOf = (value: unknown): string | null => { const row = object(value); return text(row._id ?? row.id ?? value); };
const rowsOf = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];

async function persistDomainPayload(db: Awaited<ReturnType<typeof getDatabase>>, userId: string, cacheKey: string, value: unknown, timestamp: string): Promise<void> {
  const path = cacheKey.replace(/^hyper_track_api_cache:/, "").split("?")[0];
  const payload = object(value);
  const user = object(payload.user);
  if (path === "/auth/me" && idOf(user)) {
    await db.runAsync("INSERT INTO users(id,payload_json,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at", idOf(user), JSON.stringify(user), timestamp);
  } else if (path === "/projects") {
    for (const item of rowsOf(payload.projects)) {
      const id = idOf(item); if (!id) continue;
      await db.runAsync("INSERT INTO projects(id,user_id,name,status,archived_at,payload_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,archived_at=excluded.archived_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at", id, userId, String(item.name ?? ""), String(item.status ?? "active"), text(item.archivedAt), JSON.stringify(item), timestamp);
    }
    const tasks = await db.getAllAsync<{ id: string; payload_json: string }>("SELECT id,payload_json FROM tasks WHERE user_id=?", userId);
    for (const task of tasks) {
      try {
        const data = JSON.parse(task.payload_json) as Row;
        const projectRef = idOf(data.project) ?? text(data.projectId);
        if (projectRef) await db.runAsync("UPDATE tasks SET project_id=? WHERE id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)", projectRef, task.id, projectRef, userId);
      } catch { /* Keep the source payload intact if a cached row is malformed. */ }
    }
  } else if (path === "/tasks") {
    for (const item of rowsOf(payload.tasks)) {
      const id = idOf(item); if (!id) continue;
      const projectRef = idOf(item.project); const parentRef = idOf(item.parentTask);
      const projectExists = projectRef ? await db.getFirstAsync<{ id: string }>("SELECT id FROM projects WHERE id=? AND user_id=?", projectRef, userId) : null;
      const parentExists = parentRef ? await db.getFirstAsync<{ id: string }>("SELECT id FROM tasks WHERE id=? AND user_id=?", parentRef, userId) : null;
      await db.runAsync("INSERT INTO tasks(id,user_id,project_id,parent_task_id,title,status,priority,due_date,planned_date,completed_at,archived_at,payload_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,parent_task_id=excluded.parent_task_id,title=excluded.title,status=excluded.status,priority=excluded.priority,due_date=excluded.due_date,planned_date=excluded.planned_date,completed_at=excluded.completed_at,archived_at=excluded.archived_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at", id, userId, projectExists?.id ?? null, parentExists?.id ?? null, String(item.title ?? ""), String(item.status ?? "todo"), String(item.priority ?? "medium"), text(item.dueDate), text(item.plannedDate), text(item.completedAt), text(item.archivedAt), JSON.stringify(item), text(item.updatedAt) ?? timestamp);
    }
    const tasks = await db.getAllAsync<{ id: string; payload_json: string }>("SELECT id,payload_json FROM tasks WHERE user_id=?", userId);
    for (const task of tasks) {
      try {
        const data = JSON.parse(task.payload_json) as Row;
        const projectRef = idOf(data.project) ?? text(data.projectId);
        const parentRef = idOf(data.parentTask) ?? text(data.parentTaskId);
        if (projectRef) await db.runAsync("UPDATE tasks SET project_id=? WHERE id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)", projectRef, task.id, projectRef, userId);
        if (parentRef) await db.runAsync("UPDATE tasks SET parent_task_id=? WHERE id=? AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND user_id=?)", parentRef, task.id, parentRef, userId);
      } catch { /* Retain the cached API payload even if relation repair cannot run. */ }
    }
  } else if (path === "/goals") {
    for (const item of rowsOf(payload.goals)) {
      const id = idOf(item); if (!id) continue;
      await db.runAsync("INSERT INTO goals(id,user_id,title,status,target_date,archived_at,payload_json,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,target_date=excluded.target_date,archived_at=excluded.archived_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at", id, userId, String(item.title ?? ""), String(item.status ?? "active"), text(item.targetDate), text(item.archivedAt), JSON.stringify(item), text(item.updatedAt) ?? timestamp);
      for (const milestone of rowsOf(item.milestones)) {
        const milestoneId = idOf(milestone); if (!milestoneId) continue;
        await db.runAsync("INSERT INTO milestones(id,goal_id,title,completed_at,payload_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET goal_id=excluded.goal_id,title=excluded.title,completed_at=excluded.completed_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at", milestoneId, id, String(milestone.title ?? ""), text(milestone.completedAt), JSON.stringify(milestone), text(milestone.updatedAt) ?? timestamp);
      }
    }
  } else if (path === "/habits") {
    for (const item of rowsOf(payload.habits)) {
      const id = idOf(item); if (!id) continue;
      await db.runAsync("INSERT INTO habits(id,user_id,name,frequency,archived_at,payload_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,frequency=excluded.frequency,archived_at=excluded.archived_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at", id, userId, String(item.name ?? ""), String(item.frequency ?? "daily"), text(item.archivedAt), JSON.stringify(item), text(item.updatedAt) ?? timestamp);
    }
  } else if (path === "/focus") {
    const session = object(payload.active);
    if (idOf(session)) {
      const taskId = idOf(session.task);
      const taskExists = taskId ? await db.getFirstAsync<{ id: string }>("SELECT id FROM tasks WHERE id=? AND user_id=?", taskId, userId) : null;
      await db.runAsync("INSERT INTO focus_sessions(id,user_id,task_id,started_at,status,payload_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,started_at=excluded.started_at,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at", idOf(session), userId, taskExists?.id ?? null, text(session.startedAt) ?? timestamp, String(session.status ?? "active"), JSON.stringify(session), timestamp);
    }
  } else if (path === "/gamification" || path.startsWith("/progress/")) {
    await db.runAsync("INSERT INTO user_progress(user_id,payload_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at", userId, JSON.stringify(value), timestamp);
  } else if (path.startsWith("/calendar/day/")) {
    for (const item of rowsOf(payload.completedTasks)) {
      const eventId = idOf(item); const taskId = idOf(item.task);
      if (!eventId || !taskId || !text(item.localDate) || !text(item.completedAt)) continue;
      await db.runAsync("INSERT INTO task_completions(id,user_id,task_id,local_date,completed_at,reversed_at,payload_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET reversed_at=excluded.reversed_at,payload_json=excluded.payload_json", eventId, userId, taskId, text(item.localDate), text(item.completedAt), text(item.reversedAt), JSON.stringify(item));
    }
    for (const item of rowsOf(payload.completedHabits)) {
      const eventId = idOf(item); const habitId = idOf(item.habit);
      if (!eventId || !habitId || !text(item.localDate)) continue;
      await db.runAsync("INSERT INTO habit_completions(id,user_id,habit_id,local_date,completed_at,reversed_at,payload_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET reversed_at=excluded.reversed_at,payload_json=excluded.payload_json", eventId, userId, habitId, text(item.localDate), text(item.completedAt), text(item.reversedAt), JSON.stringify(item));
    }
  }
}

export type PendingMutation = { id: string; userId: string; method: string; path: string; body: string | null; idempotencyKey: string; status: string; attempts: number; nextAttemptAt: string; createdAt: string };

export async function enqueueMutation(input: { userId: string; method: string; path: string; body?: string; idempotencyKey?: string }): Promise<void> {
  const createdAt = now();
  const id = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const idempotencyKey = input.idempotencyKey ?? `ht-${id}`;
  await runInTransaction(async (db) => {
    await db.runAsync("INSERT OR IGNORE INTO sync_queue(id,user_id,method,path,body_json,idempotency_key,status,attempts,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',0,?,?,?)", id, input.userId, input.method, input.path, input.body ?? null, idempotencyKey, createdAt, createdAt, createdAt);
  });
}

export async function commitOfflineMutation(input: { userId: string; cacheKey?: string; cacheValue?: unknown; cacheWrites?: Array<{ cacheKey: string; cacheValue: unknown }>; method: string; path: string; body: string; idempotencyKey: string }): Promise<void> {
  const timestamp = now();
  const id = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await runInTransaction(async (db) => {
    const writes = input.cacheWrites ?? (input.cacheKey ? [{ cacheKey: input.cacheKey, cacheValue: input.cacheValue }] : []);
    for (const write of writes) {
      await db.runAsync("INSERT INTO api_cache(cache_key,user_id,payload_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET user_id=excluded.user_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at", write.cacheKey, input.userId, JSON.stringify(write.cacheValue), timestamp);
      await persistDomainPayload(db, input.userId, write.cacheKey, write.cacheValue, timestamp);
    }
    await db.runAsync("INSERT INTO sync_queue(id,user_id,method,path,body_json,idempotency_key,status,attempts,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',0,?,?,?)", id, input.userId, input.method, input.path, input.body, input.idempotencyKey, timestamp, timestamp, timestamp);
  });
}

export async function commitQueuedCreateEdit(input: { userId: string; idempotencyKey: string; entityPathPrefix: string; patch: Record<string, unknown>; remove: boolean; cacheWrites: Array<{ cacheKey: string; cacheValue: unknown }> }): Promise<boolean> {
  const timestamp = now();
  return runInTransaction(async (db) => {
    const row = await db.getFirstAsync<{ id: string; path: string; body_json: string | null }>("SELECT id,path,body_json FROM sync_queue WHERE user_id=? AND idempotency_key=? AND method='POST' AND status='pending'", input.userId, input.idempotencyKey);
    if (!row) return false;
    for (const write of input.cacheWrites) {
      await db.runAsync("INSERT INTO api_cache(cache_key,user_id,payload_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET user_id=excluded.user_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at", write.cacheKey, input.userId, JSON.stringify(write.cacheValue), timestamp);
      await persistDomainPayload(db, input.userId, write.cacheKey, write.cacheValue, timestamp);
    }
    if (input.remove) {
      const deletedId = input.entityPathPrefix.split("/").at(-1);
      const relationField = input.entityPathPrefix.startsWith("/projects/") ? "projectId" : input.entityPathPrefix.startsWith("/tasks/") ? "parentTaskId" : null;
      if (relationField && deletedId) {
        const creates = await db.getAllAsync<{ id: string; body_json: string | null }>("SELECT id,body_json FROM sync_queue WHERE user_id=? AND path='/tasks' AND method='POST' AND status='pending'", input.userId);
        for (const create of creates) {
          try {
            const body = create.body_json ? JSON.parse(create.body_json) as Record<string, unknown> : {};
            if (body[relationField] === deletedId) await db.runAsync("UPDATE sync_queue SET body_json=?,updated_at=? WHERE id=?", JSON.stringify({ ...body, [relationField]: null }), timestamp, create.id);
          } catch { /* Keep malformed queued data intact for diagnosis. */ }
        }
      }
      await db.runAsync("DELETE FROM sync_queue WHERE user_id=? AND (id=? OR path=? OR path LIKE ?)", input.userId, row.id, input.entityPathPrefix, `${input.entityPathPrefix}/%`);
    }
    else {
      let body: Record<string, unknown> = {};
      try { body = row.body_json ? JSON.parse(row.body_json) as Record<string, unknown> : {}; } catch { return false; }
      const taskStatus = input.entityPathPrefix.startsWith("/tasks/") && typeof input.patch.status === "string" ? input.patch.status : null;
      const patch = { ...input.patch }; if (taskStatus) delete patch.status;
      await db.runAsync("UPDATE sync_queue SET body_json=?,updated_at=? WHERE id=?", JSON.stringify({ ...body, ...patch }), timestamp, row.id);
      if (taskStatus) {
        await db.runAsync("DELETE FROM sync_queue WHERE user_id=? AND method='PATCH' AND path=?", input.userId, input.entityPathPrefix);
        if (taskStatus === "done") {
          const followUpId = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; const idempotencyKey = `ht-${followUpId}`;
          await db.runAsync("INSERT INTO sync_queue(id,user_id,method,path,body_json,idempotency_key,status,attempts,next_attempt_at,created_at,updated_at) VALUES(?,?, 'PATCH', ?, ?, ?,'pending',0,?,?,?)", followUpId, input.userId, input.entityPathPrefix, JSON.stringify({ status: "done" }), idempotencyKey, timestamp, timestamp, timestamp);
        }
      }
    }
    return true;
  });
}

export async function listPendingCreates(userId: string, limit = 50): Promise<PendingMutation[]> {
  const db = await getDatabase();
  return db.getAllAsync<PendingMutation>("SELECT id,user_id AS userId,method,path,body_json AS body,idempotency_key AS idempotencyKey,status,attempts,next_attempt_at AS nextAttemptAt,created_at AS createdAt FROM sync_queue WHERE user_id=? AND status='pending' AND method='POST' AND path IN ('/tasks','/habits') AND next_attempt_at<=? ORDER BY rowid LIMIT ?", userId, now(), limit);
}

export async function listPendingMutations(userId: string, limit = 50): Promise<PendingMutation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PendingMutation>("SELECT id,user_id AS userId,method,path,body_json AS body,idempotency_key AS idempotencyKey,status,attempts,next_attempt_at AS nextAttemptAt,created_at AS createdAt FROM sync_queue WHERE user_id=? AND status='pending' ORDER BY rowid", userId);
  return readyQueuePrefix(rows, now(), limit);
}

export async function recordMutationFailure(id: string, attempts: number, message: string): Promise<void> {
  const db = await getDatabase();
  const seconds = Math.min(3600, 2 ** Math.min(attempts, 10));
  const nextAt = new Date(Date.now() + seconds * 1000).toISOString();
  await db.runAsync("UPDATE sync_queue SET attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?", attempts, nextAt, message.slice(0, 500), now(), id);
}

export async function acknowledgeMutation(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE id=?", id);
}

export async function pendingMutationCount(userId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM sync_queue WHERE user_id=?", userId);
  return row?.count ?? 0;
}

export async function clearLocalUserData(userId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const table of ["tasks", "projects", "habits", "habit_completions", "task_completions", "focus_sessions", "xp_transactions", "user_progress", "sync_queue", "api_cache"]) await db.runAsync(`DELETE FROM ${table} WHERE user_id=?`, userId);
    await db.runAsync("DELETE FROM milestones WHERE goal_id IN (SELECT id FROM goals WHERE user_id=?)", userId);
    await db.runAsync("DELETE FROM goals WHERE user_id=?", userId);
    await db.runAsync("DELETE FROM users WHERE id=?", userId);
  });
}
