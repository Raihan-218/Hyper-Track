import { Schema, model } from "mongoose";

const taskSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
  dueDate: { type: Date }
}, { timestamps: true });

taskSchema.index({ user: 1, createdAt: -1 });
export const Task = model("Task", taskSchema);
