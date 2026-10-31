import { Schema, model } from "mongoose";

const projectSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  status: { type: String, enum: ["active", "completed"], default: "active" },
  archivedAt: { type: Date, default: null }
}, { timestamps: true });

projectSchema.index({ user: 1, status: 1, createdAt: -1 });
export const Project = model("Project", projectSchema);
