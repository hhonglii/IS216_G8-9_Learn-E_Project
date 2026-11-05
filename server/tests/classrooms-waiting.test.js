// Test cases for H3 Step 12.
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
import Membership from "../src/models/Membership.js";

// No database, same approach as insights-review.test.js: each model's queries
// read from the tables below through `matches` (equality and $in), so a record
// from someone else's classroom is left out by the handler's own filters.
const id = () => new mongoose.Types.ObjectId();
const ownerId = id();
const otherProfessorId = id();
const studentId = id();
const lonelyProfessorId = id();
const users = {
  [ownerId]: { _id: ownerId, role: "professor", displayName: "Prof Tan" },
  [otherProfessorId]: { _id: otherProfessorId, role: "professor", displayName: "Prof Lim" },
  [lonelyProfessorId]: { _id: lonelyProfessorId, role: "professor", displayName: "Prof Ng" },
  [studentId]: { _id: studentId, role: "student", displayName: "Alice" },
};

function matches(record, filter) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = record[key];
    if (Array.isArray(actual)) {
      return actual.some((value) => String(value) === String(wanted));
    }
    if (wanted && typeof wanted === "object" && "$in" in wanted) {
      return wanted.$in.some((value) => String(value) === String(actual));
    }
    if (wanted && typeof wanted === "object" && "$ne" in wanted) {
      return String(actual) !== String(wanted.$ne);
    }
    return String(actual) === String(wanted);
  });
}
const where = (table, filter) => table.filter((record) => matches(record, filter));

// Awaitable directly or through .select/.sort. sort really sorts, so the
// createdAt order of classrooms with nothing waiting is tested too.
function query(rows) {
  let out = [...rows];
  const result = {
    select: () => result,
    sort: (spec) => {
      const [[key, direction]] = Object.entries(spec);
      out = [...out].sort((a, b) => (a[key] - b[key]) * direction);
      return result;
    },
    then: (resolve, reject) => Promise.resolve(out).then(resolve, reject),
  };
  return result;
}

const at = (iso) => new Date(`2026-10-${iso}Z`);
const algebraId = id(); // created first, nothing waiting
const loopsId = id(); // created second, waiting since 10-05
const arraysId = id(); // created third, waiting since 10-02
const othersId = id(); // another professor's classroom
let db;

function fixture() {
  const loopsChallenge = id();
  const arraysChallenge = id();
  const othersChallenge = id();
  const loopsProject = id();
  const arraysProject = id();
  const othersProject = id();
  return {
    memberships: [],
    classrooms: [
      // Stored out of order, so the test proves the handler asks for createdAt order.
      { _id: arraysId, name: "Arrays", professorId: ownerId, createdAt: at("01T03:00:00") },
      { _id: algebraId, name: "Algebra", professorId: ownerId, createdAt: at("01T01:00:00") },
      { _id: loopsId, name: "Loops", professorId: ownerId, createdAt: at("01T02:00:00") },
      { _id: othersId, name: "Not yours", professorId: otherProfessorId, createdAt: at("01T00:00:00") },
    ],
    challenges: [
      { _id: loopsChallenge, classroomId: loopsId },
      { _id: arraysChallenge, classroomId: arraysId },
      { _id: othersChallenge, classroomId: othersId },
    ],
    attempts: [
      { _id: id(), challengeId: loopsChallenge, reviewStatus: "pending", updatedAt: at("07T00:00:00") },
      { _id: id(), challengeId: loopsChallenge, reviewStatus: "pending", updatedAt: at("08T00:00:00") },
      { _id: id(), challengeId: loopsChallenge, reviewStatus: "approved", updatedAt: at("01T00:00:00") },
      { _id: id(), challengeId: loopsChallenge, reviewStatus: "returned", updatedAt: at("01T00:00:00") },
      { _id: id(), challengeId: loopsChallenge, reviewStatus: "not-submitted", updatedAt: at("01T00:00:00") },
      { _id: id(), challengeId: arraysChallenge, reviewStatus: "pending", updatedAt: at("09T00:00:00") },
      { _id: id(), challengeId: othersChallenge, reviewStatus: "pending", updatedAt: at("01T00:00:00") },
    ],
    miniProjects: [
      { _id: loopsProject, classroomId: loopsId },
      { _id: arraysProject, classroomId: arraysId },
      { _id: othersProject, classroomId: othersId },
    ],
    groups: [
      { _id: id(), miniProjectId: loopsProject, submissionStatus: "submitted", updatedAt: at("05T00:00:00") },
      { _id: id(), miniProjectId: loopsProject, submissionStatus: "draft", updatedAt: at("01T00:00:00") },
      { _id: id(), miniProjectId: loopsProject, submissionStatus: "approved", updatedAt: at("01T00:00:00") },
      { _id: id(), miniProjectId: loopsProject, submissionStatus: "returned", updatedAt: at("01T00:00:00") },
      { _id: id(), miniProjectId: othersProject, submissionStatus: "submitted", updatedAt: at("01T00:00:00") },
    ],
    helpRequests: [
      // The oldest thing waiting in Arrays. Its updatedAt is later on purpose:
      // a help request waits from when it was asked.
      { _id: id(), classroomId: arraysId, status: "open", createdAt: at("02T00:00:00"), updatedAt: at("20T00:00:00") },
      { _id: id(), classroomId: arraysId, status: "open", createdAt: at("06T00:00:00"), updatedAt: at("06T00:00:00") },
      { _id: id(), classroomId: arraysId, status: "claimed", createdAt: at("01T00:00:00"), updatedAt: at("01T00:00:00") },
      { _id: id(), classroomId: arraysId, status: "responded", createdAt: at("01T00:00:00"), updatedAt: at("01T00:00:00") },
      { _id: id(), classroomId: arraysId, status: "resolved", createdAt: at("01T00:00:00"), updatedAt: at("01T00:00:00") },
      { _id: id(), classroomId: othersId, status: "open", createdAt: at("01T00:00:00"), updatedAt: at("01T00:00:00") },
    ],
  };
}

beforeEach(() => {
  db = fixture();
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (userId) => users[String(userId)] ?? null);
  vi.spyOn(Classroom, "find").mockImplementation((filter) => query(where(db.classrooms, filter)));
  vi.spyOn(Classroom, "findById").mockImplementation(async () => null);
  vi.spyOn(Challenge, "find").mockImplementation((filter) => query(where(db.challenges, filter)));
  vi.spyOn(Attempt, "find").mockImplementation((filter) => query(where(db.attempts, filter)));
  vi.spyOn(MiniProject, "find").mockImplementation((filter) => query(where(db.miniProjects, filter)));
  vi.spyOn(ProjectGroup, "find").mockImplementation((filter) => query(where(db.groups, filter)));
  vi.spyOn(Membership, "find").mockImplementation((filter) => query(where(db.memberships, filter)));
  vi.spyOn(HelpRequest, "find").mockImplementation((filter) => query(where(db.helpRequests, filter)));
});
afterEach(() => vi.restoreAllMocks());

function waiting(caller = ownerId) {
  const pending = request(createApp()).get("/api/classrooms/waiting");
  return caller ? pending.set(...sessionHeader(caller)) : pending;
}

describe("GET /api/classrooms/waiting: who may read it", () => {
  it("answers 401 with no logged-in user", async () => {
    const response = await waiting(null);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.body.error.message).toBe("Log in to see what is waiting on you.");
  });


  it("is its own route, not a classroom whose id is 'waiting'", async () => {
    await waiting();
    expect(Classroom.findById).not.toHaveBeenCalled();
    expect(Classroom.find).toHaveBeenCalledWith({ professorId: ownerId });
  });
});

describe("GET /api/classrooms/waiting: the rows", () => {
  it("lists only the caller's classrooms", async () => {
    const response = await waiting();
    expect(response.status).toBe(200);
    expect(response.body.data.map((row) => row.classroomName)).not.toContain("Not yours");
    expect(response.body.data).toHaveLength(3);
  });

  it("counts only pending diagnoses, submitted groups and open help requests", async () => {
    const response = await waiting();
    const loops = response.body.data.find((row) => row.classroomName === "Loops");
    const arrays = response.body.data.find((row) => row.classroomName === "Arrays");
    expect(loops).toEqual({
      classroomId: String(loopsId),
      classroomName: "Loops",
      pendingDiagnoses: 2,
      pendingGroups: 1,
      openHelpRequests: 0,
      oldestWaitingAt: "2026-10-05T00:00:00.000Z",
    });
    expect(arrays).toMatchObject({ pendingDiagnoses: 1, pendingGroups: 0, openHelpRequests: 2 });
  });

  it("dates a help request from when it was asked, not when it last changed", async () => {
    const response = await waiting();
    const arrays = response.body.data.find((row) => row.classroomName === "Arrays");
    expect(arrays.oldestWaitingAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("gives a classroom with nothing waiting zero counts and a null date", async () => {
    const response = await waiting();
    expect(response.body.data.find((row) => row.classroomName === "Algebra")).toEqual({
      classroomId: String(algebraId),
      classroomName: "Algebra",
      pendingDiagnoses: 0,
      pendingGroups: 0,
      openHelpRequests: 0,
      oldestWaitingAt: null,
    });
  });

  it("puts the longest wait first and classrooms with nothing waiting last", async () => {
    const response = await waiting();
    expect(response.body.data.map((row) => row.classroomName)).toEqual(["Arrays", "Loops", "Algebra"]);
  });

  it("keeps classrooms with nothing waiting in the order they were created", async () => {
    db.attempts = [];
    db.groups = [];
    db.helpRequests = [];
    const response = await waiting();
    expect(response.body.data.map((row) => row.classroomName)).toEqual(["Algebra", "Loops", "Arrays"]);
  });

  it("answers an empty list to a professor with no classrooms", async () => {
    const response = await waiting(lonelyProfessorId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });
});

// Third-pass audit A: a student is told what needs them, not only professors.
describe("GET /api/classrooms/waiting: a student's rows", () => {
  const classmateId = id();
  let challengeA;
  let projectA;
  beforeEach(() => {
    challengeA = db.challenges[0]._id; // in Loops
    projectA = db.miniProjects[0]._id; // in Loops
    db.memberships = [
      { userId: studentId, classroomId: loopsId },
      { userId: studentId, classroomId: algebraId },
    ];
    db.challenges[0].title = "Off by one";
    db.miniProjects[0].title = "Loop kit";
    db.attempts = [
      { challengeId: challengeA, studentId, reviewStatus: "returned", updatedAt: at("06T00:00:00") },
      { challengeId: challengeA, studentId: classmateId, reviewStatus: "returned", updatedAt: at("01T00:00:00") },
      { challengeId: db.challenges[1]._id, studentId, reviewStatus: "returned", updatedAt: at("01T00:00:00") },
    ];
    db.groups = [
      { miniProjectId: projectA, memberIds: [classmateId, studentId], submissionStatus: "returned", updatedAt: at("04T00:00:00") },
      { miniProjectId: projectA, memberIds: [classmateId], submissionStatus: "returned", updatedAt: at("01T00:00:00") },
    ];
    db.helpRequests = [
      { classroomId: loopsId, requesterId: studentId, status: "responded", updatedAt: at("08T00:00:00") },
      { classroomId: loopsId, requesterId: studentId, status: "claimed", updatedAt: at("01T00:00:00") },
      { classroomId: loopsId, requesterId: classmateId, status: "responded", updatedAt: at("01T00:00:00") },
    ];
  });

  it("lists returned diagnoses, returned group work and hints to check, only the student's own", async () => {
    const response = await waiting(studentId);
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toEqual({
      classroomId: String(loopsId),
      classroomName: "Loops",
      returnedDiagnoses: [{ challengeId: String(challengeA), title: "Off by one" }],
      returnedProjects: [{ miniProjectId: String(projectA), title: "Loop kit" }],
      hintsToCheck: 1,
      requestsToHelp: 0,
      newChallenges: [],
      approvedDiagnoses: [],
      oldestWaitingAt: "2026-10-04T00:00:00.000Z",
    });
  });

  // UX audit item 10: new challenges, a recent approval and the questions it
  // lets the student answer.
  it("lists unstarted published challenges, approvals this week and requests they can help with", async () => {
    const newChallenge = id();
    const draftChallenge = id();
    const oldWin = id();
    db.challenges.push(
      { _id: newChallenge, classroomId: loopsId, title: "Fence posts", status: "published", updatedAt: at("03T00:00:00") },
      { _id: draftChallenge, classroomId: loopsId, title: "Not out yet", status: "draft", updatedAt: at("01T00:00:00") },
      { _id: oldWin, classroomId: loopsId, title: "Old win", status: "published", updatedAt: at("01T00:00:00") },
    );
    db.attempts = [
      { challengeId: challengeA, studentId, reviewStatus: "approved", completedAt: new Date(), updatedAt: at("09T00:00:00") },
      { challengeId: oldWin, studentId, reviewStatus: "approved", completedAt: at("01T00:00:00"), updatedAt: at("01T00:00:00") },
    ];
    db.groups = [];
    db.helpRequests = [
      // Classmates' open questions on a challenge the student has finished count.
      { classroomId: loopsId, requesterId: classmateId, status: "open", qualifyingChallengeId: challengeA, createdAt: at("02T00:00:00") },
      { classroomId: loopsId, requesterId: classmateId, status: "open", qualifyingChallengeId: oldWin, createdAt: at("08T00:00:00") },
      // Their own question, a claimed one and one on a challenge they haven't finished don't.
      { classroomId: loopsId, requesterId: studentId, status: "open", qualifyingChallengeId: challengeA, createdAt: at("01T00:00:00") },
      { classroomId: loopsId, requesterId: classmateId, status: "claimed", qualifyingChallengeId: challengeA, createdAt: at("01T00:00:00") },
      { classroomId: loopsId, requesterId: classmateId, status: "open", qualifyingChallengeId: newChallenge, createdAt: at("01T00:00:00") },
    ];
    const response = await waiting(studentId);
    expect(response.body.data[0]).toMatchObject({
      classroomName: "Loops",
      requestsToHelp: 2,
      newChallenges: [{ challengeId: String(newChallenge), title: "Fence posts" }],
      approvedDiagnoses: [{ challengeId: String(challengeA), title: "Off by one" }],
      // The oldest request they can help with; an approval doesn't set the wait.
      oldestWaitingAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("covers only the classrooms the student is in, the quiet ones last", async () => {
    const response = await waiting(studentId);
    expect(response.body.data.map((row) => row.classroomName)).toEqual(["Loops", "Algebra"]);
    expect(response.body.data[1]).toMatchObject({ hintsToCheck: 0, oldestWaitingAt: null });
  });
});
