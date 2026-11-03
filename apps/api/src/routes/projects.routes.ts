import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { Task } from "../models/Task.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);
const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  status: z.enum(["active", "completed"]).optional()
});
const createSchema = projectSchema.extend({ _id: z.string().regex(/^[a-f\d]{24}$/i).optional(), clientMutationId: z.string().min(1).max(100).optional() });

projectsRouter.get("/", async (req: AuthRequest, res, next) => {
  try { res.json({ projects: await Project.find({ user: req.userId, archivedAt: null }).sort({ createdAt: -1 }).lean() }); }
  catch (error) { next(error); }
});

projectsRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    if (input.clientMutationId) {
      const existing = await Project.findOne({ user: req.userId, clientMutationId: input.clientMutationId }).lean();
      if (existing) { res.status(200).json({ project: existing }); return; }
    }
    const project = await Project.create({ ...input, ...(input._id ? { _id: input._id } : {}), user: req.userId });
    res.status(201).json({ project });
  } catch (error) { next(error); }
});

projectsRouter.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid project ID" }); return; }
    const input = projectSchema.partial().parse(req.body);
    const project = await Project.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $set: input }, { new: true, runValidators: true });
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ project });
  } catch (error) { next(error); }
});

projectsRouter.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: "Invalid project ID" }); return; }
    const project = await Project.findOneAndUpdate({ _id: req.params.id, user: req.userId, archivedAt: null }, { $set: { archivedAt: new Date() } }, { new: true });
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    await Task.updateMany({ user: req.userId, project: project._id }, { $set: { project: null } });
    res.status(204).send();
  } catch (error) { next(error); }
});
