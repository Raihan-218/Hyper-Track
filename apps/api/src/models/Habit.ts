import { Schema, model } from "mongoose";

const habitSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  frequency: { type: String, enum: ["daily", "weekly"], default: "daily" },
  targetPerWeek: { type: Number, min: 1, max: 7, default: 7 },
  completions: { type: [String], default: [] }
}, { timestamps: true });

habitSchema.index({ user: 1, createdAt: -1 });
habitSchema.index({ user: 1, name: 1 });
export const Habit = model("Habit", habitSchema);
