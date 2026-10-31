import { Schema, model } from "mongoose";

// Immutable completion facts. The date key is captured in the user's timezone at completion.
const taskCompletionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
  title: { type: String, required: true },
  priority: { type: String, enum: ["low", "medium", "high"], required: true },
  completedAt: { type: Date, required: true },
  localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  timezone: { type: String, required: true },
  source: { type: String, enum: ["app", "migration"], default: "app" },
  reversedAt: { type: Date, default: null }
}, { timestamps: true });
taskCompletionSchema.index({ user: 1, task: 1, completedAt: -1 });
taskCompletionSchema.index({ user: 1, localDate: 1 });
export const TaskCompletion = model("TaskCompletion", taskCompletionSchema);
