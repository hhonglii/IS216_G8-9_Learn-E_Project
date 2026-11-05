/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — HelpRequest schema
 *  Two kinds (H-14). Question help names one question of a published
 *  challenge, and only students whose diagnosis on that challenge was approved
 *  may claim it. General class help is about anything in the classroom, carries
 *  a code snippet with expected and actual behaviour, and any other student in
 *  the classroom may claim it. Requests saved before H-14 have no kind field,
 *  read as question help, and keep their reasoning fields for the mentor. Claims
 *  and point awards are conditional updates in the controller and
 *  pointsService, so two mentors cannot claim the same request and a helpful
 *  outcome awards points once.
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
    kind: {
      type: String,
      enum: ["question", "general"],
      default: "question",
    },
    // qualifyingChallengeId is set by the server from the challenge, never taken from the form.
    challengeId: {
      type: Schema.Types.ObjectId,
      ref: "Challenge",

      // question help needs a challengeId; general class help has none
      required: [
        function () {
          return this.kind !== "general" && !this.projectGroupId;
        },
        "A help request needs a challenge or a project group.",
      ],
    },
    // The _id of one block in the challenge's questions array.
    questionId: { type: Schema.Types.ObjectId },
    projectGroupId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectGroup",

      // validation 
      validate: {
        validator: function (value) {
          return !(value && this.challengeId)
        },
        message: "A help request cannot belong to both a challenge and a project group."
      }
    },

    qualifyingChallengeId: {
      type: Schema.Types.ObjectId,
      ref: "Challenge",

      // project requests require a qualifying challenge 
      required: [
        function () {
          return !!this.projectGroupId;
        },
        "Project help requests need a qualifying challenge.",
      ],
    },

    requesterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // General class help fills in the snippet and both behaviours. The last two
    // fields are only on requests saved before H-14; nothing writes them now.
    codeSnippet: String,
    expectedBehaviour: String,
    actualBehaviour: String,
    attemptedReasoning: String,
    suspectedCause: String,
    // Question help: the asker's last answer to that question, in words, when it
    // was wrong. The server copies it from their Attempt (UX audit item 17).
    askerAnswer: String,

    hintType: {
      type: String,
      enum: [
        "Guiding question",
        "Concept reminder",
        "Fault-location clue",
        "Repair-direction hint",
      ],
      required: true,
    },

    claimedBy: { type: Schema.Types.ObjectId, ref: "User" },
    mentorResponse: String,
    // status, helpful and pointsAwarded change together. There is no "unresolved" status: an unresolved
    // request goes back to "open" and clears claimedBy, mentorResponse and helpful (D-3), while
    // reopenCount keeps counting (G-8). helpful is null until the requester judges it.
    status: {
      type: String,
      enum: ["open", "claimed", "responded", "resolved"],
      default: "open",
    },
    helpful: { type: Boolean, default: null },
    pointsAwarded: { type: Boolean, default: false },
    reopenCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export default mongoose.models.HelpRequest ||
  mongoose.model("HelpRequest", schema);
