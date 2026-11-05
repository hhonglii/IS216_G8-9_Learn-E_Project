// Test cases for slice A7a.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";
import MiniProject from "../src/models/MiniProject.js";
import Challenge from "../src/models/Challenge.js";
import Attempt from "../src/models/Attempt.js";

// No live database, same approach as classrooms-join.test.js. Users, the
// classroom and memberships are hydrated documents, so .id, ._id and toJSON
// behave as they do against Atlas. The classroom's professorId is a separate
// ObjectId instance from the professor's _id, as it is after a real read, so an
// ownership check written with === on ObjectIds fails here as it would live.
// Lookups are mocked whichever common method the handler uses (findById,
// findOne, exists or countDocuments).
const { ObjectId } = mongoose.Types;
const ownerId = new ObjectId();
const otherProfessorId = new ObjectId();
const memberId = new ObjectId();
const outsiderId = new ObjectId();
const newcomerId = new ObjectId();
const classroomId = new ObjectId();
const otherClassroomId = new ObjectId();
const users = Object.fromEntries(
  [
    [ownerId, "Prof Tan", "professor"],
    [otherProfessorId, "Prof Lim", "professor"],
    [memberId, "Alice", "student"],
    [outsiderId, "Bob", "student"],
    [newcomerId, "Cara", "student"],
  ].map(([_id, displayName, role]) => [
    String(_id),
    User.hydrate({ _id, displayName, role }),
  ]),
);
const storedClassroom = () =>
  Classroom.hydrate({
    _id: new ObjectId(String(classroomId)),
    name: "IS216 G10",
    description: "Debugging practice",
    joinCode: "ABC234",
    professorId: new ObjectId(String(ownerId)),
    coverId: "coral-loop",
  });
// Alice belongs to this classroom, Bob only to a different one, Cara to none.
const memberships = [
  { classroomId, userId: memberId },
  { classroomId: otherClassroomId, userId: outsiderId },
].map((fields) => Membership.hydrate({ _id: new ObjectId(), ...fields }));

const sameId = (a, b) => a !== undefined && String(a) === String(b);
function findMembership(filter = {}) {
  return (
    memberships.find(
      (m) =>
        sameId(filter.classroomId, m.classroomId) &&
        sameId(filter.userId, m.userId),
    ) ?? null
  );
}
function findClassroom(filter = {}) {
  const id = filter._id ?? filter.id;
  return sameId(id, classroomId) ? storedClassroom() : null;
}

function get(id, callerId) {
  const req = request(createApp()).get(`/api/classrooms/${id}`);
  return callerId ? req.set(...sessionHeader(callerId)) : req;
}

let classroomLookups, challengeRows, challengeLookup, attemptRows;
beforeEach(() => {
  challengeRows = [];
  attemptRows = [];
  vi.spyOn(Attempt, "find").mockImplementation(async (filter) =>
    attemptRows.filter(
      (attempt) =>
        sameId(attempt.studentId, filter.studentId) &&
        filter.challengeId.$in.some((id) => sameId(id, attempt.challengeId)),
    ),
  );
  vi.spyOn(MiniProject, "find").mockResolvedValue([]);
  challengeLookup = vi
    .spyOn(Challenge, "find")
    .mockImplementation(async (filter) =>
      challengeRows.filter(
        (challenge) =>
          sameId(challenge.classroomId, filter.classroomId) &&
          (filter.status === undefined || challenge.status === filter.status),
      ),
    );
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(
    async (id) => users[String(id)] ?? null,
  );
  classroomLookups = [
    vi
      .spyOn(Classroom, "findById")
      .mockImplementation(async (id) => findClassroom({ _id: id })),
    vi
      .spyOn(Classroom, "findOne")
      .mockImplementation(async (filter) => findClassroom(filter)),
  ];
  vi.spyOn(Membership, "findOne").mockImplementation(async (filter) =>
    findMembership(filter),
  );
  vi.spyOn(Membership, "exists").mockImplementation(async (filter) => {
    const found = findMembership(filter);
    return found ? { _id: found._id } : null;
  });
  vi.spyOn(Membership, "countDocuments").mockImplementation(async (filter) =>
    findMembership(filter) ? 1 : 0,
  );
});
afterEach(() => vi.restoreAllMocks());

const expectNoClassroomLookup = () => {
  classroomLookups.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  expect(challengeLookup).not.toHaveBeenCalled();
};

describe("GET /api/classrooms/:id: identity and id shape", () => {
  it("rejects a request with no selected user as 401 without a lookup", async () => {
    const response = await get(classroomId);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expectNoClassroomLookup();
  });

  it.each([
    ["too short", "abc"],
    ["23 characters", "a".repeat(23)],
    ["25 characters", "a".repeat(25)],
    ["not hex", "z".repeat(24)],
  ])("rejects an id that is %s as 400, not a 500", async (_, id) => {
    const response = await get(id, ownerId);
    expect(response.status).toBe(400);
    expect(typeof response.body.error.code).toBe("string");
    expectNoClassroomLookup();
  });

  it("answers a well-formed id that matches nothing with 404", async () => {
    const response = await get(new ObjectId(), ownerId);
    expect(response.status).toBe(404);
    expect(typeof response.body.error.code).toBe("string");
  });
});

describe("GET /api/classrooms/:id: visible challenge summaries", () => {
  function addChallenges() {
    challengeRows = [
      {
        _id: new ObjectId(),
        classroomId,
        title: "Unfinished draft",
        status: "draft",
      },
      {
        _id: new ObjectId(),
        classroomId,
        title: "Published practice",
        status: "published",
      },
      {
        _id: new ObjectId(),
        classroomId: otherClassroomId,
        title: "Other classroom",
        status: "published",
      },
    ].map((challenge) => ({
      ...challenge,
      questions: [
        {
          acceptedAnswer: "PRIVATE_ANSWER",
          explanation: "PRIVATE_EXPLANATION",
        },
      ],
      explanation: "PRIVATE_EXPLANATION",
      progressiveHints: ["PRIVATE_HINT"],
    }));
  }

  it("returns draft and published id/title/status summaries to the owner", async () => {
    addChallenges();
    const before = JSON.stringify(challengeRows);
    const response = await get(classroomId, ownerId);
    expect(response.status).toBe(200);
    expect(response.body.data.challenges).toEqual(
      challengeRows.slice(0, 2).map((row) => ({
        id: String(row._id),
        title: row.title,
        status: row.status,
      })),
    );
    expect(challengeLookup).toHaveBeenCalledWith(
      { classroomId: expect.any(ObjectId) },
      { title: 1, status: 1 },
      { sort: { createdAt: 1, _id: 1 } },
    );
    expect(response.text).not.toContain("PRIVATE_");
    expect(response.text).not.toContain("acceptedAnswer");
    expect(response.text).not.toContain("questions");
    expect(response.body.data.miniProjects).toEqual([]);
    expect(JSON.stringify(challengeRows)).toBe(before);
  });

  it("returns only published id/title summaries in the student's classroom", async () => {
    addChallenges();
    const response = await get(classroomId, memberId);
    expect(response.status).toBe(200);
    expect(response.body.data.challenges).toEqual([
      {
        id: String(challengeRows[1]._id),
        title: "Published practice",
        progress: { answered: 0, total: 1, reviewStatus: "not-submitted" },
      },
    ]);
    expect(challengeLookup).toHaveBeenCalledWith(
      { classroomId: expect.any(ObjectId), status: "published" },
      { title: 1, "questions._id": 1 },
      { sort: { createdAt: 1, _id: 1 } },
    );
    expect(response.text).not.toContain("Unfinished draft");
    expect(response.text).not.toContain("Other classroom");
    expect(response.text).not.toContain("PRIVATE_");
    expect(response.text).not.toContain("acceptedAnswer");
    expect(response.body.data).not.toHaveProperty("joinCode");
  });

  it("gives the student their own progress on each challenge (UX audit item 11)", async () => {
    addChallenges();
    const published = challengeRows[1];
    attemptRows = [
      {
        challengeId: published._id,
        studentId: memberId,
        structuredScore: 1,
        reviewStatus: "pending",
      },
      // Someone else's attempt never counts.
      {
        challengeId: published._id,
        studentId: outsiderId,
        structuredScore: 0,
        reviewStatus: "returned",
      },
    ];
    const response = await get(classroomId, memberId);
    expect(response.body.data.challenges[0].progress).toEqual({
      answered: 1,
      total: 1,
      reviewStatus: "pending",
    });
    expect(Attempt.find).toHaveBeenCalledWith(
      { challengeId: { $in: [published._id] }, studentId: memberId },
      { challengeId: 1, structuredScore: 1, reviewStatus: 1 },
    );
  });

  it("gives the owning professor no progress field", async () => {
    addChallenges();
    const response = await get(classroomId, ownerId);
    expect(response.body.data.challenges[0]).not.toHaveProperty("progress");
    expect(Attempt.find).not.toHaveBeenCalled();
  });

  it.each([newcomerId, outsiderId, otherProfessorId])(
    "does not query challenges for unauthorized caller %s",
    async (caller) => {
      addChallenges();
      const response = await get(classroomId, caller);
      expect(response.status).toBe(403);
      expect(challengeLookup).not.toHaveBeenCalled();
      expect(response.text).not.toContain("Unfinished draft");
    },
  );

  it("does not treat a professor's membership as learner access", async () => {
    vi.mocked(Membership.findOne).mockResolvedValueOnce({
      classroomId,
      userId: otherProfessorId,
    });
    expect((await get(classroomId, otherProfessorId)).status).toBe(403);
    expect(challengeLookup).not.toHaveBeenCalled();
  });

  it("does not grant draft access to a student whose id matches professorId", async () => {
    addChallenges();
    vi.mocked(User.findById).mockResolvedValueOnce(
      User.hydrate({ _id: ownerId, role: "student" }),
    );
    vi.mocked(Membership.findOne).mockResolvedValueOnce({
      classroomId,
      userId: ownerId,
    });
    const response = await get(classroomId, ownerId);
    expect(response.status).toBe(200);
    expect(response.body.data.challenges).toEqual([
      expect.objectContaining({
        id: String(challengeRows[1]._id),
        title: "Published practice",
      }),
    ]);
    expect(response.body.data.challenges[0]).not.toHaveProperty("status");
    expect(response.body.data).not.toHaveProperty("joinCode");
  });

  it("uses the safe 500 envelope when challenge loading fails", async () => {
    challengeLookup.mockRejectedValueOnce(new Error("PRIVATE_QUERY_FAILURE"));
    const response = await get(classroomId, ownerId);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(response.text).not.toContain("PRIVATE_QUERY_FAILURE");
  });
});

describe("GET /api/classrooms/:id: who may read it", () => {
  it("lets the owning professor read it without any membership row", async () => {
    const response = await get(classroomId, ownerId);
    expect(response.status).toBe(200);
  });

  it("lets a joined student read it", async () => {
    const response = await get(classroomId, memberId);
    expect(response.status).toBe(200);
  });

  it("refuses a student who has not joined any classroom", async () => {
    const response = await get(classroomId, newcomerId);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("refuses a student whose only membership is in a different classroom", async () => {
    // Bob has a membership, just not for this classroom.
    const response = await get(classroomId, outsiderId);
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain("IS216 G10");
  });

  it("refuses a professor who does not own it, and leaks nothing", async () => {
    const response = await get(classroomId, otherProfessorId);
    expect(response.status).toBe(403);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain("ABC234");
    expect(text).not.toContain("IS216 G10");
  });
});

describe("GET /api/classrooms/:id: the response", () => {
  it("gives the owner the full DTO with the join code and empty lists (A-4, A-5)", async () => {
    const response = await get(classroomId, ownerId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: String(classroomId),
        name: "IS216 G10",
        description: "Debugging practice",
        coverId: "coral-loop",
        professorId: String(ownerId),
        professorName: "Prof Tan",
        joinCode: "ABC234",
        challenges: [],
        miniProjects: [],
      },
    });
  });

  it("gives a joined student the same DTO without the join code (A-4)", async () => {
    const response = await get(classroomId, memberId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: String(classroomId),
        name: "IS216 G10",
        description: "Debugging practice",
        coverId: "coral-loop",
        professorId: String(ownerId),
        professorName: "Prof Tan",
        challenges: [],
        miniProjects: [],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("ABC234");
  });

  it("names the professor so students know who runs the classroom", async () => {
    const response = await get(classroomId, memberId);
    expect(response.body.data.professorName).toBe("Prof Tan");
  });

  it("still answers when the professor's account is gone", async () => {
    const lookUp = User.findById.getMockImplementation();
    User.findById.mockImplementation(async (id) =>
      sameId(id, ownerId) ? null : lookUp(id),
    );
    const response = await get(classroomId, memberId);
    expect(response.status).toBe(200);
    expect(response.body.data.professorName).toBe("Unknown professor");
  });

  it("hides a failed lookup behind a 500", async () => {
    classroomLookups.forEach((spy) =>
      spy.mockRejectedValue(new Error("private-db-detail")),
    );
    const response = await get(classroomId, ownerId);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
  });
});
