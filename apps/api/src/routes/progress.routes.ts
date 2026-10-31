import { Router } from "express";
import { User } from "../models/User.js";
import { TaskCompletion } from "../models/TaskCompletion.js";
import { HabitCompletion } from "../models/HabitCompletion.js";
import { isDateKey } from "../services/dateMetrics.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const progressRouter = Router();
progressRouter.use(requireAuth);

function dateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

progressRouter.get("/weekly", async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.userId).select("timezone").lean();
    const timezone = user?.timezone || "UTC";
    const today = dateKey(new Date(), timezone);
    const end = new Date(`${today}T00:00:00.000Z`);
    const days = Array.from({ length: 7 }, (_, index) =>
      new Date(end.getTime() - (6 - index) * 86_400_000).toISOString().slice(0, 10)
    );
    const [tasks, habits] = await Promise.all([
      TaskCompletion.find({ user: req.userId, localDate: { $gte: days[0], $lte: today }, reversedAt: null }).select("localDate").lean(),
      HabitCompletion.find({ user: req.userId, localDate: { $gte: days[0], $lte: today }, reversedAt: null }).select("localDate").lean()
    ]);
    const daily = days.map((date) => ({
      date,
      tasksCompleted: tasks.filter((task) => task.localDate === date).length,
      habitsCompleted: habits.filter((habit) => habit.localDate === date).length
    }));
    res.json({ timezone, days: daily, totals: {
      tasksCompleted: daily.reduce((sum, day) => sum + day.tasksCompleted, 0),
      habitCompletions: daily.reduce((sum, day) => sum + day.habitsCompleted, 0)
    } });
  } catch (error) { next(error); }
});

progressRouter.get("/summary", async (req: AuthRequest, res, next) => {
  try {
    const from = String(req.query.from ?? ""); const to = String(req.query.to ?? "");
    if (!isDateKey(from) || !isDateKey(to)) { res.status(400).json({ error: "from and to must be valid YYYY-MM-DD dates" }); return; }
    const count = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (!Number.isInteger(count) || count < 0 || count > 365) { res.status(400).json({ error: "Date range must be between 1 and 366 days" }); return; }
    const [tasks, habits] = await Promise.all([
      TaskCompletion.find({ user: req.userId, localDate: { $gte: from, $lte: to }, reversedAt: null }).select("localDate").lean(),
      HabitCompletion.find({ user: req.userId, localDate: { $gte: from, $lte: to }, reversedAt: null }).select("localDate").lean()
    ]);
    const days = Array.from({ length: count + 1 }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)).map((date) => ({ date, tasksCompleted: tasks.filter((item) => item.localDate === date).length, habitsCompleted: habits.filter((item) => item.localDate === date).length }));
    const totalTasks = tasks.length; const totalHabits = habits.length;
    res.json({ from, to, days, totals: { tasksCompleted: totalTasks, habitCompletions: totalHabits }, mostProductiveDay: days.reduce((best, item) => item.tasksCompleted + item.habitsCompleted > best.tasksCompleted + best.habitsCompleted ? item : best, days[0]) });
  } catch (error) { next(error); }
});
