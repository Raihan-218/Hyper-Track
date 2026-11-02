/** Completion history can contain multiple events for one task, so use the event record identity. */
export function taskCompletionEventKey(event: { _id: string }): string {
  return event._id;
}

/** Collapse repeated copies of the same API record while preserving separate events for one task. */
export function uniqueTaskCompletionEvents<T extends { _id: string }>(events: T[]): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event._id)) return false;
    seen.add(event._id);
    return true;
  });
}
