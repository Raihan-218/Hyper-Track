/**
 * Node-test fallback only. Metro selects localStore.native.ts or
 * localStore.web.ts for supported app platforms; tests that exercise pure
 * offline transforms do not initialize a native SQLite module.
 */
export type PendingMutation = { id: string; userId: string; method: string; path: string; body: string | null; idempotencyKey: string; status: string; attempts: number; nextAttemptAt: string; createdAt: string };
const unsupported = async (): Promise<never> => { throw new Error("No local-store platform adapter is available in this runtime."); };
export function getCachedResponse<T>(_userId: string, _cacheKey: string): Promise<T | null> { return unsupported(); }
export function saveCachedResponse(_userId: string, _cacheKey: string, _value: unknown): Promise<void> { return unsupported(); }
export function enqueueMutation(_input: { userId: string; method: string; path: string; body?: string; idempotencyKey?: string }): Promise<void> { return unsupported(); }
export function commitOfflineMutation(_input: { userId: string; cacheKey?: string; cacheValue?: unknown; cacheWrites?: Array<{ cacheKey: string; cacheValue: unknown }>; method: string; path: string; body: string; idempotencyKey: string }): Promise<void> { return unsupported(); }
export function commitQueuedCreateEdit(_input: { userId: string; idempotencyKey: string; entityPathPrefix: string; patch: Record<string, unknown>; remove: boolean; cacheWrites: Array<{ cacheKey: string; cacheValue: unknown }> }): Promise<boolean> { return unsupported(); }
export function listPendingCreates(_userId: string, _limit?: number): Promise<PendingMutation[]> { return unsupported(); }
export function listPendingMutations(_userId: string, _limit?: number): Promise<PendingMutation[]> { return unsupported(); }
export function recordMutationFailure(_id: string, _attempts: number, _message: string): Promise<void> { return unsupported(); }
export function acknowledgeMutation(_id: string): Promise<void> { return unsupported(); }
export function pendingMutationCount(_userId: string): Promise<number> { return unsupported(); }
export function clearLocalUserData(_userId: string): Promise<void> { return unsupported(); }
