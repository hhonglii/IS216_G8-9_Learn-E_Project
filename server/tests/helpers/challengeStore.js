// HTTP fixture store; real Mongoose casting/validation, mocked DB.
import { vi } from "vitest";
import mongoose from "mongoose";
import User from "../../src/models/User.js";
import Classroom from "../../src/models/Classroom.js";
import Challenge from "../../src/models/Challenge.js";

export const ownerId = new mongoose.Types.ObjectId();
export const otherId = new mongoose.Types.ObjectId();
export const studentId = new mongoose.Types.ObjectId();
export const classroomId = new mongoose.Types.ObjectId();
export const missingId = new mongoose.Types.ObjectId();
export const completeDraft = {
  title: "Boundary practice",
  language: "JavaScript",
  objective: "Diagnose a boundary error",
  prompt: "Inspect this loop",
  codeSnippet: "for (let i = 0; i < 2; i++) console.log(i);",
  questions: [
    {
      type: "predict-output",
      prompt: "Predict output",
      options: [
        { id: "a", label: "0, then 1" },
        { id: "b", label: "0, then 1, then 2" },
      ],
      acceptedAnswer: "a",
      explanation: "Two iterations",
      order: 0,
    },
    {
      type: "locate-fault",
      prompt: "Locate fault",
      options: [
        { id: "line-1", label: "line 1" },
        { id: "line-2", label: "line 2" },
        { id: "category-1", label: "boundary" },
        { id: "category-2", label: "syntax" },
      ],
      acceptedAnswer: { location: "line-2", category: "category-1" },
      explanation: "Wrong boundary",
      order: 1,
    },
    {
      type: "repair-order",
      prompt: "Order repairs",
      // Listed out of order: students start from this order (third-pass audit B).
      options: [
        { id: "s2", label: "Fix" },
        { id: "s1", label: "Trace" },
      ],
      acceptedAnswer: ["s1", "s2"],
      explanation: "Trace then fix",
      order: 2,
    },
  ],
  appliedCase: { prompt: "Apply this to an array" },
  progressiveHints: ["Trace", "Check the bound"],
  explanation: "The last item is missed.",
};

export function setupStore() {
  const records = new Map();
  const users = {
    [ownerId]: { _id: ownerId, role: "professor" },
    [otherId]: { _id: otherId, role: "professor" },
    [studentId]: { _id: studentId, role: "student" },
  };
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  const findUser = vi
    .spyOn(User, "findById")
    .mockImplementation(async (id) => users[id] ?? null);
  const findClassroom = vi
    .spyOn(Classroom, "findById")
    .mockImplementation(async (id) =>
      String(id) === String(classroomId)
        ? { _id: classroomId, professorId: ownerId }
        : null,
    );
  const findChallenge = vi
    .spyOn(Challenge, "findById")
    .mockImplementation(async (id) => {
      const stored = records.get(String(id).toLowerCase());
      return stored ? Challenge.hydrate(structuredClone(stored)) : null;
    });
  const save = vi
    .spyOn(Challenge.prototype, "save")
    .mockImplementation(async function () {
      await this.validate();
      this.__v = (this.__v ?? 0) + 1;
      this.updatedAt = new Date("2026-10-07T12:00:00.000Z");
      records.set(
        String(this._id),
        JSON.parse(JSON.stringify(this.toObject())),
      );
      return this;
    });
  function add(fields = {}) {
    const doc = new Challenge({
      ...structuredClone(completeDraft),
      classroomId,
      createdBy: ownerId,
      ...fields,
      createdAt: new Date("2026-10-07T07:00:00.000Z"),
      updatedAt: new Date("2026-10-07T07:00:00.000Z"),
      __v: 0,
    });
    records.set(String(doc._id), JSON.parse(JSON.stringify(doc.toObject())));
    return String(doc._id);
  }
  return { records, add, save, findUser, findClassroom, findChallenge };
}
