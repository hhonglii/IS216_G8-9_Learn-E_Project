/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — MiniProject schema
 *  The brief a professor drafts, then publishes for a classroom. The open
 *  questions about it are settled in docs/TEAM_DECISIONS.md (E-1, E-2, H-8, H-10). Group capacity is
 *  enforced by joinGroup in groupsController.js, not here.
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
    title: { type: String, required: true },
    brief: String,
    starterRepoUrl: String,
    maxGroupSize: {
      type: Number,
      required: true,
      // A draft saved before the size is chosen gets the builder's default.
      default: 2,
      min: 1,
      validate: Number.isInteger,
    },
    stageInstructions: new Schema(
      {
        Diagnose: String,
        Repair: String,
        Extend: String,
        Verify: String,
        Reflect: String,
      },
      { _id: false },
    ),
    acceptanceCriteria: [String],
    rubric: String,
    // Files the professor uploads for students (H-10). The bytes live in
    // GridFS (services/materialStore.js); this list says what each one is.
    materials: [
      new Schema(
        {
          fileId: { type: Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          size: { type: Number, required: true },
          contentType: { type: String, required: true },
        },
        { timestamps: { createdAt: "uploadedAt", updatedAt: false } },
      ),
    ],
    // Created as a draft, edited with PUT, then published; students see published only (H-8).
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    // Optional; createMiniProject checks it is a published challenge in the same classroom (E-2).
    qualifyingChallengeId: { type: Schema.Types.ObjectId, ref: "Challenge" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export default mongoose.models.MiniProject ||
  mongoose.model("MiniProject", schema);
