export type QueueSchedule = { status: string; nextAttemptAt: string };

/** Keeps dependent mutations in persisted FIFO order when an earlier item backs off. */
export function readyQueuePrefix<T extends QueueSchedule>(rows: T[], now: string, limit: number): T[] {
  const ready: T[] = [];
  for (const row of rows) {
    if (row.status !== "pending" || row.nextAttemptAt > now || ready.length >= limit) break;
    ready.push(row);
  }
  return ready;
}
