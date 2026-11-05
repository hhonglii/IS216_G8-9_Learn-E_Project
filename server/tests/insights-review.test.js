// Test cases for slice G3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Challenge from "../src/models/Challenge.js";
import Attempt from "../src/models/Attempt.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import HelpRequest from "../src/models/HelpRequest.js";

// No database: each model's queries read from the in-memory tables below
// through `matches`, which understands the operators getInsights uses
// (equality, $in, $ne). So a record from another classroom is left out by the
// handler's own filters, not by the mock. Counts are checked against the G5
// table in docs/steps/PHASE_G_STEPS.md.
const id = () => new mongoose.Types.ObjectId();
const ownerId = id();
const otherProfessorId = id();
const aliceId = id();
const bobId = id();
const caraId = id();
const classroomId = id();
const otherClassroomId = id();
const users = {
  [ownerId]: { _id: ownerId, role: "professor", displayName: "Prof Tan" },
  [otherProfessorId]: { _id: otherProfessorId, role: "professor", displayName: "Prof Lim" },
  [aliceId]: { _id: aliceId, role: "student", displayName: "Alice" },
  [bobId]: { _id: bobId, role: "student", displayName: "Bob" },
  [caraId]: { _id: caraId, role: "student", displayName: "Cara" },
};

function matches(record, filter) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = record[key];
    if (wanted && typeof wanted === "object" && "$in" in wanted) {
      return wanted.$in.some((value) => String(value) === String(actual));
    }
    if (wanted && typeof wanted === "object" && "$ne" in wanted) {
      return wanted.$ne === null ? actual != null : String(actual) !== String(wanted.$ne);
    }
    return String(actual) === String(wanted);
  });
}
const where = (table, filter) => table.filter((record) => matches(record, filter));

// A query that can be awaited directly or through .select/.populate/.sort,
// because getInsights uses all of these shapes.
function query(rows) {
  const result = {
    select: () => result,
    populate: () => result,
    sort: () => result,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return result;
}

const predictId = id();
const locateId = id();
const otherPredictId = id();
let db;

function fixture() {
  const boundary = id();
  const elsewhere = id();
  const counter = id();
  const otherProject = id();
  return {
    challenges: [
      {
        _id: boundary,
        classroomId,
        title: "Boundary practice",
        appliedCase: { prompt: "A shop loop skips the last item. Why?" },
        explanation: "The loop stops one early because it uses <.",
        questions: [
          {
            _id: predictId,
            type: "predict-output",
            prompt: "What prints?",
            options: [
              { id: "a", label: "0" },
              { id: "b", label: "1" },
              { id: "c", label: "2" },
            ],
            acceptedAnswer: "a",
          },
          { _id: locateId, type: "locate-fault", prompt: "Which line?", options: [] },
        ],
      },
      {
        _id: elsewhere,
        classroomId: otherClassroomId,
        title: "Other classroom",
        questions: [
          {
            _id: otherPredictId,
            type: "predict-output",
            prompt: "Not yours",
            options: [{ id: "b", label: "1" }],
          },
        ],
      },
    ],
    attempts: [
      // Alice: wrong b, then right a; a wrong locate-fault answer. Approved.
      {
        _id: id(),
        challengeId: boundary,
        studentId: aliceId,
        answers: [
          { questionId: String(predictId), value: "b", correct: false },
          { questionId: String(predictId), value: "a", correct: true },
          { questionId: String(locateId), value: { location: "1" }, correct: false },
        ],
        reviewStatus: "approved",
        completedAt: new Date("2026-10-20T08:00:00Z"),
        updatedAt: new Date("2026-10-20T08:00:00Z"),
      },
      // Bob: wrong b, then wrong c. Waiting for review.
      {
        _id: id(),
        challengeId: boundary,
        studentId: bobId,
        answers: [
          { questionId: String(predictId), value: "b", correct: false },
          { questionId: String(predictId), value: "c", correct: false },
        ],
        reviewStatus: "pending",
        appliedDiagnosis: "Use <=",
        updatedAt: new Date("2026-10-21T08:00:00Z"),
      },
      // Cara: wrong b. Returned, so neither pending nor completed (G5).
      {
        _id: id(),
        challengeId: boundary,
        studentId: caraId,
        answers: [{ questionId: String(predictId), value: "b", correct: false }],
        reviewStatus: "returned",
        appliedDiagnosis: "Something with the loop",
        professorFeedback: "Say which comparison is wrong.",
        updatedAt: new Date("2026-10-22T08:00:00Z"),
      },
      // Another classroom's attempt, which must not count anywhere.
      {
        _id: id(),
        challengeId: elsewhere,
        studentId: aliceId,
        answers: [{ questionId: String(otherPredictId), value: "b", correct: false }],
        reviewStatus: "pending",
        updatedAt: new Date("2026-10-19T08:00:00Z"),
      },
    ],
    miniProjects: [
      {
        _id: counter,
        classroomId,
        title: "Repair the counter app",
        rubric: "Working fix, honest reflection.",
        acceptanceCriteria: ["Counts to 10", "Has a test"],
      },
      { _id: otherProject, classroomId: otherClassroomId, title: "Not yours" },
    ],
    groups: [
      {
        _id: id(),
        miniProjectId: counter,
        name: "Team Rocket",
        memberIds: [aliceId, bobId],
        stageEvidence: { Diagnose: "Off by one", Repair: "Changed < to <=", Verify: "Tested 0" },
        reflection: "We fixed the loop.",
        submissionStatus: "submitted",
        updatedAt: new Date("2026-10-23T08:00:00Z"),
      },
      {
        _id: id(),
        miniProjectId: counter,
        name: "Team Aqua",
        memberIds: [caraId, id()],
        submissionStatus: "submitted",
        updatedAt: new Date("2026-10-22T08:00:00Z"),
      },
      { _id: id(), miniProjectId: counter, name: "Drafty", memberIds: [], submissionStatus: "draft" },
      { _id: id(), miniProjectId: counter, name: "Again", memberIds: [], submissionStatus: "returned" },
      {
        _id: id(),
        miniProjectId: otherProject,
        name: "Elsewhere",
        memberIds: [aliceId],
        submissionStatus: "submitted",
        updatedAt: new Date("2026-10-01T08:00:00Z"),
      },
    ],
    helpRequests: [
      { _id: id(), classroomId, status: "open", hintType: "Guiding question", reopenCount: 2 },
      { _id: id(), classroomId, status: "resolved", hintType: "Concept reminder", reopenCount: 0 },
      { _id: id(), classroomId, status: "open", hintType: "Guiding question", reopenCount: 1 },
      // Saved before G-8, so it has no reopenCount at all.
      { _id: id(), classroomId, status: "claimed", hintType: "Fault-location clue" },
      { _id: id(), classroomId: otherClassroomId, status: "open", hintType: "Concept reminder", reopenCount: 5 },
    ],
  };
}

beforeEach(() => {
  db = fixture();
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (userId) => users[String(userId)] ?? null);
  vi.spyOn(User, "find").mockImplementation((filter) => query(where(Object.values(users), filter)));
  vi.spyOn(Classroom, "findById").mockImplementation(async (wanted) =>
    String(wanted) === String(classroomId) ? { _id: classroomId, professorId: ownerId } : null,
  );
  vi.spyOn(Challenge, "find").mockImplementation((filter) => query(where(db.challenges, filter)));
  vi.spyOn(Attempt, "find").mockImplementation((filter) =>
    query(
      where(db.attempts, filter).map((attempt) => ({
        ...attempt,
        studentId: users[String(attempt.studentId)] ?? attempt.studentId,
      })),
    ),
  );
  vi.spyOn(Attempt, "countDocuments").mockImplementation(async (filter) => where(db.attempts, filter).length);
  vi.spyOn(MiniProject, "find").mockImplementation((filter) => query(where(db.miniProjects, filter)));
  vi.spyOn(ProjectGroup, "find").mockImplementation((filter) => query(where(db.groups, filter)));
  vi.spyOn(HelpRequest, "find").mockImplementation((filter) => query(where(db.helpRequests, filter)));
  vi.spyOn(HelpRequest, "countDocuments").mockImplementation(async (filter) => where(db.helpRequests, filter).length);
});
afterEach(() => vi.restoreAllMocks());

function insights(caller = ownerId, classroom = classroomId) {
  const pending = request(createApp()).get(`/api/classrooms/${classroom}/insights`);
  return caller ? pending.set(...sessionHeader(caller)) : pending;
}

describe("GET /api/classrooms/:id/insights: who may read it", () => {
  it.each([
    ["a student", aliceId, 403],
    ["a professor who does not own the classroom", otherProfessorId, 403],
    ["no selected user", null, 401],
  ])("refuses %s before counting anything", async (_, caller, status) => {
    const response = await insights(caller);
    expect(response.status).toBe(status);
    expect(response.body.data).toBeUndefined();
    expect(Attempt.countDocuments).not.toHaveBeenCalled();
    expect(HelpRequest.find).not.toHaveBeenCalled();
  });
});

describe("GET /api/classrooms/:id/insights: the summary (G5 table)", () => {
  it("counts attempts as the G5 table defines them, leaving returned ones out", async () => {
    const { summary } = (await insights()).body.data;
    expect(summary.startedAttempts).toBe(3);
    expect(summary.completedAttempts).toBe(1);
    expect(summary.pendingAttemptReviews).toBe(1);
  });

  it("does not count an approved attempt that has no completedAt", async () => {
    db.attempts[0].completedAt = undefined;
    const { summary } = (await insights()).body.data;
    expect(summary.completedAttempts).toBe(0);
  });

  it("counts every wrong predict-output pick, retries included, most chosen first (G-7)", async () => {
    const { summary } = (await insights()).body.data;
    expect(summary.wrongOptions).toEqual([
      {
        challengeTitle: "Boundary practice",
        questionPrompt: "What prints?",
        correctLabel: "0",
        options: [
          { optionId: "b", label: "1", count: 3 },
          { optionId: "c", label: "2", count: 1 },
        ],
      },
    ]);
  });

  it("counts one student's repeated wrong pick once per retry", async () => {
    db.attempts = [
      {
        _id: id(),
        challengeId: db.challenges[0]._id,
        studentId: aliceId,
        answers: ["c", "c", "c"].map((value) => ({
          questionId: String(predictId),
          value,
          correct: false,
        })),
        reviewStatus: "not-submitted",
      },
    ];
    const { summary } = (await insights()).body.data;
    expect(summary.wrongOptions[0].options).toEqual([{ optionId: "c", label: "2", count: 3 }]);
  });

  it("shows the bare option id when the option no longer exists on the question", async () => {
    db.attempts = [
      {
        _id: id(),
        challengeId: db.challenges[0]._id,
        studentId: aliceId,
        answers: [{ questionId: String(predictId), value: "z", correct: false }],
        reviewStatus: "not-submitted",
      },
    ];
    const { summary } = (await insights()).body.data;
    expect(summary.wrongOptions[0].options).toEqual([{ optionId: "z", label: "z", count: 1 }]);
  });

  // H3 Step 9: the chart names the right answer by its label (the route is owner-only).
  it("leaves the right answer blank when the accepted option no longer exists", async () => {
    db.challenges[0].questions[0].acceptedAnswer = "gone";
    const { summary } = (await insights()).body.data;
    expect(summary.wrongOptions[0].correctLabel).toBe("");
  });

  it("never sends the accepted answer", async () => {
    const response = await insights();
    expect(response.text).not.toContain("acceptedAnswer");
  });

  it("counts help requests, adding a missing reopenCount as 0 (G-8)", async () => {
    const { summary } = (await insights()).body.data;
    expect(summary.openHelpRequests).toBe(2);
    expect(summary.timesMarkedUnresolved).toBe(3);
    expect(summary.mostRequestedHintType).toEqual(["Guiding question"]);
  });

  it("names every hint type that ties for most requested", async () => {
    db.helpRequests.push({ _id: id(), classroomId, status: "open", hintType: "Fault-location clue", reopenCount: 0 });
    const { summary } = (await insights()).body.data;
    expect([...summary.mostRequestedHintType].sort()).toEqual(["Fault-location clue", "Guiding question"]);
  });

  it("counts this classroom's groups by status", async () => {
    const { summary } = (await insights()).body.data;
    expect(summary.groupsByStatus).toEqual({ draft: 1, submitted: 2, approved: 0, returned: 1 });
    expect(summary.pendingGroupReviews).toBe(2);
  });

  it("gives an empty classroom every count as 0 and every list as empty", async () => {
    db = { challenges: [], attempts: [], miniProjects: [], groups: [], helpRequests: [] };
    const response = await insights();
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      classroomId: String(classroomId),
      pendingAppliedAttempts: [],
      pendingGroups: [],
      reviewedAttempts: [],
      reviewedGroups: [],
      summary: {
        startedAttempts: 0,
        completedAttempts: 0,
        pendingAttemptReviews: 0,
        pendingGroupReviews: 0,
        wrongOptions: [],
        openHelpRequests: 0,
        timesMarkedUnresolved: 0,
        mostRequestedHintType: [],
        groupsByStatus: { draft: 0, submitted: 0, approved: 0, returned: 0 },
      },
    });
  });
});

describe("GET /api/classrooms/:id/insights: pending groups", () => {
  it("lists only this classroom's submitted groups, oldest first", async () => {
    const { pendingGroups } = (await insights()).body.data;
    expect(pendingGroups.map((group) => group.name)).toEqual(["Team Aqua", "Team Rocket"]);
  });

  it("sends what the professor needs to decide, with every stage present", async () => {
    const { pendingGroups } = (await insights()).body.data;
    const rocket = pendingGroups.find((group) => group.name === "Team Rocket");
    const saved = db.groups[0];
    expect(rocket).toEqual({
      id: String(saved._id),
      name: "Team Rocket",
      miniProjectId: String(saved.miniProjectId),
      miniProjectTitle: "Repair the counter app",
      rubric: "Working fix, honest reflection.",
      acceptanceCriteria: ["Counts to 10", "Has a test"],
      previousFeedback: "",
      members: [
        { id: String(aliceId), displayName: "Alice" },
        { id: String(bobId), displayName: "Bob" },
      ],
      stageEvidence: {
        Diagnose: "Off by one",
        Repair: "Changed < to <=",
        Extend: "",
        Verify: "Tested 0",
        Reflect: "",
      },
      reflection: "We fixed the loop.",
      submittedAt: saved.updatedAt.toISOString(),
    });
  });

  it("fills gaps instead of dropping keys: no evidence, no reflection, an unknown member", async () => {
    const { pendingGroups } = (await insights()).body.data;
    const aqua = pendingGroups.find((group) => group.name === "Team Aqua");
    expect(aqua.reflection).toBe("");
    expect(Object.values(aqua.stageEvidence)).toEqual(["", "", "", "", ""]);
    expect(aqua.members.map((member) => member.displayName)).toEqual(["Cara", "Unknown student"]);
  });

  it("looks group members up with one query, not one per group", async () => {
    await insights();
    expect(User.find).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing pending diagnoses list beside the new fields", async () => {
    const { pendingAppliedAttempts } = (await insights()).body.data;
    expect(pendingAppliedAttempts).toEqual([
      expect.objectContaining({
        studentName: "Bob",
        challengeTitle: "Boundary practice",
        appliedDiagnosis: "Use <=",
        reviewStatus: "pending",
      }),
    ]);
  });
});

// UX audit item 14: what the professor compares against, and the history.
describe("GET /api/classrooms/:id/insights: review context and history", () => {
  it("sends the applied-case prompt and official explanation with each pending diagnosis", async () => {
    const [bob] = (await insights()).body.data.pendingAppliedAttempts;
    expect(bob).toMatchObject({
      appliedCasePrompt: "A shop loop skips the last item. Why?",
      officialExplanation: "The loop stops one early because it uses <.",
    });
  });

  it("lists approved and returned diagnoses with the feedback given, not pending ones", async () => {
    const { reviewedAttempts } = (await insights()).body.data;
    const cara = db.attempts[2];
    expect(reviewedAttempts.map((attempt) => attempt.studentName)).toEqual(["Alice", "Cara"]);
    expect(reviewedAttempts[1]).toEqual({
      id: String(cara._id),
      studentId: String(caraId),
      studentName: "Cara",
      challengeId: String(cara.challengeId),
      challengeTitle: "Boundary practice",
      appliedDiagnosis: "Something with the loop",
      feedback: "Say which comparison is wrong.",
      reviewStatus: "returned",
      reviewedAt: cara.updatedAt.toISOString(),
    });
    expect(reviewedAttempts[0]).toMatchObject({ reviewStatus: "approved", feedback: "" });
  });

  it("lists this classroom's approved and returned groups, newest first", async () => {
    db.groups.push({
      _id: id(),
      miniProjectId: db.miniProjects[0]._id,
      name: "Team Magma",
      memberIds: [bobId],
      professorFeedback: "Great tests.",
      submissionStatus: "approved",
      updatedAt: new Date("2026-10-25T08:00:00Z"),
    });
    db.groups.find((group) => group.name === "Again").updatedAt = new Date("2026-10-24T08:00:00Z");
    const { reviewedGroups } = (await insights()).body.data;
    expect(reviewedGroups.map((group) => group.name)).toEqual(["Team Magma", "Again"]);
    expect(reviewedGroups[0]).toMatchObject({
      miniProjectTitle: "Repair the counter app",
      members: [{ id: String(bobId), displayName: "Bob" }],
      feedback: "Great tests.",
      submissionStatus: "approved",
      reviewedAt: "2026-10-25T08:00:00.000Z",
    });
  });
});
