// Phase C HTTP tests.
// Covers the Phase C checkpoint list in docs/CORE_BUILD_GUIDE.md section 9 with a
// mocked database: Challenge persistence comes from helpers/challengeStore.js and
// Attempt persistence from the in-memory store below, with real Mongoose validation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import Attempt from "../src/models/Attempt.js";
import Challenge from "../src/models/Challenge.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import HelpRequest from "../src/models/HelpRequest.js";
import User from "../src/models/User.js";
import {
  setupStore,
  ownerId,
  otherId,
  studentId,
  classroomId,
  missingId,
  completeDraft,
} from "./helpers/challengeStore.js";

const outsiderId = new mongoose.Types.ObjectId();
const users = {
  [ownerId]: { _id: ownerId, role: "professor", displayName: "Prof Tan" },
  [otherId]: { _id: otherId, role: "professor", displayName: "Prof Lim" },
  [studentId]: { _id: studentId, role: "student", displayName: "Student Lee" },
  [outsiderId]: { _id: outsiderId, role: "student", displayName: "Student Ng" },
};
const correctValues = ["a", { location: "line-2", category: "category-1" }, ["s1", "s2"]];
const wrongValues = ["b", { location: "line-1", category: "category-2" }, ["s2", "s1"]];

let store, challengeId, attempts;

beforeEach(() => {
  store = setupStore();
  challengeId = store.add({ status: "published" });
  store.findUser.mockImplementation(async (id) => users[id] ?? null);
  vi.spyOn(Membership, "findOne").mockImplementation(async (filter) =>
    String(filter.userId) === String(studentId) &&
    String(filter.classroomId) === String(classroomId)
      ? { _id: new mongoose.Types.ObjectId(), classroomId, userId: studentId }
      : null,
  );

  attempts = new Map();
  const matches = (record, filter) =>
    String(record.challengeId) === String(filter.challengeId) &&
    String(record.studentId) === String(filter.studentId);
  vi.spyOn(Attempt, "findOne").mockImplementation(async (filter) => {
    const record = [...attempts.values()].find((item) => matches(item, filter));
    return record ? Attempt.hydrate(structuredClone(record)) : null;
  });
  vi.spyOn(Attempt, "findById").mockImplementation(async (id) => {
    const record = attempts.get(String(id));
    return record ? Attempt.hydrate(structuredClone(record)) : null;
  });
  vi.spyOn(Attempt.prototype, "save").mockImplementation(async function () {
    await this.validate();
    const duplicate = [...attempts.values()].some(
      (item) => matches(item, this) && String(item._id) !== String(this._id),
    );
    if (duplicate) {
      throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    }
    attempts.set(String(this._id), JSON.parse(JSON.stringify(this.toObject())));
    this.isNew = false;
    return this;
  });
});

afterEach(() => vi.restoreAllMocks());

function questionId(index, id = challengeId) {
  return String(store.records.get(id).questions[index]._id);
}

function call(method, path, caller, body) {
  const pending = request(createApp())[method](path);
  return (caller ? pending.set(...sessionHeader(caller)) : pending).send(
    body,
  );
}

function answer(index, value, caller = studentId, id = challengeId) {
  return call("post", `/api/challenges/${id}/attempts`, caller, {
    questionId: questionId(index, id),
    value,
  });
}

function submitDiagnosis(attemptId, appliedDiagnosis, caller = studentId) {
  return call("put", `/api/attempts/${attemptId}/applied`, caller, {
    appliedDiagnosis,
  });
}

function review(attemptId, body, caller = ownerId) {
  return call("put", `/api/attempts/${attemptId}/review`, caller, body);
}

// Stores an Attempt directly, as if the student had already answered.
function seedAttempt({ correct = [true, true, true], ...fields } = {}) {
  const doc = new Attempt({
    challengeId,
    studentId,
    answers: correct.map((isCorrect, index) => ({
      questionId: questionId(index),
      value: isCorrect ? correctValues[index] : wrongValues[index],
      correct: isCorrect,
      submittedAt: new Date("2026-10-13T08:00:00.000Z"),
    })),
    structuredScore: correct.filter(Boolean).length,
    reviewStatus: "not-submitted",
    ...fields,
  });
  attempts.set(String(doc._id), JSON.parse(JSON.stringify(doc.toObject())));
  return String(doc._id);
}

function stored(attemptId) {
  return attempts.get(String(attemptId));
}

describe("POST /api/challenges/:id/attempts: answer checking", () => {
  it.each([0, 1, 2])("accepts a correct answer for format %s", async (index) => {
    const response = await answer(index, correctValues[index]);
    expect(response.status).toBe(201);
    expect(response.body.data.correct).toBe(true);
    const results = response.body.data.questionResults;
    expect(results[index]).toEqual({
      questionId: questionId(index),
      correct: true,
      explanation: expect.any(String),
    });
    expect(results.filter((item) => "explanation" in item)).toHaveLength(1);
    expect(stored(response.body.data.id).answers).toHaveLength(1);
  });

  it.each([0, 1, 2])("marks a wrong answer for format %s without revealing anything", async (index) => {
    const response = await answer(index, wrongValues[index]);
    expect(response.status).toBe(201);
    expect(response.body.data.correct).toBe(false);
    expect(response.body.data.questionResults[index]).toEqual({
      questionId: questionId(index),
      correct: false,
    });
    expect(response.text).not.toContain("acceptedAnswer");
    expect(response.text).not.toContain('"explanation"');
    expect(response.body.data.unlockedHints).toEqual(["Trace"]);
  });

  it("unlocks no hint for a correct answer", async () => {
    const response = await answer(0, correctValues[0]);
    expect(response.body.data.unlockedHints).toEqual([]);
  });

  it("marks a fault wrong when only the line is right", async () => {
    const response = await answer(1, { location: "line-2", category: "category-2" });
    expect(response.status).toBe(201);
    expect(response.body.data.correct).toBe(false);
  });

  it("still marks a block saved before locate-fault had options", async () => {
    const oldBlock = {
      ...completeDraft.questions[1],
      options: [],
      acceptedAnswer: { location: "2", category: "boundary" },
    };
    const oldId = store.add({
      status: "published",
      questions: [completeDraft.questions[0], oldBlock, completeDraft.questions[2]],
    });
    const response = await answer(
      1,
      { location: "line-1", category: "category-1" },
      studentId,
      oldId,
    );
    expect(response.status).toBe(201);
    expect(response.body.data.correct).toBe(true);
  });

  it.each([
    ["an unknown option", 0, "z"],
    ["a non-string option", 0, 1],
    ["a missing category", 1, { location: "line-2" }],
    ["a typed location", 1, { location: "2", category: "category-1" }],
    ["a category id in the line field", 1, { location: "category-1", category: "category-1" }],
    ["an unknown line option", 1, { location: "line-9", category: "category-1" }],
    ["an array instead of an object", 1, ["line-2", "category-1"]],
    ["too few repair steps", 2, ["s1"]],
    ["a repeated repair step", 2, ["s1", "s1"]],
    ["an unknown repair step", 2, ["s1", "s9"]],
    ["a missing value", 0, undefined],
  ])("rejects %s with 400 and saves nothing", async (_label, index, value) => {
    const response = await answer(index, value);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(attempts.size).toBe(0);
  });

  it("rejects a question id that is not in this challenge", async () => {
    const response = await call(
      "post",
      `/api/challenges/${challengeId}/attempts`,
      studentId,
      { questionId: String(missingId), value: "a" },
    );
    expect(response.status).toBe(400);
    expect(attempts.size).toBe(0);
  });

  it("keeps retries in one Attempt record, oldest first", async () => {
    const first = await answer(0, "b");
    const second = await answer(0, "a");
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(attempts.size).toBe(1);
    const record = stored(first.body.data.id);
    expect(record.answers.map((item) => [item.value, item.correct])).toEqual([
      ["b", false],
      ["a", true],
    ]);
    expect(record.structuredScore).toBe(1);
  });

  it("scores by each question's latest answer", async () => {
    await answer(0, "b");
    const response = await answer(0, "a");
    expect(response.body.data.structuredScore).toBe(1);
    expect(response.body.data.questionResults[0].correct).toBe(true);
  });

  // Third-pass audit D: a later wrong answer used to un-solve the question.
  it("keeps a solved question solved, refusing another answer as 409", async () => {
    const first = await answer(0, "a");
    const response = await answer(0, "b");
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: "QUESTION_SOLVED",
      message: "You've already solved this question.",
    });
    expect(stored(first.body.data.id).answers).toHaveLength(1);
  });

  it("reports structured completion once all three are correct", async () => {
    await answer(0, correctValues[0]);
    await answer(1, correctValues[1]);
    const response = await answer(2, correctValues[2]);
    expect(response.body.data.structuredScore).toBe(3);
    expect(response.body.data.structuredComplete).toBe(true);
    expect(response.body.data.reviewStatus).toBe("not-submitted");
  });

  it("appends to the existing record when two first submissions race", async () => {
    const existing = seedAttempt({ correct: [false] });
    Attempt.findOne.mockResolvedValueOnce(null);
    const response = await answer(1, correctValues[1]);
    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(existing);
    expect(attempts.size).toBe(1);
    expect(stored(existing).answers).toHaveLength(2);
  });
});

describe("POST /api/challenges/:id/attempts: access and locking", () => {
  it.each([
    ["no selected user", null, 401],
    ["a student who never joined", outsiderId, 403],
    ["the owning professor", ownerId, 403],
  ])("refuses %s and saves nothing", async (_label, caller, status) => {
    const response = await answer(0, "a", caller);
    expect(response.status).toBe(status);
    expect(attempts.size).toBe(0);
  });

  it("hides a draft challenge from students", async () => {
    const draftId = store.add();
    const response = await answer(0, "a", studentId, draftId);
    expect(response.status).toBe(404);
    expect(attempts.size).toBe(0);
  });

  it("rejects a malformed challenge id", async () => {
    const response = await call("post", "/api/challenges/example/attempts", studentId, {
      questionId: questionId(0),
      value: "a",
    });
    expect(response.status).toBe(400);
  });

  it.each(["pending", "approved"])(
    "locks structured answers while the review status is %s",
    async (reviewStatus) => {
      const id = seedAttempt({ reviewStatus, appliedDiagnosis: "Use <=" });
      const before = JSON.stringify(stored(id));
      const response = await answer(0, "b");
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("ATTEMPT_LOCKED");
      expect(JSON.stringify(stored(id))).toBe(before);
    },
  );

  it("lets a student correct answers after the diagnosis is returned", async () => {
    const id = seedAttempt({
      correct: [false, true, true],
      reviewStatus: "returned",
      appliedDiagnosis: "Use <=",
      professorFeedback: "Explain why",
    });
    const response = await answer(0, "a");
    expect(response.status).toBe(200);
    expect(stored(id).answers).toHaveLength(4);
  });
});

describe("GET /api/challenges/:id: the student's own attempt", () => {
  it("returns progress and only the explanations already earned", async () => {
    const id = seedAttempt({ correct: [true, false] });
    const response = await call("get", `/api/challenges/${challengeId}`, studentId);
    expect(response.status).toBe(200);
    const attempt = response.body.data.attempt;
    expect(attempt).toMatchObject({
      id,
      structuredScore: 1,
      structuredComplete: false,
      reviewStatus: "not-submitted",
    });
    expect(attempt.questionResults.map((item) => item.correct)).toEqual([
      true,
      false,
      null,
    ]);
    expect(attempt.questionResults[0].explanation).toBe("Two iterations");
    expect(attempt.questionResults[1]).not.toHaveProperty("explanation");
    expect(response.text).not.toContain("acceptedAnswer");
    expect(response.text).not.toContain("progressiveHints");
  });

  it("sends no hints before any wrong answer", async () => {
    seedAttempt({ correct: [true] });
    const response = await call("get", `/api/challenges/${challengeId}`, studentId);
    expect(response.body.data.attempt.unlockedHints).toEqual([]);
    expect(response.body.data.hintCount).toBe(2);
  });

  it("sends one hint per wrong answer, capped at the hints written", async () => {
    seedAttempt({ correct: [false, true] });
    let response = await call("get", `/api/challenges/${challengeId}`, studentId);
    expect(response.body.data.attempt.unlockedHints).toEqual(["Trace"]);
    attempts.clear();
    seedAttempt({ correct: [false, false, false] });
    response = await call("get", `/api/challenges/${challengeId}`, studentId);
    expect(response.body.data.attempt.unlockedHints).toEqual([
      "Trace",
      "Check the bound",
    ]);
  });
});

describe("PUT /api/attempts/:id/applied: applied diagnosis", () => {
  it("refuses a diagnosis before the structured work is complete", async () => {
    const id = seedAttempt({ correct: [true, true, false] });
    const response = await submitDiagnosis(id, "Use <=");
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("STRUCTURED_INCOMPLETE");
    expect(stored(id).reviewStatus).toBe("not-submitted");
  });

  it("saves a trimmed diagnosis as pending once the work is complete", async () => {
    const id = seedAttempt();
    const response = await submitDiagnosis(id, "  Change < to <= so the last student is included.  ");
    expect(response.status).toBe(200);
    expect(response.body.data.reviewStatus).toBe("pending");
    expect(stored(id)).toMatchObject({
      reviewStatus: "pending",
      appliedDiagnosis: "Change < to <= so the last student is included.",
      completedAt: null,
    });
  });

  it.each([["an empty string", ""], ["only spaces", "   "], ["a number", 42]])(
    "rejects %s",
    async (_label, value) => {
      const id = seedAttempt();
      const response = await submitDiagnosis(id, value);
      expect(response.status).toBe(400);
      expect(stored(id).reviewStatus).toBe("not-submitted");
    },
  );

  it.each([
    ["another student", outsiderId],
    ["the owning professor", ownerId],
  ])("refuses %s", async (_label, caller) => {
    const id = seedAttempt();
    const response = await submitDiagnosis(id, "Use <=", caller);
    expect(response.status).toBe(403);
    expect(stored(id).reviewStatus).toBe("not-submitted");
  });

  it("returns 404 for an unknown attempt", async () => {
    const response = await submitDiagnosis(String(missingId), "Use <=");
    expect(response.status).toBe(404);
  });

  it("refuses to change an approved attempt", async () => {
    const id = seedAttempt({ reviewStatus: "approved", appliedDiagnosis: "Use <=" });
    const response = await submitDiagnosis(id, "Something else");
    expect(response.status).toBe(409);
    expect(stored(id).appliedDiagnosis).toBe("Use <=");
  });

  it("clears old feedback when a returned diagnosis is resubmitted", async () => {
    const id = seedAttempt({
      reviewStatus: "returned",
      appliedDiagnosis: "Use <=",
      professorFeedback: "Explain why",
    });
    const response = await submitDiagnosis(id, "Use <= because 3 must be included");
    expect(response.status).toBe(200);
    expect(stored(id)).toMatchObject({
      reviewStatus: "pending",
      professorFeedback: "",
    });
  });
});

describe("PUT /api/attempts/:id/review: professor review", () => {
  function pending() {
    return seedAttempt({ reviewStatus: "pending", appliedDiagnosis: "Use <=" });
  }

  it("approves a pending diagnosis and records completion", async () => {
    const id = pending();
    const response = await review(id, { decision: "approve", feedback: " Well done " });
    expect(response.status).toBe(200);
    expect(response.body.data.reviewStatus).toBe("approved");
    const record = stored(id);
    expect(record.reviewStatus).toBe("approved");
    expect(record.professorFeedback).toBe("Well done");
    expect(new Date(record.completedAt).getTime()).not.toBeNaN();
  });

  it("returns a diagnosis with feedback and no completion time", async () => {
    const id = pending();
    const response = await review(id, { decision: "return", feedback: "Explain why" });
    expect(response.status).toBe(200);
    expect(stored(id)).toMatchObject({
      reviewStatus: "returned",
      professorFeedback: "Explain why",
      completedAt: null,
    });
  });

  it.each([
    ["no feedback on return", { decision: "return" }],
    ["blank feedback on return", { decision: "return", feedback: "  " }],
    ["an unknown decision", { decision: "accept" }],
    ["non-text feedback", { decision: "approve", feedback: 5 }],
  ])("rejects %s with 400", async (_label, body) => {
    const id = pending();
    const response = await review(id, body);
    expect(response.status).toBe(400);
    expect(stored(id).reviewStatus).toBe("pending");
  });

  it.each([
    ["a different professor", otherId],
    ["the student", studentId],
  ])("refuses %s", async (_label, caller) => {
    const id = pending();
    const response = await review(id, { decision: "approve" }, caller);
    expect(response.status).toBe(403);
    expect(stored(id).reviewStatus).toBe("pending");
  });

  it.each(["not-submitted", "returned", "approved"])(
    "only reviews pending attempts, not %s",
    async (reviewStatus) => {
      const id = seedAttempt({ reviewStatus, appliedDiagnosis: "Use <=" });
      const response = await review(id, { decision: "approve" });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INVALID_REVIEW_STATUS");
    },
  );

  it("completes the full return, resubmit and approve cycle", async () => {
    await answer(0, correctValues[0]);
    await answer(1, correctValues[1]);
    const last = await answer(2, correctValues[2]);
    const id = last.body.data.id;
    expect((await submitDiagnosis(id, "Use <=")).status).toBe(200);
    expect((await review(id, { decision: "return", feedback: "Why?" })).status).toBe(200);
    expect((await answer(0, correctValues[0])).status).toBe(409);
    expect((await submitDiagnosis(id, "Use <= so 3 prints")).status).toBe(200);
    // Third-pass audit H: the returned feedback is kept for the next review.
    expect(stored(id)).toMatchObject({ professorFeedback: "", previousFeedback: "Why?" });
    expect((await review(id, { decision: "approve" })).status).toBe(200);
    expect(stored(id)).toMatchObject({
      reviewStatus: "approved",
      appliedDiagnosis: "Use <= so 3 prints",
      professorFeedback: "",
    });
    expect(stored(id).answers).toHaveLength(3);
  });
});

// The G3 summary and pending groups are covered in insights-review.test.js;
// here the other models answer empty so these Phase C checks still run.
describe("GET /api/classrooms/:id/insights: pending reviews", () => {
  beforeEach(() => {
    vi.spyOn(Challenge, "find").mockImplementation((filter) => ({
      select: async () =>
        [...store.records.values()]
          .filter((item) => String(item.classroomId) === String(filter.classroomId))
          .map((item) => ({ _id: item._id, title: item.title, questions: item.questions ?? [] })),
    }));
    const attemptsFor = (filter) =>
      [...attempts.values()].filter(
        (item) =>
          filter.challengeId.$in.some((id) => String(id) === String(item.challengeId)) &&
          (filter.reviewStatus === undefined || item.reviewStatus === filter.reviewStatus),
      );
    vi.spyOn(Attempt, "find").mockImplementation((filter) => ({
      populate: () => ({
        sort: async () =>
          attemptsFor(filter).map((item) => ({ ...item, studentId: users[item.studentId] })),
      }),
      select: async () => attemptsFor(filter),
    }));
    vi.spyOn(Attempt, "countDocuments").mockImplementation(async (filter) => attemptsFor(filter).length);
    vi.spyOn(MiniProject, "find").mockResolvedValue([]);
    vi.spyOn(ProjectGroup, "find").mockResolvedValue([]);
    vi.spyOn(User, "find").mockResolvedValue([]);
    vi.spyOn(HelpRequest, "find").mockReturnValue({ select: async () => [] });
    vi.spyOn(HelpRequest, "countDocuments").mockResolvedValue(0);
  });

  function insights(caller = ownerId, id = classroomId) {
    return call("get", `/api/classrooms/${id}/insights`, caller);
  }

  it("lists only pending diagnoses with student and challenge names", async () => {
    const id = seedAttempt({
      reviewStatus: "pending",
      appliedDiagnosis: "Use <=",
      previousFeedback: "Say why 3 prints",
    });
    const response = await insights();
    expect(response.status).toBe(200);
    expect(response.body.data.pendingAppliedAttempts).toEqual([
      expect.objectContaining({
        id,
        previousFeedback: "Say why 3 prints",
        studentId: String(studentId),
        studentName: "Student Lee",
        challengeTitle: "Boundary practice",
        appliedDiagnosis: "Use <=",
        reviewStatus: "pending",
      }),
    ]);
    expect(response.text).not.toContain("acceptedAnswer");
  });

  it("returns an empty list when nothing is pending", async () => {
    seedAttempt({ reviewStatus: "approved" });
    const response = await insights();
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      classroomId: String(classroomId),
      pendingAppliedAttempts: [],
      pendingGroups: [],
    });
  });

  it.each([
    ["a different professor", otherId, 403],
    ["a student", studentId, 403],
    ["no selected user", null, 401],
  ])("refuses %s", async (_label, caller, status) => {
    expect((await insights(caller)).status).toBe(status);
  });

  it("returns 404 for an unknown classroom and 400 for a malformed id", async () => {
    vi.spyOn(Classroom, "findById").mockResolvedValue(null);
    expect((await insights(ownerId, String(missingId))).status).toBe(404);
    expect((await insights(ownerId, "example")).status).toBe(400);
  });
});
