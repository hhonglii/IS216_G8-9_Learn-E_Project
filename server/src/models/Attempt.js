/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — Attempt schema
 *  One record per student and challenge. answers keeps every submission,
 *  wrong ones included, so a correction never rewrites the history; that is
 *  not the same thing as the latest score. completedAt is set only when the
 *  professor approves the applied diagnosis, and mentor eligibility and the
 *  profile's completed challenges both read it.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    challengeId: {
      type: Schema.Types.ObjectId,
      ref: "Challenge",
      required: true,
    },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Every submission is kept as { questionId, value, correct, submittedAt }; correct and
    // submittedAt are set by the server (C-2).
    answers: [
      {
        questionId: {
          type: String,
          required: true,
        },
        value: {
          type: Schema.Types.Mixed,
          required: true,
        },
        correct: {
          type: Boolean,
          required: true,
        },
        submittedAt: {
          type: Date,
          required: true,
        },
      },
    ],
    structuredScore: { type: Number, default: 0, min: 0 },
    appliedDiagnosis: String,
    /*
    * C7a: Review lifecycle defined in docs/worksheets/PHASE_C_WORKSHEET.md
    *
    * not-submitted -> pending: Student submits diagnosis.
    * pending -> pending: Student replaces diagnosis.
    * pending -> approved: Professor approves.
    * pending -> returned: Professor returns with feedback.
    * returned -> pending: Student resubmits.
    *
    * Approved attempts are final.
    * completedAt is only set when approved.
    * Approval requires structured completion.
    */
    reviewStatus: {
      type: String,
      enum: ["not-submitted", "pending", "approved", "returned"],
      default: "not-submitted",
    },
    professorFeedback: String,
    // The feedback from the last return, kept when the student resubmits so the
    // professor can check it was acted on (third-pass audit H).
    previousFeedback: String,
    completedAt: Date,
  },
  { timestamps: true },
);

// Each student can only have one Attempt per challenge.
// All retries are stored in the existing Attempt's answers[] array.
// A duplicate Attempt will cause MongoDB error E11000.
schema.index({ challengeId: 1, studentId: 1 }, { unique: true });

export default mongoose.models.Attempt || mongoose.model("Attempt", schema);
