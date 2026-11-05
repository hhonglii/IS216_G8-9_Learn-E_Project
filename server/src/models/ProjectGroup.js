/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — ProjectGroup schema
 *  Two students joining the last place is a database problem, not a
 *  validation one: joinGroup adds a member with one conditional update that
 *  checks capacity and duplicates together. githubCache keeps the last
 *  successful GitHub snapshot, so a failed refresh loses nothing.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
const { Schema } = mongoose;
// Each task keeps its Mongoose _id, sent to the page as id. replaceTasks preserves it, so an edit
// never lands on a different task.
const taskSchema = new Schema({
  title: { type: String, required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User" },
  status: {
    type: String,
    enum: ["todo", "in-progress", "done"],
    default: "todo",
  },
  evidenceUrl: String,
});
const schema = new Schema(
  {
    miniProjectId: {
      type: Schema.Types.ObjectId,
      ref: "MiniProject",
      required: true,
    },
    name: { type: String, required: true },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    tasks: [taskSchema],
    // Exactly these five stages; updateStageEvidence changes only the stages sent (E-5).
    stageEvidence: new Schema(
      {
        Diagnose: String,
        Repair: String,
        Extend: String,
        Verify: String,
        Reflect: String,
      },
      { _id: false },
    ),
    repositoryUrl: String,
    githubCache: Schema.Types.Mixed,
    reflection: String,
    submissionStatus: {
      type: String,
      enum: ["draft", "submitted", "approved", "returned"],
      default: "draft",
    },
    professorFeedback: String,
  },
  { timestamps: true },
);
// One group per student per mini-project (E-7). Capacity and duplicates inside one group are
// enforced by joinGroup's conditional update, not by this index.
schema.index({ miniProjectId: 1, memberIds: 1 }, { unique: true });

export default mongoose.models.ProjectGroup ||
  mongoose.model("ProjectGroup", schema);
