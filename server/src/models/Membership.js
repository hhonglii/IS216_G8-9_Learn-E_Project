/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — Membership schema
 *  One row per user and classroom. Joining twice returns the existing
 *  membership with 200 (decision A-2). contributionPoints is the second
 *  document in the mentor award, so it changes only through
 *  addContributionPoints below, after the request's pointsAwarded flag is set.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    classroomId: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // A helpful resolution adds 5 here at most once per request; HelpRequest.pointsAwarded guards it (D-10).
    contributionPoints: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
// Unique PAIR, not two independently unique fields: a user may join different
// classrooms, but the same user/classroom pair should occur once. The declaration
// needs a real database index to enforce it; mocked schema tests cannot prove that.
// This does not solve the separate cross-document mentor-award consistency problem.
schema.index({ classroomId: 1, userId: 1 }, { unique: true });

const Membership = mongoose.models.Membership || mongoose.model("Membership", schema)

export async function addContributionPoints(classroomId, userId, points) {
  // Only whole numbers above zero: a negative number would break "never below 0"
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("points must be a positive whole number.")
  }

return await Membership.findOneAndUpdate(
    { classroomId, userId },                 // the mentor's membership in this classroom
    { $inc: { contributionPoints: points } }, // add the points
    { new: true },                            // return the updated document
  )
}


export default Membership 
