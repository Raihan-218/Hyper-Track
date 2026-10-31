import { Router } from "express";
import { z } from "zod";
import { Habit } from "../models/Habit.js";
import { HabitCompletion } from "../models/HabitCompletion.js";
import { HabitScheduleSnapshot } from "../models/HabitScheduleSnapshot.js";
import { TaskCompletion } from "../models/TaskCompletion.js";
import { TaskPlanSnapshot } from "../models/TaskPlanSnapshot.js";
import { XPTransaction } from "../models/XPTransaction.js";
import { User } from "../models/User.js";
import { isDateKey, nextDateKey, startOfLocalDay } from "../services/dateMetrics.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const calendarRouter = Router();
calendarRouter.use(requireAuth);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDateKey, "Invalid calendar date");

calendarRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const from = dateSchema.parse(req.query.from);
    const to = dateSchema.parse(req.query.to);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (!Number.isInteger(days) || days < 0 || days > 62) { res.status(400).json({ error: "Calendar range must be between 1 and 63 days" }); return; }
    const [tasks, taskEvents, habitEvents, habits, user] = await Promise.all([
      TaskPlanSnapshot.find({ user: req.userId, plannedDate: { $gte: from, $lte: to } }).select("title priority plannedDate task assignedAt supersededAt").lean(),
      TaskCompletion.find({ user: req.userId, localDate: { $gte: from, $lte: to }, reversedAt: null }).select("localDate task title priority completedAt").lean(),
      HabitCompletion.find({ user: req.userId, localDate: { $gte: from, $lte: to }, reversedAt: null }).select("localDate habit name").lean(),
      HabitScheduleSnapshot.find({ user: req.userId, validFromAt: { $lte: new Date() } }).select("habit frequency daysOfWeek validFromAt validToAt").lean(),
      User.findById(req.userId).select("timezone").lean()
    ]);
    const todayParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: user?.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    const activity: Record<string, { plannedTasks: number; completedTasks: number; completedHabits: number; scheduledHabits: number }> = {};
    const getDay = (date: string) => activity[date] ??= { plannedTasks: 0, completedTasks: 0, completedHabits: 0, scheduledHabits: 0 };
    for (const task of tasks) {
      const end = new Date(startOfLocalDay(nextDateKey(task.plannedDate), user?.timezone || "UTC").getTime() - 1);
      if (task.assignedAt <= end && (!task.supersededAt || task.supersededAt > end)) getDay(task.plannedDate).plannedTasks += 1;
    }
    for (const event of taskEvents) getDay(event.localDate).completedTasks += 1;
    for (const event of habitEvents) getDay(event.localDate).completedHabits += 1;
    for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86_400_000) {
      const date = new Date(time).toISOString().slice(0, 10);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const end = new Date(startOfLocalDay(nextDateKey(date), user?.timezone || "UTC").getTime() - 1);
      for (const habit of habits) if (habit.validFromAt <= end && (!habit.validToAt || habit.validToAt > end) && (habit.frequency === "daily" || !habit.daysOfWeek?.length || habit.daysOfWeek.includes(weekday))) getDay(date).scheduledHabits += 1;
    }
    res.json({ from, to, days: activity, historyCoverage: "partial-before-completion-history-migration" });
  } catch (error) { next(error); }
});

calendarRouter.get("/day/:date", async (req: AuthRequest, res, next) => {
  try {
    const date = dateSchema.parse(req.params.date);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const [plannedTasks, completedTasks, habits, habitEvents, xpEvents, user] = await Promise.all([
      TaskPlanSnapshot.find({ user: req.userId, plannedDate: date }).select("title priority task assignedAt supersededAt").lean(),
      TaskCompletion.find({ user: req.userId, localDate: date }).select("task title priority completedAt reversedAt").lean(),
      HabitScheduleSnapshot.find({ user: req.userId, validFromAt: { $lte: new Date() } }).select("habit name frequency targetPerWeek daysOfWeek validFromAt validToAt").lean(),
      HabitCompletion.find({ user: req.userId, localDate: date }).select("habit name reflection reversedAt").lean(),
      XPTransaction.find({ user: req.userId, localDate: date }).select("amount").lean(),
      User.findById(req.userId).select("timezone").lean()
    ]);
    const activeTaskEvents = completedTasks.filter((event) => !event.reversedAt);
    const activeHabitEvents = habitEvents.filter((event) => !event.reversedAt);
    const completedHabitIds = new Set(activeHabitEvents.map((event) => String(event.habit)));
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: user?.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    const activeDate = date <= today;
    const now = new Date();
    const dayEnd = new Date(startOfLocalDay(nextDateKey(date), user?.timezone || "UTC").getTime() - 1);
    const asOf = date > today ? now : date === today && now < dayEnd ? now : dayEnd;
    const activeSchedules = habits.filter((habit) => habit.validFromAt <= asOf && (!habit.validToAt || habit.validToAt > asOf));
    const scheduledHabits = activeSchedules.filter((habit) => habit.frequency === "daily" || !habit.daysOfWeek?.length || habit.daysOfWeek.includes(weekday));
    const historicalPlans = plannedTasks.filter((task) => task.assignedAt <= asOf && (!task.supersededAt || task.supersededAt > asOf));
    const plannedIds = historicalPlans.map((task) => task.task);
    const stateEvents = plannedIds.length ? await TaskCompletion.find({ user: req.userId, task: { $in: plannedIds }, completedAt: { $lte: asOf } }).select("task completedAt reversedAt").lean() : [];
    const completedByAsOf = new Set(stateEvents.filter((event) => !event.reversedAt || event.reversedAt > asOf).map((event) => String(event.task)));
    const plannedWithStatus = historicalPlans.map((task) => ({ ...task, status: completedByAsOf.has(String(task.task)) ? "done" : "todo" }));
    const habitPercent = activeDate && scheduledHabits.length ? Math.round(scheduledHabits.filter((habit) => completedHabitIds.has(String(habit._id))).length / scheduledHabits.length * 100) : null;
    const taskPercent = activeDate && historicalPlans.length ? Math.min(100, Math.round(completedByAsOf.size / historicalPlans.length * 100)) : activeDate && activeTaskEvents.length ? 100 : null;
    const productivityScore = activeDate && (habitPercent !== null || taskPercent !== null) ? Math.round(((habitPercent ?? taskPercent ?? 0) + (taskPercent ?? habitPercent ?? 0)) / 2) : null;
    res.json({ date, isFuture: !activeDate, plannedTasks: plannedWithStatus, completedTasks, netCompletedTasks: activeTaskEvents, reversedTaskCompletions: completedTasks.filter((event) => event.reversedAt), pendingTasks: activeDate ? plannedWithStatus.filter((task) => task.status === "todo") : [], scheduledHabits: scheduledHabits.map((habit) => ({ _id: String(habit.habit), name: habit.name })), completedHabits: habitEvents, reversedHabitCompletions: habitEvents.filter((event) => event.reversedAt), habitCompletionPercent: habitPercent, productivityScore, xpEarned: xpEvents.reduce((sum, event) => sum + event.amount, 0), historicalPendingAvailable: true, historyCoverage: "partial-before-completion-history-migration" });
  } catch (error) { next(error); }
});
