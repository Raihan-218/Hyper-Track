import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { FocusSession } from "../models/FocusSession.js";
import { Task } from "../models/Task.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const focusRouter = Router();
focusRouter.use(requireAuth);
focusRouter.get("/", async (req: AuthRequest, res, next) => {
  try { const [active, recent] = await Promise.all([FocusSession.findOne({ user: req.userId, status: "active" }).lean(), FocusSession.find({ user: req.userId, status: { $ne: "active" } }).sort({ startedAt: -1 }).limit(30).lean()]); res.json({ active, recent }); }
  catch (error) { next(error); }
});
focusRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const input = z.object({ plannedMinutes: z.number().int().min(1).max(180), taskId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional() }).parse(req.body);
    if (input.taskId && !await Task.exists({ _id: input.taskId, user: req.userId, archivedAt: null })) { res.status(400).json({ error: "Task not found" }); return; }
    if (await FocusSession.exists({ user: req.userId, status: "active" })) { res.status(409).json({ error: "A focus session is already active" }); return; }
    const session = await FocusSession.create({ user: req.userId, task: input.taskId ?? null, plannedMinutes: input.plannedMinutes, startedAt: new Date() }); res.status(201).json({ session });
  } catch (error) { next(error); }
});
focusRouter.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid session ID" }); return; }
    const { status } = z.object({ status: z.enum(["completed", "cancelled"]) }).parse(req.body);
    const session = await FocusSession.findOne({ _id: req.params.id, user: req.userId, status: "active" });
    if (!session) { res.status(404).json({ error: "Active focus session not found" }); return; }
    session.endedAt = new Date(); session.actualSeconds = Math.max(0, Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)); session.status = status; await session.save();
    res.json({ session });
  } catch (error) { next(error); }
});
