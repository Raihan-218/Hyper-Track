import AsyncStorage from "@react-native-async-storage/async-storage";
import { readyQueuePrefix } from "./queuePolicy";

const CACHE = "hyper_track_sqlite_compat_cache:";
const QUEUE = "hyper_track_sqlite_compat_queue:";
const now = () => new Date().toISOString();
export type PendingMutation = { id: string; userId: string; method: string; path: string; body: string | null; idempotencyKey: string; status: string; attempts: number; nextAttemptAt: string; createdAt: string };

export async function getCachedResponse<T>(userId: string, key: string): Promise<T | null> {
  const value = await AsyncStorage.getItem(`${CACHE}${userId}:${key}`);
  try { return value ? JSON.parse(value) as T : null; } catch { return null; }
}
export async function saveCachedResponse(userId: string, key: string, value: unknown): Promise<void> { await AsyncStorage.setItem(`${CACHE}${userId}:${key}`, JSON.stringify(value)); }
async function readQueue(userId: string): Promise<PendingMutation[]> {
  const raw = await AsyncStorage.getItem(`${QUEUE}${userId}`);
  try { return raw ? JSON.parse(raw) as PendingMutation[] : []; } catch { return []; }
}
async function writeQueue(userId: string, queue: PendingMutation[]): Promise<void> { await AsyncStorage.setItem(`${QUEUE}${userId}`, JSON.stringify(queue)); }
export async function enqueueMutation(input: { userId: string; method: string; path: string; body?: string; idempotencyKey?: string }): Promise<void> {
  const queue = await readQueue(input.userId); const createdAt = now(); const id = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const idempotencyKey = input.idempotencyKey ?? `ht-${id}`;
  if (queue.some((item) => item.idempotencyKey === idempotencyKey)) return;
  queue.push({ id, userId: input.userId, method: input.method, path: input.path, body: input.body ?? null, idempotencyKey, status: "pending", attempts: 0, nextAttemptAt: createdAt, createdAt }); await writeQueue(input.userId, queue);
}
export async function commitOfflineMutation(input: { userId: string; cacheKey?: string; cacheValue?: unknown; cacheWrites?: Array<{ cacheKey: string; cacheValue: unknown }>; method: string; path: string; body: string; idempotencyKey: string }): Promise<void> {
  const writes = input.cacheWrites ?? (input.cacheKey ? [{ cacheKey: input.cacheKey, cacheValue: input.cacheValue }] : []);
  const previous = await Promise.all(writes.map((write) => getCachedResponse(input.userId, write.cacheKey))); const queue = await readQueue(input.userId); const createdAt = now(); const id = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    for (const write of writes) await saveCachedResponse(input.userId, write.cacheKey, write.cacheValue);
    queue.push({ id, userId: input.userId, method: input.method, path: input.path, body: input.body, idempotencyKey: input.idempotencyKey, status: "pending", attempts: 0, nextAttemptAt: createdAt, createdAt }); await writeQueue(input.userId, queue);
  } catch (error) { for (let index = 0; index < writes.length; index += 1) if (previous[index] !== null) await saveCachedResponse(input.userId, writes[index].cacheKey, previous[index]); throw error; }
}
export async function commitQueuedCreateEdit(input: { userId: string; idempotencyKey: string; entityPathPrefix: string; patch: Record<string, unknown>; remove: boolean; cacheWrites: Array<{ cacheKey: string; cacheValue: unknown }> }): Promise<boolean> {
  const queue = await readQueue(input.userId); const index = queue.findIndex((item) => item.idempotencyKey === input.idempotencyKey && item.method === "POST" && item.status === "pending"); if (index < 0) return false;
  const previous = await Promise.all(input.cacheWrites.map((write) => getCachedResponse(input.userId, write.cacheKey)));
  try { for (const write of input.cacheWrites) await saveCachedResponse(input.userId, write.cacheKey, write.cacheValue);
    if (input.remove) {
      const deletedId = input.entityPathPrefix.split("/").at(-1); const relationField = input.entityPathPrefix.startsWith("/projects/") ? "projectId" : input.entityPathPrefix.startsWith("/tasks/") ? "parentTaskId" : null;
      if (relationField && deletedId) for (const item of queue) if (item.path === "/tasks" && item.method === "POST" && item.body) { try { const body = JSON.parse(item.body) as Record<string, unknown>; if (body[relationField] === deletedId) item.body = JSON.stringify({ ...body, [relationField]: null }); } catch { /* Retain malformed queue rows. */ } }
      for (let cursor = queue.length - 1; cursor >= 0; cursor -= 1) if (cursor === index || queue[cursor].path === input.entityPathPrefix || queue[cursor].path.startsWith(`${input.entityPathPrefix}/`)) queue.splice(cursor, 1);
    }
    else {
      const body = queue[index].body ? JSON.parse(queue[index].body!) as Record<string, unknown> : {};
      const taskStatus = input.entityPathPrefix.startsWith("/tasks/") && typeof input.patch.status === "string" ? input.patch.status : null;
      const patch = { ...input.patch }; if (taskStatus) delete patch.status;
      queue[index].body = JSON.stringify({ ...body, ...patch });
      if (taskStatus) {
        for (let cursor = queue.length - 1; cursor >= 0; cursor -= 1) if (queue[cursor].method === "PATCH" && queue[cursor].path === input.entityPathPrefix) queue.splice(cursor, 1);
        if (taskStatus === "done") { const createdAt = now(); const id = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; queue.push({ id, userId: input.userId, method: "PATCH", path: input.entityPathPrefix, body: JSON.stringify({ status: "done" }), idempotencyKey: `ht-${id}`, status: "pending", attempts: 0, nextAttemptAt: createdAt, createdAt }); }
      }
    }
    await writeQueue(input.userId, queue); return true;
  } catch (error) { for (let i=0;i<input.cacheWrites.length;i+=1) if (previous[i] !== null) await saveCachedResponse(input.userId,input.cacheWrites[i].cacheKey,previous[i]); throw error; }
}
export async function listPendingCreates(userId: string, limit = 50): Promise<PendingMutation[]> { return (await readQueue(userId)).filter((item) => item.status === "pending" && item.method === "POST" && ["/tasks", "/habits"].includes(item.path) && item.nextAttemptAt <= now()).slice(0, limit); }
export async function listPendingMutations(userId: string, limit = 50): Promise<PendingMutation[]> { return readyQueuePrefix(await readQueue(userId), now(), limit); }
export async function pendingMutationCount(userId: string): Promise<number> { return (await readQueue(userId)).length; }
export async function recordMutationFailure(id: string, attempts: number, message: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  for (const key of allKeys.filter((value) => value.startsWith(QUEUE))) { const queue = await readQueue(key.slice(QUEUE.length)); const item = queue.find((entry) => entry.id === id); if (!item) continue; item.attempts = attempts; item.nextAttemptAt = new Date(Date.now() + Math.min(3600, 2 ** Math.min(attempts, 10)) * 1000).toISOString(); await writeQueue(item.userId, queue); break; }
  void message;
}
export async function acknowledgeMutation(id: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  for (const key of allKeys.filter((value) => value.startsWith(QUEUE))) { const userId = key.slice(QUEUE.length); const queue = await readQueue(userId); const next = queue.filter((item) => item.id !== id); if (next.length !== queue.length) { await writeQueue(userId, next); break; } }
}
export async function clearLocalUserData(userId: string): Promise<void> { const keys = await AsyncStorage.getAllKeys(); await AsyncStorage.multiRemove(keys.filter((key) => key.includes(`:${userId}:`) || key === `${QUEUE}${userId}`)); }
