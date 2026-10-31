import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Habit } from "../models/Habit.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const habitsRouter = Router();
habitsRouter.use(requireAuth);
const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  targetPerWeek: z.number().int().min(1).max(7).optional()
});
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format");

habitsRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const habits = await Habit.find({ user: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ habits });
  } catch (error) { next(error); }
});

habitsRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const habit = await Habit.create({ ...input, user: req.userId });
    res.status(201).json({ habit });
  } catch (error) { next(error); }
});

habitsRouter.post("/:id/completions", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid habit ID" }); return; }
    const date = dateSchema.parse(req.body.date);
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $addToSet: { completions: date } },
      { new: true, runValidators: true }
    );
    if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }
    res.json({ habit });
  } catch (error) { next(error); }
});

habitsRouter.delete("/:id/completions/:date", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid habit ID" }); return; }
    const date = dateSchema.parse(req.params.date);
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $pull: { completions: date } },
      { new: true }
    );
    if (!habit) { res.status(404).json({ error: "Habit not found" }); return; }
    res.json({ habit });
  } catch (error) { next(error); }
});
