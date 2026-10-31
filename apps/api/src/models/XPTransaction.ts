import { Schema, model } from "mongoose";

const xpTransactionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  eventKey: { type: String, required: true, maxlength: 180, unique: true },
  activityType: { type: String, enum: ["task", "habit", "milestone"], required: true },
  activityId: { type: Schema.Types.ObjectId, required: true },
  description: { type: String, required: true, maxlength: 160 },
  amount: { type: Number, required: true },
  localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  reverses: { type: Schema.Types.ObjectId, ref: "XPTransaction", default: null }
}, { timestamps: true });
xpTransactionSchema.index({ user: 1, localDate: 1 });
export const XPTransaction = model("XPTransaction", xpTransactionSchema);
