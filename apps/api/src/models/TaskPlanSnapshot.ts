import { Schema, model } from "mongoose";

// Append-only record of planned-date changes. Existing tasks are seeded by the migration at migration time.
const taskPlanSnapshotSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
  title: { type: String, required: true },
  priority: { type: String, enum: ["low", "medium", "high"], required: true },
  plannedDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  assignedAt: { type: Date, required: true },
  supersededAt: { type: Date, default: null },
  source: { type: String, enum: ["app", "migration"], default: "app" }
}, { timestamps: true });
taskPlanSnapshotSchema.index({ user: 1, plannedDate: 1 });
taskPlanSnapshotSchema.index({ user: 1, task: 1, assignedAt: -1 });
export const TaskPlanSnapshot = model("TaskPlanSnapshot", taskPlanSnapshotSchema);
