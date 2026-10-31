import mongoose, { Types } from "mongoose";
import { XPTransaction } from "../models/XPTransaction.js";
import { UserGamification } from "../models/UserGamification.js";
import { env } from "../config/env.js";
export { levelForXp } from "./levels.js";

export const XP_REWARDS = { task: env.XP_REWARD_TASK, highPriorityTask: env.XP_REWARD_HIGH_PRIORITY_TASK, habit: env.XP_REWARD_HABIT, milestone: env.XP_REWARD_MILESTONE } as const;

export async function awardXp(input: { userId: string; eventKey: string; activityType: "task" | "habit" | "milestone"; activityId: Types.ObjectId; description: string; amount: number; localDate: string }) {
  try {
    await XPTransaction.create(input);
    await UserGamification.updateOne({ user: input.userId }, { $inc: { totalXp: input.amount }, $setOnInsert: { user: input.userId } }, { upsert: true });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
  }
}

export async function reverseXp(userId: string, eventKey: string) {
  const original = await XPTransaction.findOne({ user: userId, eventKey }).lean();
  if (!original || original.amount <= 0) return;
  const reverseKey = `reversal:${original._id}`;
  try {
    await XPTransaction.create({ user: userId, eventKey: reverseKey, activityType: original.activityType, activityId: original.activityId, description: `Reversed: ${original.description}`, amount: -original.amount, localDate: original.localDate, reverses: original._id });
    await UserGamification.updateOne({ user: userId }, { $inc: { totalXp: -original.amount } });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
  }
}
