/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — Challenge schema
 *  A field that is optional here can still be required at publish time:
 *  drafts may be incomplete, and publishChallenge checks the stored draft.
 *  The field table and fixtures are in docs/worksheets/PHASE_B_WORKSHEET.md.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
const { Schema } = mongoose;
/* options contains Mixed entries and acceptedAnswer is Mixed, so the controller
 * validates their format and the stricter publication rules.
 * Each block's generated _id becomes the DTO's string id, the stable key.
 * The applied case stays in the parent appliedCase field (decisions B-3/B-4).
 */
const questionSchema = new Schema({
  type: {
    type: String,
    enum: ["predict-output", "locate-fault", "repair-order"],
    required: true,
  },
  prompt: String,
  options: [Schema.Types.Mixed],
  acceptedAnswer: Schema.Types.Mixed,
  explanation: String,
  order: { type: Number, min: 0 },
});
/* Publishing checks the stored draft: complete text, at least one valid block,
 * appliedCase.prompt and at least two non-empty hints; codeSnippet is optional,
 * and no individual block format is mandatory. Incomplete drafts stay valid
 * here. Learner JSON leaves out acceptedAnswer, every official explanation and
 * the initial hints array.
 */
const schema = new Schema(
  {
    classroomId: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    title: { type: String, required: true },
    language: String,
    objective: String,
    prompt: String,
    codeSnippet: String,
    questions: [questionSchema],
    // The single applied case, stored as { prompt: string }; controllers validate Mixed.
    appliedCase: Schema.Types.Mixed,
    progressiveHints: [String],
    explanation: String,
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  // Reject stale saves so an edit cannot slip past a concurrent publish.
  { timestamps: true, optimisticConcurrency: true },
);

export default mongoose.models.Challenge || mongoose.model("Challenge", schema);
