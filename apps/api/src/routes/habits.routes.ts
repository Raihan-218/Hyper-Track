import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Habit } from "../models/Habit.js";
import { HabitCompletion } from "../models/HabitCompletion.js";
import { HabitScheduleSnapshot } from "../models/HabitScheduleSnapshot.js";
import { User } from "../models/User.js";
import { awardXp, reverseXp, XP_REWARDS } from "../services/gamification.js";
import { dateKeyAtInstant, isDateKey, nextDateKey, startOfLocalDay } from "../services/dateMetrics.js";
import { longestScheduledStreak } from "../services/habitStreaks.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const habitsRouter = Router();
habitsRouter.use(requireAuth);
async function captureHabitSchedule(userId: string, habit: { _id: unknown; name: string; frequency: "daily" | "weekly"; targetPerWeek: number; daysOfWeek: number[] }, validFromAt: Date) {
  await HabitScheduleSnapshot.create({ user: userId, habit: habit._id, name: habit.name, frequency: habit.frequency, targetPerWeek: habit.targetPerWeek, daysOfWeek: habit.daysOfWeek, validFromAt });
}
const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).optional(),
  category: z.string().trim().max(40).optional(),
  icon: z.string().max(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  targetPerWeek: z.number().int().min(1).max(7).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  clientMutationId: z.string().min(1).max(100).optional()
});
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format").refine(isDateKey, "Invalid calendar date");
const updateSchema = createSchema.partial();

habitsRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const habits = await Habit.find({ user: req.userId, archivedAt: null }).sort({ createdAt: -1 }).lean();
    res.json({ habits });
  } catch (error) { next(error); }
});

habitsRouter.get("/:id/analytics", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid habit ID" }); return; }
    const from = String(req.query.from ?? ""); const to = String(req.query.to ?? new Date().toISOString().slice(0, 10));
    if (!isDateKey(from) || !isDateKey(to)) { res.status(400).json({ error: "from and to must be valid YYYY-MM-DD dates" }); return; }
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (!Number.isInteger(span) || span < 0 || span > 365) { res.status(400).json({ error: "Date range must be between 1 and 366 days" }); return; }
    const [habit, events, schedules, user, streakEvents] = await Promise.all([
      Habit.findOne({ _id: req.params.id, user: req.userId }).select("name").lean(),
      HabitCompletion.find({ user: req.userId, habit: req.params.id, localDate: { $gte: from, $lte: to }, reversedAt: null }).select("localDate reflection").lean(),
      HabitScheduleSnapshot.find({ user: req.userId, habit: req.params.id, validFromAt: { $lte: new Date() } }).select("name frequency targetPerWeek daysOfWeek validFromAt validToAt").sort({ validFromAt: -1 }).lean(),
      User.findById(req.userId).select("timezone").lean(),
      HabitCompletion.find({ user: req.userId, habit: req.params.id, reversedAt: null }).select("localDate").lean()
    ]);
    if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }
    const completed = new Set(events.map((event) => event.localDate));
    let scheduled = 0; let successful = 0; const weekdays = Array(7).fill(0); const misses: string[] = [];
    for (let day = 0; day <= span; day += 1) {
      const date = new Date(Date.parse(`${from}T12:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const end = new Date(startOfLocalDay(nextDateKey(date), user?.timezone || "UTC").getTime() - 1);
      const schedule = schedules.find((item) => item.validFromAt <= end && (!item.validToAt || item.validToAt > end));
      const due = schedule?.frequency === "daily" || schedule?.frequency === "weekly" && !!schedule.daysOfWeek?.length && schedule.daysOfWeek.includes(weekday);
      if (due) { scheduled += 1; if (completed.has(date)) { successful += 1; weekdays[weekday] += 1; } else if (date < new Date().toISOString().slice(0, 10)) misses.push(date); }
    }
    const bestWeekdayIndex = weekdays.indexOf(Math.max(...weekdays));
    const currentSchedule = schedules.find((item) => !item.validToAt) ?? schedules[0];
    const streakDates = new Set(streakEvents.map((event) => event.localDate));
    const weeklyTarget = currentSchedule?.frequency === "weekly" && !currentSchedule.daysOfWeek?.length ? currentSchedule.targetPerWeek * (span + 1) / 7 : null;
    const today = dateKeyAtInstant(new Date(), user?.timezone || "UTC");
    const currentStreak = currentSchedule && (currentSchedule.frequency === "daily" || currentSchedule.daysOfWeek.length) ? streakFrom([...streakDates], currentSchedule.frequency, currentSchedule.daysOfWeek ?? [], today) : null;
    const longestStreak = longestScheduledStreak(streakEvents.map((event) => event.localDate), schedules, today, user?.timezone || "UTC");
    res.json({ habitId: String(habit._id), name: habit.name, from, to, totalCompletions: completed.size, scheduledDays: scheduled, missedScheduledDays: misses, completionPercent: scheduled ? Math.round(successful / scheduled * 100) : null, weeklyTargetCompletionPercent: weeklyTarget ? Math.min(100, Math.round(completed.size / weeklyTarget * 100)) : null, bestWeekday: Math.max(...weekdays) ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][bestWeekdayIndex] : null, completionDates: [...completed].sort(), currentStreak, longestStreak, historyCoverage: "partial-before-completion-history-migration" });
  } catch (error) { next(error); }
});

function streakFrom(dates: string[], frequency: "daily" | "weekly", daysOfWeek: number[], today: string): number {
  const done = new Set(dates); let cursor = new Date(`${today}T12:00:00Z`); let count = 0;
  const todayKey = today;
  for (let checked = 0; checked < 366; checked += 1) {
    const date = cursor.toISOString().slice(0, 10); const weekday = cursor.getUTCDay();
    if (frequency === "daily" || !daysOfWeek.length || daysOfWeek.includes(weekday)) { if (done.has(date)) count += 1; else if (date < todayKey) break; }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

habitsRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    if (input.clientMutationId) {
      const existing = await Habit.findOne({ user: req.userId, clientMutationId: input.clientMutationId }).lean();
      if (existing) {
        if (!await HabitScheduleSnapshot.exists({ user: req.userId, habit: existing._id })) await captureHabitSchedule(req.userId!, existing, existing.createdAt);
        res.status(200).json({ habit: existing }); return;
      }
    }
    const habit = await Habit.create({ ...input, user: req.userId });
    await captureHabitSchedule(req.userId!, habit, habit.createdAt);
    res.status(201).json({ habit });
  } catch (error) { next(error); }
});

habitsRouter.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid habit ID" }); return; }
    const input = updateSchema.parse(req.body);
    const current = await Habit.findOne({ _id: req.params.id, user: req.userId });
    if (!current) { res.status(404).json({ error: "Habit not found" }); return; }
    const scheduleChanged = (input.frequency !== undefined && input.frequency !== current.frequency) || (input.targetPerWeek !== undefined && input.targetPerWeek !== current.targetPerWeek) || (input.daysOfWeek !== undefined && JSON.stringify([...input.daysOfWeek].sort()) !== JSON.stringify([...current.daysOfWeek].sort()));
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }
    if (scheduleChanged) {
      const changedAt = new Date();
      await HabitScheduleSnapshot.findOneAndUpdate({ user: req.userId, habit: habit._id, validToAt: null }, { $set: { validToAt: changedAt } }, { sort: { validFromAt: -1 } });
      await captureHabitSchedule(req.userId!, habit, changedAt);
    }
    res.json({ habit });
  } catch (error) { next(error); }
});

habitsRouter.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid habit ID" }); return; }
    const habit = await Habit.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $set: { archivedAt: new Date() } }, { new: true });
    if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }
    await HabitScheduleSnapshot.findOneAndUpdate({ user: req.userId, habit: habit._id, validToAt: null }, { $set: { validToAt: habit.archivedAt ?? new Date() } });
    res.status(204).send();
  } catch (error) { next(error); }
});

habitsRouter.post("/:id/completions", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid habit ID" }); return; }
    const date = dateSchema.parse(req.body.date);
    const existing = await HabitCompletion.findOne({ user: req.userId, habit: req.params.id, localDate: date, reversedAt: null });
    if (existing) {
      const habit = await Habit.findOne({ _id: req.params.id, user: req.userId }).lean();
      if (habit) await awardXp({ userId: req.userId!, eventKey: `habit-completion:${existing._id}`, activityType: "habit", activityId: habit._id, description: existing.name, amount: XP_REWARDS.habit, localDate: date });
      res.json({ habit }); return;
    }
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, completions: { $ne: date } },
      { $addToSet: { completions: date } },
      { new: true, runValidators: true }
    );
    if (!habit) {
      const raced = await Habit.findOne({ _id: req.params.id, user: req.userId }).lean();
      if (raced?.completions.includes(date)) {
        const event = await HabitCompletion.findOne({ user: req.userId, habit: raced._id, localDate: date, reversedAt: null });
        if (event) await awardXp({ userId: req.userId!, eventKey: `habit-completion:${event._id}`, activityType: "habit", activityId: raced._id, description: event.name, amount: XP_REWARDS.habit, localDate: date });
        res.json({ habit: raced }); return;
      }
      res.status(404).json({ error: "Habit not found" }); return;
    }
    const user = await User.findById(req.userId).select("timezone").lean();
    const event = await HabitCompletion.create({ user: req.userId, habit: habit._id, name: habit.name, localDate: date, completedAt: new Date(), timezone: user?.timezone || "UTC" });
    await awardXp({ userId: req.userId!, eventKey: `habit-completion:${event._id}`, activityType: "habit", activityId: habit._id, description: habit.name, amount: XP_REWARDS.habit, localDate: date });
    res.json({ habit });
  } catch (error) { next(error); }
});

habitsRouter.delete("/:id/completions/:date", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid habit ID" }); return; }
    const date = dateSchema.parse(req.params.date);
    const event = await HabitCompletion.findOneAndUpdate({ user: req.userId, habit: req.params.id, localDate: date, reversedAt: null }, { $set: { reversedAt: new Date() } }, { new: false });
    if (event) await reverseXp(req.userId!, `habit-completion:${event._id}`);
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $pull: { completions: date } },
      { new: true }
    );
    if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }
    res.json({ habit });
  } catch (error) { next(error); }
});
