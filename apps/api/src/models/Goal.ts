import { Schema, model } from "mongoose";

const milestoneSchema = new Schema({
  clientMutationId: { type: String, maxlength: 100, default: undefined },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

const goalSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  clientMutationId: { type: String, maxlength: 100, default: undefined },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  targetDate: { type: Date, default: null },
  milestones: { type: [milestoneSchema], default: [] },
  status: { type: String, enum: ["active", "completed"], default: "active" },
  archivedAt: { type: Date, default: null }
}, { timestamps: true });

goalSchema.index({ user: 1, status: 1, targetDate: 1 });
goalSchema.index({ user: 1, clientMutationId: 1 }, { unique: true, partialFilterExpression: { clientMutationId: { $type: "string" } } });
export const Goal = model("Goal", goalSchema);
