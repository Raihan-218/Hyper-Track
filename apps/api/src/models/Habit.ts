import { Schema, model } from "mongoose";

const habitSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  clientMutationId: { type: String, maxlength: 100, default: undefined },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  category: { type: String, trim: true, maxlength: 40, default: "Personal" },
  icon: { type: String, trim: true, maxlength: 8, default: "•" },
  color: { type: String, match: /^#[0-9a-fA-F]{6}$/, default: "#5956D6" },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
  frequency: { type: String, enum: ["daily", "weekly"], default: "daily" },
  targetPerWeek: { type: Number, min: 1, max: 7, default: 7 },
  daysOfWeek: { type: [Number], default: [] },
  completions: { type: [String], default: [] },
  archivedAt: { type: Date, default: null }
}, { timestamps: true });

habitSchema.index({ user: 1, createdAt: -1 });
habitSchema.index({ user: 1, name: 1 });
habitSchema.index({ user: 1, clientMutationId: 1 }, { unique: true, partialFilterExpression: { clientMutationId: { $type: "string" } } });
export const Habit = model("Habit", habitSchema);
