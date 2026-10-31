import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { env } from "../config/env.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

export const authRouter = Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(72),
  timezone: z.string().max(64).optional()
});
const loginSchema = z.object({ email: z.string().trim().email().transform((v) => v.toLowerCase()), password: z.string().min(1).max(72) });

function issueToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(userId: string) {
  const refreshToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await Session.create({ user: userId, tokenHash: hashRefreshToken(refreshToken), expiresAt });
  return { token: issueToken(userId), refreshToken };
}

function publicUser(user: { _id: unknown; name: string; email: string; timezone?: string }) {
  return { id: String(user._id), name: user.name, email: user.email, timezone: user.timezone ?? "UTC" };
}

function isTimezoneValid(timezone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); return true; }
  catch { return false; }
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const existing = await User.findOne({ email: input.email }).lean();
    if (existing) { res.status(409).json({ error: "An account with this email already exists" }); return; }
    if (input.timezone && !isTimezoneValid(input.timezone)) { res.status(400).json({ error: "Invalid timezone" }); return; }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const timezone = input.timezone ?? "UTC";
    const user = await User.create({ name: input.name, email: input.email, passwordHash, timezone });
    res.status(201).json({ user: publicUser(user), ...await createSession(String(user._id)) });
  } catch (error) { next(error); }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email }).select("+passwordHash");
    const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid) { res.status(401).json({ error: "Email or password is incorrect" }); return; }
    res.json({ user: publicUser(user), ...await createSession(String(user._id)) });
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  timezone: z.string().max(64).refine(isTimezoneValid, "Invalid timezone").optional()
}).refine((value) => Object.keys(value).length > 0, "Provide at least one profile field");

authRouter.patch("/me", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(req.userId, { $set: input }, { new: true, runValidators: true }).lean();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const input = z.object({ refreshToken: z.string().min(20).max(200) }).parse(req.body);
    const userSession = await Session.findOne({ tokenHash: hashRefreshToken(input.refreshToken), expiresAt: { $gt: new Date() } });
    if (!userSession) { res.status(401).json({ error: "Refresh session expired. Please sign in again." }); return; }
    const nextToken = randomBytes(48).toString("base64url");
    const rotated = await Session.findOneAndUpdate(
      { _id: userSession._id, tokenHash: userSession.tokenHash, expiresAt: { $gt: new Date() } },
      { $set: { tokenHash: hashRefreshToken(nextToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
      { new: true }
    );
    if (!rotated) { res.status(401).json({ error: "Refresh session is no longer valid. Please sign in again." }); return; }
    res.json({ token: issueToken(String(rotated.user)), refreshToken: nextToken });
  } catch (error) { next(error); }
});

authRouter.post("/logout", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await Session.deleteMany({ user: req.userId });
    res.status(204).send();
  } catch (error) { next(error); }
});
