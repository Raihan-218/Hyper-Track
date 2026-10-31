import { Router } from "express";
import { HabitCompletion } from "../models/HabitCompletion.js";
import { TaskCompletion } from "../models/TaskCompletion.js";
import { UserGamification } from "../models/UserGamification.js";
import { XPTransaction } from "../models/XPTransaction.js";
import { User } from "../models/User.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { levelForXp } from "../services/levels.js";
import { longestConsecutive } from "../services/dateMetrics.js";

export const gamificationRouter = Router();
gamificationRouter.use(requireAuth);
const levelNames = ["Beginner", "Getting Started", "Consistent", "Disciplined", "Focused", "Achiever", "Elite", "Master", "Champion", "Legendary"];
gamificationRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const [game, taskEvents, habitEvents, transactions, user] = await Promise.all([
      UserGamification.findOne({ user: req.userId }).lean(),
      TaskCompletion.find({ user: req.userId }).select("localDate reversedAt").lean(),
      HabitCompletion.find({ user: req.userId }).select("localDate reversedAt").lean(),
      XPTransaction.find({ user: req.userId }).sort({ createdAt: -1 }).limit(30).select("amount description localDate createdAt").lean(),
      User.findById(req.userId).select("timezone").lean()
    ]);
    const dates = [...taskEvents, ...habitEvents].map((event) => event.localDate);
    const activeDates = [...taskEvents.filter((event) => !event.reversedAt), ...habitEvents.filter((event) => !event.reversedAt)].map((event) => event.localDate);
    const totalXp = game?.totalXp ?? 0;
    const level = levelForXp(totalXp);
    const weeklyTaskCounts = new Map<string, number>();
    for (const event of taskEvents) {
      const date = new Date(`${event.localDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      const key = date.toISOString().slice(0, 10); weeklyTaskCounts.set(key, (weeklyTaskCounts.get(key) ?? 0) + 1);
    }
    const achievements = [
      { id: "first_step", name: "First Step", description: "Complete your first task.", unlocked: taskEvents.length > 0 },
      { id: "dedicated", name: "Dedicated", description: "Complete 30 habit check-ins.", unlocked: habitEvents.length >= 30 },
      { id: "consistency", name: "Consistency", description: "Record activity on seven consecutive days.", unlocked: longestConsecutive(dates) >= 7 },
      { id: "productive", name: "Productive", description: "Complete 20 tasks in one week.", unlocked: Math.max(0, ...weeklyTaskCounts.values()) >= 20 },
    ];
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: user?.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    const todayTasks = taskEvents.filter((event) => !event.reversedAt && event.localDate === today).length;
    res.json({ totalXp, ...level, levelName: levelNames[Math.min(level.level - 1, levelNames.length - 1)], currentStreak: longestConsecutive(activeDates) && activeDates.includes(today) ? (() => { let count = 0; let cursor = today; const set = new Set(activeDates); while (set.has(cursor)) { count += 1; cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10); } return count; })() : 0, longestStreak: longestConsecutive(activeDates), achievements, challenges: [{ id: `three-tasks-${today}`, title: "Three task wins", description: "Complete three tasks today.", progress: Math.min(todayTasks, 3), target: 3, completed: todayTasks >= 3, deadline: today }], recentTransactions: transactions });
  } catch (error) { next(error); }
});
