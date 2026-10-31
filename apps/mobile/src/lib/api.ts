import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearToken, getRefreshToken, getToken, saveRefreshToken, saveToken } from "./auth";

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

async function flushQueuedCreates(accessToken: string): Promise<void> {
  if (!queueFlushInFlight) {
    queueFlushInFlight = (async () => {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      let queue: QueuedCreate[];
      try { queue = JSON.parse(raw) as QueuedCreate[]; } catch { await AsyncStorage.removeItem(QUEUE_KEY); return; }
      const remaining: QueuedCreate[] = [];
      for (const item of queue) {
        try {
          const response = await fetch(`${API_URL}${item.path}`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(item.body)
          });
          if (!response.ok && response.status < 500 && response.status !== 401) { offlineRequests.delete(item.path); continue; }
          if (!response.ok) remaining.push(item);
          else offlineRequests.delete(item.path);
        } catch { remaining.push(item); }
      }
      if (remaining.length) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      else await AsyncStorage.removeItem(QUEUE_KEY);
    })().finally(() => { queueFlushInFlight = null; });
  }
  await queueFlushInFlight;
}

export async function clearOfflineApiData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const removable = keys.filter((key) => key.startsWith(CACHE_PREFIX) || key === QUEUE_KEY);
  if (removable.length) await AsyncStorage.multiRemove(removable);
  offlineRequests.clear();
}

export function isApiOffline(): boolean { return offlineRequests.size > 0; }

async function cacheOfflineCreate(path: string, body: Record<string, unknown>): Promise<unknown> {
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const queuedBody = { ...body, clientMutationId: `offline-${localId}` };
  const entry: QueuedCreate = { path, body: queuedBody, createdAt };
  const rawQueue = await AsyncStorage.getItem(QUEUE_KEY);
  const queue = rawQueue ? JSON.parse(rawQueue) as QueuedCreate[] : [];
  queue.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

  if (path === "/tasks") {
    const task = { ...body, _id: localId, status: body.status ?? "todo", priority: body.priority ?? "medium", project: null, parentTask: null, createdAt, updatedAt: createdAt };
    const cacheKey = `${CACHE_PREFIX}/tasks?limit=100`;
    const cached = await AsyncStorage.getItem(cacheKey);
    const data = cached ? JSON.parse(cached) as { tasks?: unknown[]; total?: number } : { tasks: [], total: 0 };
    data.tasks = [task, ...(data.tasks ?? [])]; data.total = (data.total ?? 0) + 1;
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    return { task };
  }
  const habit = { ...body, _id: localId, frequency: body.frequency ?? "daily", targetPerWeek: body.targetPerWeek ?? 7, completions: [], createdAt, updatedAt: createdAt };
  const cacheKey = `${CACHE_PREFIX}/habits`;
  const cached = await AsyncStorage.getItem(cacheKey);
  const data = cached ? JSON.parse(cached) as { habits?: unknown[] } : { habits: [] };
  data.habits = [habit, ...(data.habits ?? [])];
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
        if (!response.ok) { await clearToken(); await clearOfflineApiData(); return null; }
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
  const method = (options.method ?? "GET").toUpperCase();
  if (method === "GET" && token) await flushQueuedCreates(token);
  const send = (accessToken: string | null) => fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers }
  });
  let response: Response;
  try { response = await send(token); }
  catch (error) {
    offlineRequests.add(path);
    if (method === "GET") {
      const cached = await AsyncStorage.getItem(`${CACHE_PREFIX}${path}`);
      if (cached) return JSON.parse(cached) as T;
    }
    if (method === "POST" && ["/tasks", "/habits"].includes(path)) {
      const body = typeof options.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : {};
      return await cacheOfflineCreate(path, body) as T;
    }
    throw error;
  }
  offlineRequests.delete(path);
  if (response.status === 401 && !["/auth/login", "/auth/register", "/auth/refresh"].includes(path)) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      if (method === "GET") await flushQueuedCreates(refreshedToken);
      response = await send(refreshedToken);
    } else if (refreshedToken === "offline") {
      offlineRequests.add(path);
      if (method === "GET") {
        const cached = await AsyncStorage.getItem(`${CACHE_PREFIX}${path}`);
        if (cached) return JSON.parse(cached) as T;
      }
      if (method === "POST" && ["/tasks", "/habits"].includes(path)) {
        const body = typeof options.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : {};
        return await cacheOfflineCreate(path, body) as T;
      }
    }
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  if (method === "GET") await AsyncStorage.setItem(`${CACHE_PREFIX}${path}`, JSON.stringify(payload));
  return payload as T;
}
