import { Router } from "express";
import { Habit } from "../models/Habit.js";
import { HabitCompletion } from "../models/HabitCompletion.js";
import { Task } from "../models/Task.js";
import { TaskCompletion } from "../models/TaskCompletion.js";
import { XPTransaction } from "../models/XPTransaction.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const exportRouter = Router();
exportRouter.use(requireAuth);
exportRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const [tasks, habits, taskHistory, habitHistory, rewards] = await Promise.all([
      Task.find({ user: req.userId }).select("title description priority status plannedDate dueDate completedAt createdAt updatedAt archivedAt").lean(),
      Habit.find({ user: req.userId }).select("name description category frequency targetPerWeek daysOfWeek completions createdAt archivedAt").lean(),
      TaskCompletion.find({ user: req.userId }).select("task title priority localDate completedAt timezone source reversedAt").lean(),
      HabitCompletion.find({ user: req.userId }).select("habit name localDate completedAt timezone reflection reversedAt").lean(),
      XPTransaction.find({ user: req.userId }).select("activityType description amount localDate createdAt reverses").lean()
    ]);
    const data = { exportedAt: new Date().toISOString(), tasks, habits, taskHistory, habitHistory, rewards };
    if (req.query.format === "csv") {
      const fields = ["recordType", "id", "name", "date", "status", "amount", "timezone"];
      const rows: Array<Record<string, unknown>> = [
        ...tasks.map((item) => ({ recordType: "task", id: item._id, name: item.title, date: item.plannedDate, status: item.status })),
        ...habits.map((item) => ({ recordType: "habit", id: item._id, name: item.name, date: item.createdAt, status: item.archivedAt ? "archived" : "active" })),
        ...taskHistory.map((item) => ({ recordType: "task_completion", id: item.task, name: item.title, date: item.localDate, status: item.reversedAt ? "reversed" : "completed", timezone: item.timezone })),
        ...habitHistory.map((item) => ({ recordType: "habit_completion", id: item.habit, name: item.name, date: item.localDate, status: item.reversedAt ? "reversed" : "completed", timezone: item.timezone })),
        ...rewards.map((item) => ({ recordType: "xp", id: item._id, name: item.description, date: item.localDate, amount: item.amount }))
      ];
      const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      res.type("text/csv").attachment("hyper-track-export.csv").send([fields.join(","), ...rows.map((row) => fields.map((field) => quote(row[field])).join(","))].join("\n"));
    } else { res.type("application/json").attachment("hyper-track-export.json").send(JSON.stringify(data, null, 2)); }
  } catch (error) { next(error); }
});
