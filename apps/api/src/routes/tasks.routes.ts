import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Task } from "../models/Task.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);
const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueDate: z.string().datetime().optional()
});
const updateSchema = createSchema.partial();

tasksRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const filter: Record<string, unknown> = { user: req.userId };
    if (req.query.status && ["todo", "in_progress", "done"].includes(String(req.query.status))) filter.status = req.query.status;
    const tasks = await Task.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ tasks });
  } catch (error) { next(error); }
});

tasksRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const task = await Task.create({ ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined, user: req.userId });
    res.status(201).json({ task });
  } catch (error) { next(error); }
});

tasksRouter.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid task ID" }); return; }
    const input = updateSchema.parse(req.body);
    const update: Record<string, unknown> = { ...input };
    if (input.dueDate) update.dueDate = new Date(input.dueDate);
    const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.userId }, { $set: update }, { new: true, runValidators: true });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json({ task });
  } catch (error) { next(error); }
});

tasksRouter.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid task ID" }); return; }
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.status(204).send();
  } catch (error) { next(error); }
});
