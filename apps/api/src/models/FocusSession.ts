import { Schema, model } from "mongoose";

const focusSessionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  clientMutationId: { type: String, maxlength: 100, default: undefined },
  task: { type: Schema.Types.ObjectId, ref: "Task", default: null },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
  plannedMinutes: { type: Number, min: 1, max: 180, required: true },
  actualSeconds: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["active", "completed", "cancelled"], default: "active" }
}, { timestamps: true });
focusSessionSchema.index({ user: 1, startedAt: -1 });
focusSessionSchema.index({ user: 1, status: 1 });
focusSessionSchema.index({ user: 1, clientMutationId: 1 }, { unique: true, partialFilterExpression: { clientMutationId: { $type: "string" } } });
export const FocusSession = model("FocusSession", focusSessionSchema);
