export function longestConsecutive(dates: string[]): number {
  const unique = [...new Set(dates)].sort();
  let longest = 0; let current = 0; let previous = "";
  for (const date of unique) {
    const next = previous ? Date.parse(`${previous}T00:00:00Z`) + 86_400_000 : 0;
    current = previous && Date.parse(`${date}T00:00:00Z`) === next ? current + 1 : 1;
    longest = Math.max(longest, current); previous = date;
  }
  return longest;
}

export function dateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`); const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  return Array.from({ length: (end - start) / 86_400_000 + 1 }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function startOfLocalDay(dateKey: string, timezone: string): Date {
  if (!isDateKey(dateKey)) throw new Error("Invalid date key");
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute), Number(fields.second));
    guess += target - represented;
  }
  return new Date(guess);
}

export function nextDateKey(dateKey: string): string {
  const next = new Date(`${dateKey}T00:00:00.000Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10);
}

export function dateKeyAtInstant(date: Date, timezone: string): string {
  const parts = localParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localParts(date: Date, timezone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
}

function localDateTimeToInstant(dateKey: string, hour: number, minute: number, second: number, timezone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desired;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts = localParts(new Date(guess), timezone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += desired - represented;
  }
  let candidate = new Date(guess);
  let actual = localParts(candidate, timezone);
  if (actual.year === String(year).padStart(4, "0") && actual.month === String(month).padStart(2, "0") && actual.day === String(day).padStart(2, "0") && actual.hour === String(hour).padStart(2, "0") && actual.minute === String(minute).padStart(2, "0")) return candidate;
  // A recurrence landing in a daylight-saving gap moves to the first valid local minute after the gap.
  for (let offset = -180; offset <= 180; offset += 1) {
    candidate = new Date(guess + offset * 60_000);
    actual = localParts(candidate, timezone);
    if (actual.year === String(year).padStart(4, "0") && actual.month === String(month).padStart(2, "0") && actual.day === String(day).padStart(2, "0") && Number(actual.hour) * 60 + Number(actual.minute) >= hour * 60 + minute) return candidate;
  }
  throw new Error("Could not resolve local recurrence time in timezone");
}

export function shiftLocalInstant(instant: Date, days: number, timezone: string): Date {
  const parts = localParts(instant, timezone);
  const originalDate = `${parts.year}-${parts.month}-${parts.day}`;
  const nextDate = new Date(`${originalDate}T00:00:00.000Z`); nextDate.setUTCDate(nextDate.getUTCDate() + days);
  const dateKey = nextDate.toISOString().slice(0, 10);
  return localDateTimeToInstant(dateKey, Number(parts.hour), Number(parts.minute), Number(parts.second), timezone);
}
