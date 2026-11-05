/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — Classroom schema
 *  joinCode is unique. When a save hits that index (error 11000),
 *  createClassroom tries a new code, up to five times, then answers 409, so
 *  two classrooms never share a code. professorId comes from the logged-in
 *  caller, never from a form field, or any student could claim a classroom.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
const { Schema } = mongoose;
// professorId stores a reference ID, not the whole User. ref names the related
// model; it does not prove the referenced professor exists or owns the action,
// so the controller checks that before a classroom write.
// coverId is optional and has no default (decision G-10): a missing value means
// the "default" cover, and classrooms made before covers have none.
// createClassroom accepts only the ids in config/covers.js.
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: String,
    professorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    joinCode: { type: String, required: true, unique: true },
    coverId: String,
  },
  { timestamps: true },
);

export default mongoose.models.Classroom || mongoose.model("Classroom", schema);
