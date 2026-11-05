/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — Session schema
 *  One row per login. Only a SHA-256 hash of the token is stored, so a copy
 *  of the database can't be used to log in. The expiresAt index tells
 *  MongoDB to delete the row once it expires (seven days, sessionService).
 * ══════════════════════════════════════════════════════════════════ */
import mongoose from "mongoose";
const { Schema } = mongoose;

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Session || mongoose.model("Session", schema);
