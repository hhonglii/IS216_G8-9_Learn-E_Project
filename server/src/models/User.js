/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — User schema
 *  The role enum constrains a stored string; it grants no permission by
 *  itself. Identity comes from a login session, and passwordHash is
 *  select: false so no query returns it unless it asks.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
const { Schema } = mongoose;
// A schema declares storage/validation; this statement creates no User record.
// trim cleans strings; required/enum constrain values but do not establish identity.
// timestamps adds creation/update metadata through Mongoose's supported operations.
const schema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    role: { type: String, enum: ["student", "professor"], required: true },
    username: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
  },
  { timestamps: true },
);
schema.index({ username: 1 }, { sparse: true, unique: true });
// Reuse a registered model during repeated imports/test loading. Registration is
// different from inserting a document; controller code still needs explicit CRUD.
export default mongoose.models.User || mongoose.model("User", schema);
