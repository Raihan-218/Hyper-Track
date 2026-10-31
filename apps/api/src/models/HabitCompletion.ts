import { Schema, model } from "mongoose";

// Habit dates are local calendar days; legacy dates are backfilled as historical date-only facts.
const habitCompletionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  habit: { type: Schema.Types.ObjectId, ref: "Habit", required: true },
  name: { type: String, required: true },
  localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  completedAt: { type: Date, default: null },
  timezone: { type: String, default: null },
  reflection: { type: String, maxlength: 500, default: "" },
  reversedAt: { type: Date, default: null }
}, { timestamps: true });
habitCompletionSchema.index({ user: 1, habit: 1, localDate: 1 }, { unique: true });
habitCompletionSchema.index({ user: 1, localDate: 1 });
export const HabitCompletion = model("HabitCompletion", habitCompletionSchema);
