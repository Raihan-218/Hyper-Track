import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearToken, getRefreshToken, getToken, saveRefreshToken, saveToken } from "./auth";
import { acknowledgeMutation, commitOfflineMutation, enqueueMutation, getCachedResponse, listPendingMutations, pendingMutationCount, recordMutationFailure, saveCachedResponse } from "../database/localStore";
import { applyOfflineMutation, createLocalObjectId, hasLocalOfflineEntity } from "./offlineMutations";

const rawUrl = process.env.EXPO_PUBLIC_API_URL;
const API_URL =
  Platform.OS === "web" && rawUrl?.includes("10.0.2.2")
    ? rawUrl.replace("10.0.2.2", "localhost")
    : rawUrl ?? "http://localhost:4000/api";

if (!rawUrl) console.warn("EXPO_PUBLIC_API_URL is not configured; defaulting to " + API_URL);

let refreshInFlight: Promise<string | null | "offline"> | null = null;
let queueFlushInFlight: Promise<void> | null = null;
const offlineRequests = new Set<string>();
const CACHE_PREFIX = "hyper_track_api_cache:";
const QUEUE_KEY = "hyper_track_offline_create_queue";

type QueuedCreate = { path: string; body: Record<string, unknown>; createdAt: string };

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly mayHaveApplied: boolean) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function flushPendingMutations(accessToken: string, userId: string | null): Promise<void> {
  if (!userId) return;
  if (!queueFlushInFlight) {
    queueFlushInFlight = (async () => {
      // Import the previous AsyncStorage queue once, without discarding it until
      // each entry has been durably copied into SQLite.
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) {
        try {
          const legacy = JSON.parse(raw) as QueuedCreate[];
          for (const item of legacy) await enqueueMutation({ userId, method: "POST", path: item.path, body: JSON.stringify(item.body), idempotencyKey: typeof item.body.clientMutationId === "string" ? item.body.clientMutationId : undefined });
          await AsyncStorage.removeItem(QUEUE_KEY);
        } catch { /* Keep the old queue intact if its import fails. */ }
      }
      const pending = await listPendingMutations(userId);
      for (const item of pending) {
        try {
          const response = await fetch(`${API_URL}${item.path}`, {
            method: item.method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "Idempotency-Key": item.idempotencyKey }, body: item.body ?? undefined
          });
          if (!response.ok && !(response.status === 404 && item.method === "DELETE")) {
            await recordMutationFailure(item.id, item.attempts + 1, `HTTP ${response.status}`);
            // Keep FIFO dependencies intact: later edits may depend on this create.
            break;
          }
          await acknowledgeMutation(item.id);
          offlineRequests.delete(item.path);
        } catch (error) {
          await recordMutationFailure(item.id, item.attempts + 1, error instanceof Error ? error.message : "Network request failed");
          break;
        }
      }
    })().finally(() => { queueFlushInFlight = null; });
  }
  await queueFlushInFlight;
}

export async function clearOfflineApiData(): Promise<void> {
  // Keep SQLite rows and pending mutations across logout/refresh failures.
  // Account IDs scope every row, so another account cannot read this cache.
  const token = await getToken(); const userId = token ? tokenUserId(token) : null;
  const keys = await AsyncStorage.getAllKeys();
  let migratedLegacyQueue = false;
  if (userId) {
    const rawQueue = await AsyncStorage.getItem(QUEUE_KEY);
    if (rawQueue) {
      try {
        const legacy = JSON.parse(rawQueue) as QueuedCreate[];
        for (const item of legacy) await enqueueMutation({ userId, method: "POST", path: item.path, body: JSON.stringify(item.body), idempotencyKey: typeof item.body.clientMutationId === "string" ? item.body.clientMutationId : undefined });
        migratedLegacyQueue = true;
      } catch { migratedLegacyQueue = false; }
    }
  }
  const removable = keys.filter((key) => key.startsWith(CACHE_PREFIX) || (key === QUEUE_KEY && migratedLegacyQueue));
  if (removable.length) await AsyncStorage.multiRemove(removable);
  offlineRequests.clear();
}

// The JWT subject is used only to scope this device's cache; it is never used
// as authentication or sent to the API in place of the signed token.
function tokenUserId(token: string): string | null {
  try {
    const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!encoded || typeof globalThis.atob !== "function") return null;
    const payload = JSON.parse(globalThis.atob(encoded)) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}

async function readCached<T>(userId: string | null, path: string): Promise<T | null> {
  const cacheKey = `${CACHE_PREFIX}${path}`;
  if (userId) {
    const stored = await getCachedResponse<T>(userId, cacheKey).catch(() => null);
    if (stored !== null) return stored;
  }
  const legacy = await AsyncStorage.getItem(cacheKey);
  if (!legacy) return null;
  try {
    const value = JSON.parse(legacy) as T;
    // Old path-only cache entries have no owner metadata. Accept them only when
    // the cached profile itself proves it belongs to this authenticated user.
    if (userId) {
      if (path !== "/auth/me") {
        const profile = await AsyncStorage.getItem(`${CACHE_PREFIX}/auth/me`);
        if (!profile) return null;
        const parsed = JSON.parse(profile) as { user?: { _id?: string; id?: string } };
        if ((parsed.user?._id ?? parsed.user?.id) !== userId) return null;
      } else {
        const profile = value as { user?: { _id?: string; id?: string } };
        if ((profile.user?._id ?? profile.user?.id) !== userId) return null;
      }
      await saveCachedResponse(userId, cacheKey, value).catch(() => undefined);
    }
    return value;
  } catch { return null; }
}

export function isApiOffline(): boolean { return offlineRequests.size > 0; }

export async function getCachedApiResponse<T>(path: string): Promise<T | null> {
  const token = await getToken();
  return readCached<T>(token ? tokenUserId(token) : null, path);
}

export async function syncPendingChanges(): Promise<void> {
  const token = await getToken();
  if (token) await flushPendingMutations(token, tokenUserId(token));
}

export async function getPendingSyncCount(): Promise<number> {
  const token = await getToken(); const userId = token ? tokenUserId(token) : null;
  return userId ? pendingMutationCount(userId).catch(() => 0) : 0;
}

async function cacheOfflineCreate(path: string, body: Record<string, unknown>, userId: string | null): Promise<unknown> {
  if (!userId) throw new Error("Sign in while online before creating offline data.");
  const localId = createLocalObjectId();
  const createdAt = new Date().toISOString();
  const queuedBody = { ...body, _id: localId, clientMutationId: `offline-${localId}` };
  if (path === "/tasks") {
    const [projectData, taskData] = await Promise.all([
      getCachedResponse<{ projects?: Array<{ _id: string; name: string }> }>(userId, `${CACHE_PREFIX}/projects`),
      getCachedResponse<{ tasks?: Array<{ _id: string; title: string }>; total?: number }>(userId, `${CACHE_PREFIX}/tasks?limit=100`)
    ]);
    const projects = projectData?.projects ?? [];
    const tasks = taskData?.tasks ?? [];
    const task = { ...body, _id: localId, clientMutationId: queuedBody.clientMutationId, localOnly: true, status: body.status ?? "todo", priority: body.priority ?? "medium", project: projects.find((project) => project._id === body.projectId) ?? null, parentTask: tasks.find((parent) => parent._id === body.parentTaskId) ?? null, createdAt, updatedAt: createdAt };
    const cacheKey = `${CACHE_PREFIX}/tasks?limit=100`;
    const data: { tasks?: unknown[]; total?: number } = taskData ?? { tasks: [], total: 0 };
    data.tasks = [task, ...(data.tasks ?? [])]; data.total = (data.total ?? 0) + 1;
    await commitOfflineMutation({ userId, cacheKey, cacheValue: data, method: "POST", path, body: JSON.stringify(queuedBody), idempotencyKey: String(queuedBody.clientMutationId) });
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    return { task };
  }
  const habit = { ...body, _id: localId, clientMutationId: queuedBody.clientMutationId, localOnly: true, frequency: body.frequency ?? "daily", targetPerWeek: body.targetPerWeek ?? 7, completions: [], createdAt, updatedAt: createdAt };
  const cacheKey = `${CACHE_PREFIX}/habits`;
  const cached = await getCachedResponse<{ habits?: unknown[] }>(userId, cacheKey);
  const data = cached ?? { habits: [] };
  data.habits = [habit, ...(data.habits ?? [])];
  await commitOfflineMutation({ userId, cacheKey, cacheValue: data, method: "POST", path, body: JSON.stringify(queuedBody), idempotencyKey: String(queuedBody.clientMutationId) });
  await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
  return { habit };
}

async function refreshAccessToken(): Promise<string | null | "offline"> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken })
        });
        if (!response.ok) { await clearOfflineApiData(); await clearToken(); return null; }
        const rotated = await response.json() as { token: string; refreshToken: string };
        await Promise.all([saveToken(rotated.token), saveRefreshToken(rotated.refreshToken)]);
        return rotated.token;
      } catch { return "offline"; }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error("API URL is missing. Set EXPO_PUBLIC_API_URL in apps/mobile/.env.");
  const token = await getToken();
  const userId = token ? tokenUserId(token) : null;
  const method = (options.method ?? "GET").toUpperCase();
  if (userId && (method === "PATCH" || method === "DELETE") && await hasLocalOfflineEntity(userId, path)) {
    const localResult = await applyOfflineMutation(userId, method, path, typeof options.body === "string" ? options.body : undefined);
    if (localResult !== null) return localResult as T;
  }
  if (method === "GET" && token) await flushPendingMutations(token, userId);
  const send = (accessToken: string | null) => fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers }
  });
  let response: Response;
  try { response = await send(token); }
  catch (error) {
    offlineRequests.add(path);
    if (method === "GET") {
      const cached = await readCached<T>(userId, path);
      if (cached !== null) return cached;
    }
    if (method === "POST" && ["/tasks", "/habits"].includes(path)) {
      const body = typeof options.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : {};
      return await cacheOfflineCreate(path, body, userId) as T;
    }
    if (userId && method !== "GET") {
      const localResult = await applyOfflineMutation(userId, method, path, typeof options.body === "string" ? options.body : undefined);
      if (localResult !== null) return localResult as T;
    }
    throw error;
  }
  offlineRequests.delete(path);
  if (response.status === 401 && !["/auth/login", "/auth/register", "/auth/refresh"].includes(path)) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      if (method === "GET") await flushPendingMutations(refreshedToken, userId);
      response = await send(refreshedToken);
    } else if (refreshedToken === "offline") {
      offlineRequests.add(path);
      if (method === "GET") {
        const cached = await readCached<T>(userId, path);
        if (cached !== null) return cached;
      }
      if (method === "POST" && ["/tasks", "/habits"].includes(path)) {
        const body = typeof options.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : {};
        return await cacheOfflineCreate(path, body, userId) as T;
      }
    }
  }
  if (response.status === 204) return undefined as T;
  const payloadValue = await response.json().catch(() => ({}));
  const payload = payloadValue && typeof payloadValue === "object" ? payloadValue as { error?: unknown; source?: unknown; details?: unknown } : {};
  if (!response.ok) {
    const details = Array.isArray(payload.details)
      ? (payload.details as Array<{ path?: unknown; message?: unknown }>).slice(0, 3)
          .filter((item) => !!item && typeof item === "object" && typeof item.message === "string")
          .map((item) => `${typeof item.path === "string" && item.path ? `${item.path.replace(/([a-z])([A-Z])/g, "$1 $2")}: ` : ""}${item.message}`)
      : [];
    const message = [typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`, ...details].join(" ");
    throw new ApiRequestError(message, response.status, payload.source === "persistence-validation" || response.status >= 500);
  }
  if (method === "GET") {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${path}`, JSON.stringify(payload));
    const responseUserId = userId ?? (path === "/auth/me" && payload && typeof payload === "object" && "user" in payload
      ? String(((payload as { user?: { _id?: string; id?: string } }).user?._id ?? (payload as { user?: { id?: string } }).user?.id) ?? "")
      : "");
    if (responseUserId) await saveCachedResponse(responseUserId, `${CACHE_PREFIX}${path}`, payload).catch(() => undefined);
  }
  if (method === "POST" && ["/auth/login", "/auth/register"].includes(path) && payload && typeof payload === "object" && "user" in payload) {
    const profile = payload as { user?: { _id?: string; id?: string } };
    const responseUserId = profile.user?._id ?? profile.user?.id;
    if (responseUserId) {
      const meKey = `${CACHE_PREFIX}/auth/me`;
      const mePayload = { user: profile.user };
      await saveCachedResponse(responseUserId, meKey, mePayload).catch(() => undefined);
      await AsyncStorage.setItem(meKey, JSON.stringify(mePayload));
    }
  }
  return payload as T;
}
