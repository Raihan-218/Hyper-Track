import { Schema, model } from "mongoose";

const habitScheduleSnapshotSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  habit: { type: Schema.Types.ObjectId, ref: "Habit", required: true },
  name: { type: String, required: true },
  frequency: { type: String, enum: ["daily", "weekly"], required: true },
  targetPerWeek: { type: Number, min: 1, max: 7, required: true },
  daysOfWeek: { type: [Number], default: [] },
  validFromAt: { type: Date, required: true },
  validToAt: { type: Date, default: null },
  source: { type: String, enum: ["app", "migration"], default: "app" }
}, { timestamps: true });
habitScheduleSnapshotSchema.index({ user: 1, validFromAt: 1, validToAt: 1 });
habitScheduleSnapshotSchema.index({ user: 1, habit: 1, validFromAt: -1 });
export const HabitScheduleSnapshot = model("HabitScheduleSnapshot", habitScheduleSnapshotSchema);
