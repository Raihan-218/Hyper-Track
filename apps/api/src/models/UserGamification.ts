import { Schema, model } from "mongoose";

const userGamificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  totalXp: { type: Number, min: 0, default: 0 }
}, { timestamps: true });
export const UserGamification = model("UserGamification", userGamificationSchema);
