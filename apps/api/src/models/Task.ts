import { Schema, model } from "mongoose";

const taskSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
  parentTask: { type: Schema.Types.ObjectId, ref: "Task", default: null },
  clientMutationId: { type: String, maxlength: 100, default: undefined },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
  dueDate: { type: Date },
  plannedDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  reminderAt: { type: Date, default: null },
  completedAt: { type: Date },
  archivedAt: { type: Date, default: null },
  recurrence: { type: String, enum: ["none", "daily", "weekly"], default: "none" }
}, { timestamps: true });

taskSchema.index({ user: 1, createdAt: -1 });
taskSchema.index({ user: 1, dueDate: 1, status: 1 });
taskSchema.index({ user: 1, plannedDate: 1, status: 1 });
taskSchema.index({ user: 1, project: 1, status: 1 });
taskSchema.index({ user: 1, parentTask: 1, status: 1 });
taskSchema.index({ user: 1, clientMutationId: 1 }, { unique: true, partialFilterExpression: { clientMutationId: { $type: "string" } } });
export const Task = model("Task", taskSchema);
