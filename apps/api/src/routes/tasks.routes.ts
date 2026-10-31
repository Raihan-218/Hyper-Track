import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Task } from "../models/Task.js";
import { Project } from "../models/Project.js";
import { TaskCompletion } from "../models/TaskCompletion.js";
import { TaskPlanSnapshot } from "../models/TaskPlanSnapshot.js";
import { User } from "../models/User.js";
import { awardXp, reverseXp, XP_REWARDS } from "../services/gamification.js";
import { isDateKey, shiftLocalInstant } from "../services/dateMetrics.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);
function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDateKey, "Invalid calendar date").nullable().optional(),
  reminderAt: z.string().datetime().nullable().optional(),
  recurrence: z.enum(["none", "daily", "weekly"]).optional(),
  projectId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  parentTaskId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  clientMutationId: z.string().min(1).max(100).optional()
});
const updateSchema = createSchema.partial();

function shiftDateKey(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

tasksRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const filter: Record<string, unknown> = { user: req.userId, archivedAt: null };
    if (req.query.status && ["todo", "in_progress", "done"].includes(String(req.query.status))) filter.status = req.query.status;
    if (req.query.priority && ["low", "medium", "high"].includes(String(req.query.priority))) filter.priority = req.query.priority;
    if (typeof req.query.projectId === "string" && mongoose.isValidObjectId(req.query.projectId)) filter.project = req.query.projectId;
    if (typeof req.query.q === "string" && req.query.q.trim()) filter.title = { $regex: req.query.q.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (typeof req.query.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.plannedDate)) filter.plannedDate = req.query.plannedDate;
    const [tasks, total] = await Promise.all([
      Task.find(filter).populate("project", "name").populate("parentTask", "title").sort({ dueDate: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Task.countDocuments(filter)
    ]);
    res.json({ tasks, page, limit, total });
  } catch (error) { next(error); }
});

tasksRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    if (input.clientMutationId) {
      const existing = await Task.findOne({ user: req.userId, clientMutationId: input.clientMutationId }).lean();
      if (existing) {
        if (existing.plannedDate && !await TaskPlanSnapshot.exists({ user: req.userId, task: existing._id })) await TaskPlanSnapshot.create({ user: req.userId, task: existing._id, title: existing.title, priority: existing.priority, plannedDate: existing.plannedDate, assignedAt: existing.createdAt });
        if (existing.status === "done") {
          const event = await TaskCompletion.findOne({ user: req.userId, task: existing._id, reversedAt: null }).sort({ completedAt: -1 });
          if (event) await awardXp({ userId: req.userId!, eventKey: `task-completion:${event._id}`, activityType: "task", activityId: existing._id, description: event.title, amount: event.priority === "high" ? XP_REWARDS.highPriorityTask : XP_REWARDS.task, localDate: event.localDate });
        }
        res.status(200).json({ task: existing }); return;
      }
    }
    if (input.projectId && !await Project.exists({ _id: input.projectId, user: req.userId, archivedAt: null })) { res.status(400).json({ error: "Project not found" }); return; }
    if (input.parentTaskId && !await Task.exists({ _id: input.parentTaskId, user: req.userId, archivedAt: null, parentTask: null })) { res.status(400).json({ error: "Parent task not found" }); return; }
    const { projectId, parentTaskId, ...taskInput } = input;
    const completedAt = input.status === "done" ? new Date() : undefined;
    const task = await Task.create({ ...taskInput, project: projectId || null, parentTask: parentTaskId || null, dueDate: input.dueDate ? new Date(input.dueDate) : undefined, reminderAt: input.reminderAt ? new Date(input.reminderAt) : null, completedAt, user: req.userId });
    if (task.plannedDate) await TaskPlanSnapshot.create({ user: req.userId, task: task._id, title: task.title, priority: task.priority, plannedDate: task.plannedDate, assignedAt: task.createdAt });
    if (completedAt) {
      const user = await User.findById(req.userId).select("timezone").lean();
      const timezone = user?.timezone || "UTC";
      const event = await TaskCompletion.create({ user: req.userId, task: task._id, title: task.title, priority: task.priority, completedAt, localDate: localDate(completedAt, timezone), timezone });
      await awardXp({ userId: req.userId!, eventKey: `task-completion:${event._id}`, activityType: "task", activityId: task._id, description: task.title, amount: task.priority === "high" ? XP_REWARDS.highPriorityTask : XP_REWARDS.task, localDate: event.localDate });
    }
    res.status(201).json({ task });
  } catch (error) { next(error); }
});

tasksRouter.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid task ID" }); return; }
    const input = updateSchema.parse(req.body);
    if (input.projectId && !await Project.exists({ _id: input.projectId, user: req.userId, archivedAt: null })) { res.status(400).json({ error: "Project not found" }); return; }
    if (input.parentTaskId && (input.parentTaskId === req.params.id || !await Task.exists({ _id: input.parentTaskId, user: req.userId, archivedAt: null, parentTask: null }))) { res.status(400).json({ error: "Parent task not found" }); return; }
    const current = await Task.findOne({ _id: req.params.id, user: req.userId, archivedAt: null }).lean();
    if (!current) { res.status(404).json({ error: "Task not found" }); return; }
    const update: Record<string, unknown> = { ...input };
    if (input.projectId !== undefined) { update.project = input.projectId; delete update.projectId; }
    if (input.parentTaskId !== undefined) { update.parentTask = input.parentTaskId; delete update.parentTaskId; }
    if (input.dueDate !== undefined) update.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.reminderAt !== undefined) update.reminderAt = input.reminderAt ? new Date(input.reminderAt) : null;
    const newlyCompleted = input.status === "done" && current.status !== "done";
    const undone = input.status !== undefined && input.status !== "done" && current.status === "done";
    const completionTime = newlyCompleted ? new Date() : undefined;
    if (input.status === "done") update.completedAt = completionTime ?? current.completedAt;
    if (undone) update.completedAt = null;
    const changedPlanDate = input.plannedDate !== undefined && input.plannedDate !== current.plannedDate;
    const changedAt = new Date();
    const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $set: update }, { new: true, runValidators: true });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    if (changedPlanDate && current.plannedDate) await TaskPlanSnapshot.findOneAndUpdate({ user: req.userId, task: current._id, plannedDate: current.plannedDate, supersededAt: null }, { $set: { supersededAt: changedAt } }, { sort: { assignedAt: -1 } });
    if (changedPlanDate && task.plannedDate) await TaskPlanSnapshot.create({ user: req.userId, task: task._id, title: task.title, priority: task.priority, plannedDate: task.plannedDate, assignedAt: changedAt });
    if (newlyCompleted && completionTime) {
      const user = await User.findById(req.userId).select("timezone").lean();
      const timezone = user?.timezone || "UTC";
      const event = await TaskCompletion.create({ user: req.userId, task: task._id, title: task.title, priority: task.priority, completedAt: completionTime, localDate: localDate(completionTime, timezone), timezone });
      await awardXp({ userId: req.userId!, eventKey: `task-completion:${event._id}`, activityType: "task", activityId: task._id, description: task.title, amount: task.priority === "high" ? XP_REWARDS.highPriorityTask : XP_REWARDS.task, localDate: event.localDate });
    } else if (undone) {
      const event = await TaskCompletion.findOneAndUpdate({ user: req.userId, task: task._id, reversedAt: null }, { $set: { reversedAt: new Date() } }, { sort: { completedAt: -1 }, new: false });
      if (event) await reverseXp(req.userId!, `task-completion:${event._id}`);
    } else if (input.status === "done" && current.status === "done") {
      const event = await TaskCompletion.findOne({ user: req.userId, task: task._id, reversedAt: null }).sort({ completedAt: -1 });
      if (event) await awardXp({ userId: req.userId!, eventKey: `task-completion:${event._id}`, activityType: "task", activityId: task._id, description: event.title, amount: event.priority === "high" ? XP_REWARDS.highPriorityTask : XP_REWARDS.task, localDate: event.localDate });
    } else if (undone === false && input.status && input.status !== "done") {
      const previous = await TaskCompletion.findOne({ user: req.userId, task: task._id, reversedAt: { $ne: null } }).sort({ completedAt: -1 });
      if (previous) await reverseXp(req.userId!, `task-completion:${previous._id}`);
    }
    if (input.status === "done" && current.status !== "done" && current.recurrence && current.recurrence !== "none") {
      const offset = current.recurrence === "daily" ? 1 : 7;
      const recurringUser = await User.findById(req.userId).select("timezone").lean();
      const nextDueDate = current.dueDate ? shiftLocalInstant(current.dueDate, offset, recurringUser?.timezone || "UTC") : undefined;
      const nextTask = await Task.create({
        user: req.userId, title: current.title, description: current.description,
        priority: current.priority, status: "todo", recurrence: current.recurrence,
        dueDate: nextDueDate, plannedDate: current.plannedDate ? shiftDateKey(current.plannedDate, offset) : undefined,
        project: current.project, parentTask: current.parentTask
      });
      if (nextTask.plannedDate) await TaskPlanSnapshot.create({ user: req.userId, task: nextTask._id, title: nextTask.title, priority: nextTask.priority, plannedDate: nextTask.plannedDate, assignedAt: nextTask.createdAt });
    }
    res.json({ task });
  } catch (error) { next(error); }
});

tasksRouter.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid task ID" }); return; }
    const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $set: { archivedAt: new Date() } }, { new: true });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    await Task.updateMany({ user: req.userId, parentTask: task._id, archivedAt: null }, { $set: { archivedAt: new Date() } });
    res.status(204).send();
  } catch (error) { next(error); }
});
