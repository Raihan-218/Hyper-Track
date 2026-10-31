import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Goal } from "../models/Goal.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { XPTransaction } from "../models/XPTransaction.js";
import { awardXp, reverseXp, XP_REWARDS } from "../services/gamification.js";

export const goalsRouter = Router();
goalsRouter.use(requireAuth);
const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  targetDate: z.string().datetime().nullable().optional()
});

goalsRouter.get("/", async (req: AuthRequest, res, next) => {
  try { res.json({ goals: await Goal.find({ user: req.userId, archivedAt: null }).sort({ createdAt: -1 }).lean() }); }
  catch (error) { next(error); }
});

goalsRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const goal = await Goal.create({ ...input, targetDate: input.targetDate ? new Date(input.targetDate) : null, user: req.userId });
    res.status(201).json({ goal });
  } catch (error) { next(error); }
});

goalsRouter.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid goal ID" }); return; }
    const input = createSchema.partial().extend({ status: z.enum(["active", "completed"]).optional() }).parse(req.body);
    const update = { ...input, ...(input.targetDate !== undefined ? { targetDate: input.targetDate ? new Date(input.targetDate) : null } : {}) };
    const goal = await Goal.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $set: update }, { new: true, runValidators: true });
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    res.json({ goal });
  } catch (error) { next(error); }
});

goalsRouter.post("/:id/milestones", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid goal ID" }); return; }
    const { title } = z.object({ title: z.string().trim().min(1).max(100) }).parse(req.body);
    const goal = await Goal.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $push: { milestones: { title } } }, { new: true, runValidators: true });
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    res.json({ goal });
  } catch (error) { next(error); }
});

goalsRouter.patch("/:id/milestones/:milestoneId", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.milestoneId)) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
    const { completed } = z.object({ completed: z.boolean() }).parse(req.body);
    const current = await Goal.findOne({ _id: req.params.id, user: req.userId, archivedAt: null, "milestones._id": req.params.milestoneId }).select("milestones").lean();
    if (!current) { res.status(404).json({ error: "Goal or milestone not found" }); return; }
    const existingMilestone = current.milestones.find((item) => String(item._id) === req.params.milestoneId);
    const completedAt = completed ? (existingMilestone?.completedAt ?? new Date()) : null;
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, archivedAt: null, "milestones._id": req.params.milestoneId },
      { $set: { "milestones.$.completedAt": completedAt } },
      { new: true, runValidators: true }
    );
    if (!goal) { res.status(404).json({ error: "Goal or milestone not found" }); return; }
    const milestoneId = new mongoose.Types.ObjectId(String(req.params.milestoneId));
    if (completed && completedAt) {
      const user = await User.findById(req.userId).select("timezone").lean();
      const timezone = user?.timezone || "UTC";
      const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(completedAt).map((part) => [part.type, part.value]));
      await awardXp({ userId: req.userId!, eventKey: `milestone-completion:${req.params.id}:${req.params.milestoneId}:${completedAt.toISOString()}`, activityType: "milestone", activityId: milestoneId, description: existingMilestone?.title ?? "Goal milestone", amount: XP_REWARDS.milestone, localDate: `${fields.year}-${fields.month}-${fields.day}` });
    } else {
      const previous = await XPTransaction.findOne({ user: req.userId, activityType: "milestone", activityId: milestoneId, amount: { $gt: 0 } }).sort({ createdAt: -1 }).lean();
      if (previous) await reverseXp(req.userId!, previous.eventKey);
    }
    res.json({ goal });
  } catch (error) { next(error); }
});

goalsRouter.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid goal ID" }); return; }
    const goal = await Goal.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $set: { archivedAt: new Date() } }, { new: true });
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    res.status(204).send();
  } catch (error) { next(error); }
});
