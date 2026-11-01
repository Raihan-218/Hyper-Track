import { dateKeyAtInstant, nextDateKey, startOfLocalDay } from "./dateMetrics.js";

export type HabitSchedulePeriod = {
  frequency: "daily" | "weekly";
  daysOfWeek: number[];
  validFromAt: Date;
  validToAt?: Date | null;
};

/** Longest consecutive run of completed days on which the recorded schedule required a check-in. */
export function longestScheduledStreak(completionDates: string[], schedules: HabitSchedulePeriod[], today: string, timezone: string): number | null {
  if (!schedules.length) return 0;
  const start = schedules.map((schedule) => dateKeyAtInstant(schedule.validFromAt, timezone)).sort()[0];
  const completed = new Set(completionDates);
  let longest = 0;
  let current = 0;
  for (let date = start; date <= today; date = nextDateKey(date)) {
    const dayEnd = new Date(startOfLocalDay(nextDateKey(date), timezone).getTime() - 1);
    const schedule = schedules.find((item) => item.validFromAt <= dayEnd && (!item.validToAt || item.validToAt > dayEnd));
    if (!schedule) { current = 0; continue; }
    if (schedule.frequency === "weekly" && schedule.daysOfWeek.length === 0) { current = 0; continue; }
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const due = schedule.frequency === "daily" || schedule.daysOfWeek.includes(weekday);
    if (!due) continue;
    current = completed.has(date) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
