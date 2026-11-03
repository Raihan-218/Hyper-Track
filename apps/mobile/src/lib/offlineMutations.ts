import { commitOfflineMutation, commitQueuedCreateEdit, getCachedResponse } from "../database/localStore";

type CachedWrite = { cacheKey: string; cacheValue: unknown };
export type OfflineMutationResult = { writes: CachedWrite[]; response: unknown };
export type OfflineSnapshots = {
  tasksPage: { tasks?: Array<Record<string, unknown>>; total?: number } | null;
  habitsData: { habits?: Array<Record<string, unknown>> } | null;
  projectsData: { projects?: Array<Record<string, unknown>> } | null;
  goalsData: { goals?: Array<Record<string, unknown>> } | null;
  profileData: { user?: Record<string, unknown> } | null;
  focusData: { active?: Record<string, unknown> | null; recent?: Array<Record<string, unknown>> } | null;
};
const now = () => new Date().toISOString();
export function createLocalObjectId(): string {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const parseObject = (raw: string | undefined): Record<string, unknown> => {
  if (!raw) return {};
  try { const value = JSON.parse(raw) as unknown; return value && typeof value === "object" ? value as Record<string, unknown> : {}; } catch { return {}; }
};
const idOf = (value: unknown) => value && typeof value === "object" ? String((value as { _id?: string })._id ?? "") : typeof value === "string" ? value : "";

async function transform(userId: string, method: string, path: string, body: Record<string, unknown>): Promise<OfflineMutationResult | null> {
  const [tasksPage, habitsData, projectsData, goalsData, profileData, focusData] = await Promise.all([
    getCachedResponse<{ tasks?: Array<Record<string, unknown>>; total?: number }>(userId, "hyper_track_api_cache:/tasks?limit=100"),
    getCachedResponse<{ habits?: Array<Record<string, unknown>> }>(userId, "hyper_track_api_cache:/habits"),
    getCachedResponse<{ projects?: Array<Record<string, unknown>> }>(userId, "hyper_track_api_cache:/projects"),
    getCachedResponse<{ goals?: Array<Record<string, unknown>> }>(userId, "hyper_track_api_cache:/goals"),
    getCachedResponse<{ user?: Record<string, unknown> }>(userId, "hyper_track_api_cache:/auth/me"),
    getCachedResponse<{ active?: Record<string, unknown> | null; recent?: Array<Record<string, unknown>> }>(userId, "hyper_track_api_cache:/focus")
  ]);
  return transformOfflineSnapshot(method, path, body, { tasksPage, habitsData, projectsData, goalsData, profileData, focusData });
}

export function transformOfflineSnapshot(method: string, path: string, body: Record<string, unknown>, snapshots: OfflineSnapshots, timestamp = now()): OfflineMutationResult | null {
  const { tasksPage, habitsData, projectsData, goalsData, profileData, focusData } = snapshots;
  const route = path.split("?")[0];
  const taskMatch = route.match(/^\/tasks\/([^/]+)$/);
  if (method === "POST" && route === "/tasks" && tasksPage) {
    const id = createLocalObjectId(); const task = { ...body, _id: id, clientMutationId: `offline-${id}`, localOnly: true, status: body.status ?? "todo", priority: body.priority ?? "medium", project: null, parentTask: null, createdAt: timestamp, updatedAt: timestamp };
    const next = { ...tasksPage, tasks: [task, ...(tasksPage.tasks ?? [])], total: (tasksPage.total ?? tasksPage.tasks?.length ?? 0) + 1 };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/tasks?limit=100", cacheValue: next }], response: { task } };
  }
  if (taskMatch && tasksPage && (method === "PATCH" || method === "DELETE")) {
    const existing = tasksPage.tasks?.find((task) => task._id === taskMatch[1]); if (!existing) return null;
    const nextTasks = method === "DELETE" && existing.localOnly === true ? (tasksPage.tasks ?? []).filter((task) => task._id !== taskMatch[1]).map((task) => idOf(task.parentTask) === taskMatch[1] ? { ...task, parentTask: null, parentTaskId: null } : task) : (tasksPage.tasks ?? []).map((task) => task._id !== taskMatch[1] ? task : method === "DELETE"
      ? { ...task, archivedAt: timestamp, updatedAt: timestamp }
      : { ...task, ...body, ...(body.projectId !== undefined ? { project: null, projectId: undefined } : {}), ...(body.parentTaskId !== undefined ? { parentTask: null, parentTaskId: undefined } : {}), ...(body.status === "done" && task.status !== "done" ? { completedAt: timestamp } : {}), ...(body.status && body.status !== "done" ? { completedAt: null } : {}), updatedAt: timestamp });
    return { writes: [{ cacheKey: "hyper_track_api_cache:/tasks?limit=100", cacheValue: { ...tasksPage, tasks: nextTasks } }], response: method === "DELETE" ? undefined : { task: nextTasks.find((task) => task._id === taskMatch[1]) } };
  }
  const habitMatch = route.match(/^\/habits\/([^/]+)(?:\/completions(?:\/([^/]+))?)?$/);
  if (method === "POST" && route === "/habits" && habitsData) {
    const id = createLocalObjectId(); const habit = { ...body, _id: id, clientMutationId: `offline-${id}`, localOnly: true, frequency: body.frequency ?? "daily", targetPerWeek: body.targetPerWeek ?? 7, daysOfWeek: body.daysOfWeek ?? [], completions: [], createdAt: timestamp, updatedAt: timestamp };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/habits", cacheValue: { ...habitsData, habits: [habit, ...(habitsData.habits ?? [])] } }], response: { habit } };
  }
  if (habitMatch && habitsData && (method === "PATCH" || method === "DELETE" || method === "POST")) {
    const habitId = habitMatch[1]; const existing = habitsData.habits?.find((habit) => habit._id === habitId); if (!existing) return null;
    let updated: Record<string, unknown>;
    if (method === "DELETE" && !habitMatch[2]) updated = { ...existing, archivedAt: timestamp, updatedAt: timestamp };
    else if (method === "POST" && habitMatch[2] === undefined) {
      const date = typeof body.date === "string" ? body.date : ""; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      updated = { ...existing, completions: [...new Set([...(Array.isArray(existing.completions) ? existing.completions as string[] : []), date])], updatedAt: timestamp };
    } else if (method === "DELETE" && habitMatch[2]) {
      const date = habitMatch[2]; updated = { ...existing, completions: (Array.isArray(existing.completions) ? existing.completions as string[] : []).filter((item) => item !== date), updatedAt: timestamp };
    } else if (method === "PATCH" && !habitMatch[2]) updated = { ...existing, ...body, updatedAt: timestamp };
    else return null;
    const nextHabits = method === "DELETE" && existing.localOnly === true ? (habitsData.habits ?? []).filter((habit) => habit._id !== habitId) : (habitsData.habits ?? []).map((habit) => habit._id === habitId ? updated : habit);
    return { writes: [{ cacheKey: "hyper_track_api_cache:/habits", cacheValue: { ...habitsData, habits: nextHabits } }], response: method === "DELETE" ? undefined : { habit: updated } };
  }
  const projectMatch = route.match(/^\/projects\/([^/]+)$/);
  if (projectMatch && projectsData && (method === "PATCH" || method === "DELETE")) {
    const existing = projectsData.projects?.find((project) => project._id === projectMatch[1]); if (!existing) return null;
    const updated = method === "DELETE" ? { ...existing, archivedAt: timestamp, updatedAt: timestamp } : { ...existing, ...body, updatedAt: timestamp };
    const writes: CachedWrite[] = [{ cacheKey: "hyper_track_api_cache:/projects", cacheValue: { ...projectsData, projects: (projectsData.projects ?? []).map((project) => project._id === projectMatch[1] ? updated : project) } }];
    if (method === "DELETE" && tasksPage) writes.push({ cacheKey: "hyper_track_api_cache:/tasks?limit=100", cacheValue: { ...tasksPage, tasks: (tasksPage.tasks ?? []).map((task) => idOf(task.project) === projectMatch[1] ? { ...task, project: null, updatedAt: timestamp } : task) } });
    return { writes, response: method === "DELETE" ? undefined : { project: updated } };
  }
  if (method === "POST" && route === "/projects" && projectsData) {
    const id = createLocalObjectId(); const project = { ...body, _id: id, clientMutationId: `offline-${id}`, localOnly: true, status: body.status ?? "active", archivedAt: null, createdAt: timestamp, updatedAt: timestamp };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/projects", cacheValue: { ...projectsData, projects: [project, ...(projectsData.projects ?? [])] } }], response: { project } };
  }
  const goalMatch = route.match(/^\/goals\/([^/]+)(?:\/milestones(?:\/([^/]+))?)?$/);
  if (goalMatch && goalsData && (method === "PATCH" || method === "DELETE")) {
    const existing = goalsData.goals?.find((goal) => goal._id === goalMatch[1]); if (!existing) return null;
    let updated: Record<string, unknown>;
    if (method === "DELETE" && !goalMatch[2]) updated = { ...existing, archivedAt: timestamp, updatedAt: timestamp };
    else if (goalMatch[2]) {
      const milestones = Array.isArray(existing.milestones) ? existing.milestones as Array<Record<string, unknown>> : [];
      const nextMilestones = milestones.map((milestone) => milestone._id === goalMatch[2] ? { ...milestone, completedAt: body.completed ? milestone.completedAt ?? timestamp : null, updatedAt: timestamp } : milestone);
      if (!nextMilestones.some((milestone) => milestone._id === goalMatch[2])) return null;
      updated = { ...existing, milestones: nextMilestones, updatedAt: timestamp };
    } else updated = { ...existing, ...body, updatedAt: timestamp };
    const writes = [{ cacheKey: "hyper_track_api_cache:/goals", cacheValue: { ...goalsData, goals: (goalsData.goals ?? []).map((goal) => goal._id === goalMatch[1] ? updated : goal) } }];
    return { writes, response: method === "DELETE" ? undefined : { goal: updated } };
  }
  if (method === "POST" && route === "/goals" && goalsData) {
    const id = createLocalObjectId(); const goal = { ...body, _id: id, clientMutationId: `offline-${id}`, localOnly: true, status: "active", milestones: [], archivedAt: null, createdAt: timestamp, updatedAt: timestamp };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/goals", cacheValue: { ...goalsData, goals: [goal, ...(goalsData.goals ?? [])] } }], response: { goal } };
  }
  if (method === "POST" && goalMatch && goalMatch[2] === undefined && route.endsWith("/milestones") && goalsData) {
    const goalId = goalMatch[1]; const existing = goalsData.goals?.find((goal) => goal._id === goalId); if (!existing) return null;
    const id = createLocalObjectId(); const milestone = { title: String(body.title ?? ""), _id: id, clientMutationId: `offline-${id}`, localOnly: true, completedAt: null, createdAt: timestamp, updatedAt: timestamp };
    const updated = { ...existing, milestones: [...(Array.isArray(existing.milestones) ? existing.milestones as Array<Record<string, unknown>> : []), milestone], updatedAt: timestamp };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/goals", cacheValue: { ...goalsData, goals: (goalsData.goals ?? []).map((goal) => goal._id === goalId ? updated : goal) } }], response: { goal: updated } };
  }
  if (method === "PATCH" && route === "/auth/me" && profileData?.user) {
    const user = { ...profileData.user, ...body, updatedAt: timestamp };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/auth/me", cacheValue: { ...profileData, user } }], response: { user } };
  }
  if (method === "POST" && route === "/focus") {
    const id = createLocalObjectId();
    const session = { ...body, _id: id, clientMutationId: `offline-${id}`, localOnly: true, startedAt: timestamp, endedAt: null, actualSeconds: 0, status: "active", createdAt: timestamp, updatedAt: timestamp };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/focus", cacheValue: { ...(focusData ?? {}), active: session, recent: focusData?.recent ?? [] } }], response: { session } };
  }
  const focusMatch = route.match(/^\/focus\/([^/]+)$/);
  if (method === "PATCH" && focusMatch && focusData?.active?._id === focusMatch[1]) {
    const active = focusData.active;
    const startedAt = typeof active.startedAt === "string" ? Date.parse(active.startedAt) : Date.now();
    const session = { ...active, status: body.status, endedAt: timestamp, actualSeconds: Math.max(0, Math.floor((Date.parse(timestamp) - startedAt) / 1000)), updatedAt: timestamp };
    return { writes: [{ cacheKey: "hyper_track_api_cache:/focus", cacheValue: { ...focusData, active: null, recent: [session, ...(focusData.recent ?? [])] } }], response: { session } };
  }
  return null;
}

export async function applyOfflineMutation(userId: string, method: string, path: string, bodyText?: string): Promise<unknown | null> {
  const methodUpper = method.toUpperCase(); const body = parseObject(bodyText);
  const pendingEntity = await getLocalOfflineRecord(userId, path);
  const result = await transform(userId, methodUpper, path, body);
  if (!result) return null;
  const route = path.split("?")[0];
  if (pendingEntity && (methodUpper === "PATCH" || methodUpper === "DELETE")) {
    if (/^\/goals\/[^/]+\/milestones\/[^/]+$/.test(route) || /^\/focus\/[^/]+$/.test(route)) {
      await commitOfflineMutation({ userId, cacheWrites: result.writes, method: methodUpper, path, body: bodyText ?? "{}", idempotencyKey: `offline-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      return result.response;
    }
    const edited = await commitQueuedCreateEdit({ userId, idempotencyKey: String(pendingEntity.clientMutationId), entityPathPrefix: route, patch: body, remove: methodUpper === "DELETE", cacheWrites: result.writes });
    return edited ? result.response : null;
  }
  const mutationId = `offline-op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const queuedBody = { ...body };
  if (methodUpper === "POST") {
    let created: Record<string, unknown> | undefined;
    if (route === "/projects") created = (result.response as { project?: Record<string, unknown> }).project;
    else if (route === "/goals") created = (result.response as { goal?: Record<string, unknown> }).goal;
    else if (route === "/focus") created = (result.response as { session?: Record<string, unknown> }).session;
    else if (/^\/goals\/[^/]+\/milestones$/.test(route)) {
      const goal = (result.response as { goal?: Record<string, unknown> }).goal;
      const milestones = Array.isArray(goal?.milestones) ? goal.milestones as Array<Record<string, unknown>> : [];
      created = milestones.at(-1);
    }
    if (created?._id && created.clientMutationId) { queuedBody._id = created._id; queuedBody.clientMutationId = created.clientMutationId; }
    if (route === "/focus" && typeof created?.startedAt === "string") queuedBody.startedAt = created.startedAt;
  }
  const idempotencyKey = typeof queuedBody.clientMutationId === "string" ? queuedBody.clientMutationId : mutationId;
  await commitOfflineMutation({ userId, cacheWrites: result.writes, method: methodUpper, path, body: JSON.stringify(queuedBody), idempotencyKey });
  return result.response;
}

export async function getLocalOfflineRecord(userId: string, path: string): Promise<Record<string, unknown> | null> {
  const route = path.split("?")[0];
  const milestoneMatch = route.match(/^\/goals\/([^/]+)\/milestones\/([^/]+)$/);
  if (milestoneMatch) {
    const data = await getCachedResponse<{ goals?: Array<Record<string, unknown>> }>(userId, "hyper_track_api_cache:/goals");
    const goal = data?.goals?.find((item) => item._id === milestoneMatch[1]);
    const milestones = Array.isArray(goal?.milestones) ? goal.milestones as Array<Record<string, unknown>> : [];
    return milestones.find((item) => item._id === milestoneMatch[2] && item.localOnly === true) ?? null;
  }
  const focusMatch = route.match(/^\/focus\/([^/]+)$/);
  if (focusMatch) {
    const data = await getCachedResponse<{ active?: Record<string, unknown> | null; recent?: Array<Record<string, unknown>> }>(userId, "hyper_track_api_cache:/focus");
    const active = data?.active;
    return active?._id === focusMatch[1] && active.localOnly === true ? active : null;
  }
  const match = route.match(/^\/(tasks|habits|projects|goals)\/([^/]+)$/); if (!match) return null;
  const key = match[1] === "tasks" ? "hyper_track_api_cache:/tasks?limit=100" : `hyper_track_api_cache:/${match[1]}`;
  const data = await getCachedResponse<Record<string, unknown>>(userId, key);
  const list = Array.isArray(data?.[match[1]]) ? data[match[1]] as Array<Record<string, unknown>> : [];
  return list.find((item) => item._id === match[2] && item.localOnly === true) ?? null;
}

export async function hasLocalOfflineEntity(userId: string, path: string): Promise<boolean> {
  return (await getLocalOfflineRecord(userId, path)) !== null;
}

