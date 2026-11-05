/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — GamePlay schema
 *  One student's single run at a Boss Battle. Replays create new records, so
 *  the first answers to a question stay available for the class results.
 *  Hearts live here rather than in the browser, so a refresh cannot restore
 *  them, and optimisticConcurrency stops a double click costing two hearts.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
const { Schema } = mongoose;

const schema = new Schema(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: "ClassroomGame",
      required: true,
    },
    gameVersion: { type: Number, required: true, min: 1 },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    maxHearts: { type: Number, required: true, min: 1 },
    heartsLeft: { type: Number, required: true, min: 0 },
    // questionQueue[0] is the current question; a missed one moves to the end.
    questionQueue: [String],
    answers: [
      {
        _id: false,
        questionId: { type: String, required: true },
        optionId: { type: String, required: true },
        correct: { type: Boolean, required: true },
        submittedAt: { type: Date, required: true },
      },
    ],
    // abandoned: the professor unpublished the game during this run.
    status: {
      type: String,
      enum: ["in-progress", "won", "lost", "abandoned"],
      default: "in-progress",
    },
    completedAt: Date,
  },
  { timestamps: true, optimisticConcurrency: true },
);

// A student has at most one run in progress for a game, even across two tabs.
schema.index(
  { gameId: 1, studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "in-progress" },
    name: "one_run_in_progress",
  },
);

export default mongoose.models.GamePlay || mongoose.model("GamePlay", schema);
