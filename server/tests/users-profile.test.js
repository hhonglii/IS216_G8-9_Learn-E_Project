// Test cases for the Phase A part of getProfile (A7d Step 0, decision A-3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";
import HelpRequest from "../src/models/HelpRequest.js";
import Attempt from "../src/models/Attempt.js";
import Challenge from "../src/models/Challenge.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";

// No live database. A small in-memory store answers find, findOne and findById
// the way MongoDB would for plain equality, $in, $ne, $or and $and filters, and
// an equality filter on an array field (memberIds) matches when the array holds
// the value. A field the stored documents do not have (such as "id" instead of
// "_id") matches nothing, exactly as in Atlas. Chained .lean(), .select(),
// .sort() on one field and .populate("classroomId") are supported, so the
// handler may use any of them.
//
// Fixture: profA owns c1 and c2, profB owns c3. Alice is in c1 and c3, Bob is
// in c2, Cara is in nothing. The challenges, attempts, mini-projects and groups
// for the Phase G fields (G6) are listed further down; G13 adds nextMilestone.
const { ObjectId } = mongoose.Types;
const ids = Object.fromEntries(
  ["profA", "profB", "alice", "bob", "cara", "c1", "c2", "c3"].map((k) => [
    k,
    new ObjectId(),
  ]),
);
const rawUsers = [
  { _id: ids.profA, displayName: "Prof Tan", role: "professor" },
  { _id: ids.profB, displayName: "Prof Lim", role: "professor" },
  { _id: ids.alice, displayName: "Alice", role: "student" },
  { _id: ids.bob, displayName: "Bob", role: "student" },
  { _id: ids.cara, displayName: "Cara", role: "student" },
];
const rawClassrooms = [
  { _id: ids.c1, name: "C1", description: "one", joinCode: "AAA111", professorId: ids.profA, coverId: "amber-nodes" },
  { _id: ids.c2, name: "C2", description: "two", joinCode: "BBB222", professorId: ids.profA },
  { _id: ids.c3, name: "C3", description: "three", joinCode: "CCC333", professorId: ids.profB },
];
const rawMemberships = [
  { _id: new ObjectId(), classroomId: ids.c1, userId: ids.alice },
  { _id: new ObjectId(), classroomId: ids.c3, userId: ids.alice },
  { _id: new ObjectId(), classroomId: ids.c2, userId: ids.bob },
];
const classroomDto = (key) => {
  const c = rawClassrooms.find((x) => String(x._id) === String(ids[key]));
  return {
    id: String(c._id),
    name: c.name,
    description: c.description,
    coverId: c.coverId ?? "default",
    contributionPoints: 0,
  };
};

const same = (a, b) => a !== undefined && a !== null && String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, want]) => {
    if (key === "$or") return want.some((f) => matches(doc, f));
    if (key === "$and") return want.every((f) => matches(doc, f));
    if (want && typeof want === "object" && Array.isArray(want.$in))
      return want.$in.some((v) => same(doc[key], v));
    if (want && typeof want === "object" && "$ne" in want)
      return want.$ne === null ? doc[key] != null : !same(doc[key], want.$ne);
    if (Array.isArray(doc[key])) return doc[key].some((v) => same(v, want));
    return same(doc[key], want);
  });
}
// A thenable query: awaiting it gives the result, and common chain methods
// return the same query so the handler's style does not matter.
function query(run) {
  let populateClassroom = false;
  let sortSpec = null;
  const q = {
    lean: () => q,
    select: () => q,
    sort: (spec) => ((sortSpec = spec), q),
    exec: () => q.then((x) => x),
    populate: (path) => {
      populateClassroom ||= path === "classroomId" || path?.path === "classroomId";
      return q;
    },
    then: (ok, fail) =>
      Promise.resolve()
        .then(() => run(populateClassroom))
        .then((result) => (Array.isArray(result) && sortSpec ? sortBy(result, sortSpec) : result))
        .then(ok, fail),
  };
  return q;
}
function sortBy(rows, spec) {
  const [[key, direction]] = Object.entries(spec);
  return [...rows].sort((a, b) => (a[key] > b[key] ? direction : a[key] < b[key] ? -direction : 0));
}
function mockModel(Model, rows, populate) {
  const docs = (populate) =>
    rows.map((raw) => {
      const fields = populate ? populate(raw) : raw;
      return Model.hydrate(fields);
    });
  return {
    find: vi
      .spyOn(Model, "find")
      .mockImplementation((filter) =>
        query((pop) => docs(pop && populate).filter((d, i) => matches(rows[i], filter))),
      ),
    findOne: vi
      .spyOn(Model, "findOne")
      .mockImplementation((filter) =>
        query((pop) => docs(pop && populate).find((d, i) => matches(rows[i], filter)) ?? null),
      ),
    findById: vi
      .spyOn(Model, "findById")
      .mockImplementation((id) =>
        query((pop) => docs(pop && populate).find((d, i) => same(rows[i]._id, id)) ?? null),
      ),
  };
}

function get(targetId, callerId) {
  const req = request(createApp()).get(`/api/users/${targetId}/profile`);
  return callerId ? req.set(...sessionHeader(callerId)) : req;
}
const sortById = (list) => [...list].sort((a, b) => a.id.localeCompare(b.id));
const classroomsOf = (response) => sortById(response.body.data.classrooms);
const expected = (...keys) => sortById(keys.map(classroomDto));

// G6 fixture. Alice completed ch1 (c1) and ch3 (c3); her ch2 attempt is approved
// with no completedAt and her ch5 attempt is pending, so neither counts. Bob
// completed ch4 (c2). Alice is in Team Rocket (mp1, c1) and Team Solo (mp3, c3);
// Bob is in Team Bob (mp2, c2).
const g6 = Object.fromEntries(
  ["ch1", "ch2", "ch3", "ch4", "ch5", "mp1", "mp2", "mp3", "g1", "g2", "g3"].map((k) => [
    k,
    new ObjectId(),
  ]),
);
const rawChallenges = [
  { _id: g6.ch1, classroomId: ids.c1, title: "Loops" },
  { _id: g6.ch2, classroomId: ids.c1, title: "Arrays" },
  { _id: g6.ch3, classroomId: ids.c3, title: "Classes" },
  { _id: g6.ch4, classroomId: ids.c2, title: "Recursion" },
  { _id: g6.ch5, classroomId: ids.c3, title: "Interfaces" },
];
const completedOn = (day) => new Date(`2026-10-${day}T08:00:00.000Z`);
const rawAttempts = [
  { _id: new ObjectId(), challengeId: g6.ch1, studentId: ids.alice, reviewStatus: "approved", completedAt: completedOn(20) },
  { _id: new ObjectId(), challengeId: g6.ch3, studentId: ids.alice, reviewStatus: "approved", completedAt: completedOn(22) },
  { _id: new ObjectId(), challengeId: g6.ch2, studentId: ids.alice, reviewStatus: "approved", completedAt: null },
  { _id: new ObjectId(), challengeId: g6.ch5, studentId: ids.alice, reviewStatus: "pending", completedAt: null },
  { _id: new ObjectId(), challengeId: g6.ch4, studentId: ids.bob, reviewStatus: "approved", completedAt: completedOn(21) },
];
const rawMiniProjects = [
  { _id: g6.mp1, classroomId: ids.c1, title: "Repair the counter app" },
  { _id: g6.mp2, classroomId: ids.c2, title: "Fix the cart" },
  { _id: g6.mp3, classroomId: ids.c3, title: "Shapes" },
];
const rawGroups = [
  { _id: g6.g1, miniProjectId: g6.mp1, name: "Team Rocket", memberIds: [ids.alice], submissionStatus: "submitted" },
  { _id: g6.g2, miniProjectId: g6.mp2, name: "Team Bob", memberIds: [ids.bob], submissionStatus: "approved" },
  { _id: g6.g3, miniProjectId: g6.mp3, name: "Team Solo", memberIds: [ids.alice], submissionStatus: "draft" },
];

let models;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(HelpRequest, "countDocuments").mockResolvedValue(0);
  models = {
    user: mockModel(User, rawUsers),
    classroom: mockModel(Classroom, rawClassrooms),
    membership: mockModel(Membership, rawMemberships, (raw) => ({
      ...raw,
      classroomId: rawClassrooms.find((c) => same(c._id, raw.classroomId)),
    })),
    challenge: mockModel(Challenge, rawChallenges),
    attempt: mockModel(Attempt, rawAttempts),
    miniProject: mockModel(MiniProject, rawMiniProjects),
    projectGroup: mockModel(ProjectGroup, rawGroups),
  };
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/users/:id/profile: identity and id shape", () => {
  it("rejects a request with no selected user as 401", async () => {
    const response = await get(ids.alice);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each([
    ["too short", "abc"],
    ["23 characters", "a".repeat(23)],
    ["not hex", "z".repeat(24)],
  ])("rejects a target id that is %s as 400, not a 500", async (_, id) => {
    const response = await get(id, ids.alice);
    expect(response.status).toBe(400);
    expect(typeof response.body.error.code).toBe("string");
  });

  it("answers a well-formed id that matches no user with 404", async () => {
    const response = await get(new ObjectId(), ids.alice);
    expect(response.status).toBe(404);
    expect(typeof response.body.error.code).toBe("string");
  });

  it("describes the user in the URL, not the caller", async () => {
    const response = await get(ids.alice, ids.bob);
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(String(ids.alice));
    expect(response.body.data.displayName).toBe("Alice");
    expect(response.body.data.role).toBe("student");
  });
});

describe("GET /api/users/:id/profile: your own profile (what the dashboard asks for)", () => {
  it("gives a student the agreed DTO with every classroom they joined", async () => {
    const response = await get(ids.alice, ids.alice);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data).sort()).toEqual(
      [
        "classrooms",
        "completedChallenges",
        "displayName",
        "helpfulCount",
        "id",
        "milestones",
        "nextMilestone",
        "projects",
        "role",
        "username",
      ],
    );
    expect(classroomsOf(response)).toEqual(expected("c1", "c3"));
  });

  it("gives a professor every classroom they own", async () => {
    const response = await get(ids.profA, ids.profA);
    expect(response.status).toBe(200);
    expect(classroomsOf(response)).toEqual(expected("c1", "c2"));
  });

  it("answers a user with no classrooms with an empty list, not an error", async () => {
    const response = await get(ids.cara, ids.cara);
    expect(response.status).toBe(200);
    expect(response.body.data.classrooms).toEqual([]);
  });

  it("lists classrooms as id, name and description only, never the join code or owner", async () => {
    const response = await get(ids.profA, ids.profA);
    const text = JSON.stringify(response.body);
    for (const code of ["AAA111", "BBB222", "CCC333"]) expect(text).not.toContain(code);
    expect(text).not.toContain("professorId");
    expect(text).not.toContain("__v");
  });
});

describe("GET /api/users/:id/profile: someone else's profile shows shared classrooms only", () => {
  it.each([
    ["a student who shares nothing", "bob", "alice", []],
    ["the professor who owns one of them", "profA", "alice", ["c1"]],
    ["the other professor, who owns the other", "profB", "alice", ["c3"]],
    ["a student viewing a professor they are taught by", "alice", "profA", ["c1"]],
    ["a different student of that professor", "bob", "profA", ["c2"]],
    ["another professor viewing a professor", "profB", "profA", []],
  ])("%s", async (_, caller, target, keys) => {
    const response = await get(ids[target], ids[caller]);
    expect(response.status).toBe(200);
    expect(classroomsOf(response)).toEqual(expected(...keys));
  });
});

describe("GET /api/users/:id/profile: failures", () => {
  it("hides a failed classroom lookup behind a 500", async () => {
    for (const spy of Object.values(models.classroom))
      spy.mockImplementation(() => query(() => {
        throw new Error("private-db-detail");
      }));
    for (const spy of Object.values(models.membership))
      spy.mockImplementation(() => query(() => {
        throw new Error("private-db-detail");
      }));
    const response = await get(ids.alice, ids.alice);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
  });
});

// Phase D cases:
// D7c Step 3 adds helpfulCount, milestones and per-classroom contributionPoints.
describe("GET /api/users/:id/profile: Phase D fields", () => {
  it.each([
    [0, []],
    [1, ["First Assist"]],
    [4, ["First Assist"]],
    [5, ["First Assist", "Helpful Five"]],
    [10, ["First Assist", "Helpful Five", "Challenge Guide"]],
  ])("turns %s helpful resolutions into the milestone labels", async (count, milestones) => {
    HelpRequest.countDocuments.mockResolvedValue(count);
    const response = await get(ids.alice, ids.bob);
    expect(response.body.data).toMatchObject({ helpfulCount: count, milestones });
    const [filter] = HelpRequest.countDocuments.mock.calls[0];
    expect(filter).toMatchObject({ status: "resolved", helpful: true });
    expect(String(filter.claimedBy)).toBe(String(ids.alice));
  });

  it("gives a professor no helpful count without counting", async () => {
    const response = await get(ids.profA, ids.profA);
    expect(response.body.data).toMatchObject({ helpfulCount: 0, milestones: [] });
    expect(HelpRequest.countDocuments).not.toHaveBeenCalled();
  });

  it("shows the stored points for each visible classroom only", async () => {
    rawMemberships[0].contributionPoints = 7;
    rawMemberships[1].contributionPoints = 3;
    try {
      const own = await get(ids.alice, ids.alice);
      expect(classroomsOf(own).map((c) => c.contributionPoints)).toEqual(
        sortById([
          { id: String(ids.c1), points: 7 },
          { id: String(ids.c3), points: 3 },
        ]).map((c) => c.points),
      );
      const viewedByProfA = await get(ids.alice, ids.profA);
      expect(classroomsOf(viewedByProfA)).toEqual([{ ...classroomDto("c1"), contributionPoints: 7 }]);
    } finally {
      delete rawMemberships[0].contributionPoints;
      delete rawMemberships[1].contributionPoints;
    }
  });
});

// Phase G cases:
// G6 adds completedChallenges and projects, both limited to the classrooms the
// caller may see (the same list as classrooms).
describe("GET /api/users/:id/profile: Phase G fields (G6)", () => {
  const challenge = (key, title, day) => ({
    challengeId: String(g6[key]),
    title,
    completedAt: completedOn(day).toISOString(),
  });
  const project = (group, name, miniProject, title, submissionStatus) => ({
    groupId: String(g6[group]),
    groupName: name,
    miniProjectId: String(g6[miniProject]),
    miniProjectTitle: title,
    submissionStatus,
  });
  const byGroupId = (list) => [...list].sort((a, b) => a.groupId.localeCompare(b.groupId));
  const rocket = project("g1", "Team Rocket", "mp1", "Repair the counter app", "submitted");
  const solo = project("g3", "Team Solo", "mp3", "Shapes", "draft");

  it("lists your own completions newest first, leaving out pending and approved-without-completedAt attempts", async () => {
    const response = await get(ids.alice, ids.alice);
    expect(response.status).toBe(200);
    expect(response.body.data.completedChallenges).toEqual([
      challenge("ch3", "Classes", 22),
      challenge("ch1", "Loops", 20),
    ]);
    expect(byGroupId(response.body.data.projects)).toEqual(byGroupId([rocket, solo]));
  });

  it.each([
    ["the professor who owns c1", "profA", [challenge("ch1", "Loops", 20)], [rocket]],
    ["the professor who owns c3", "profB", [challenge("ch3", "Classes", 22)], [solo]],
    ["a student who shares no classroom", "bob", [], []],
    ["a student in no classroom", "cara", [], []],
  ])("shows %s only what is in the classrooms they share", async (_, caller, completed, groups) => {
    const response = await get(ids.alice, ids[caller]);
    expect(response.status).toBe(200);
    expect(response.body.data.completedChallenges).toEqual(completed);
    expect(response.body.data.projects).toEqual(groups);
  });

  it("describes the student in the URL, not the caller", async () => {
    const response = await get(ids.bob, ids.profA);
    expect(response.body.data.completedChallenges).toEqual([challenge("ch4", "Recursion", 21)]);
    expect(response.body.data.projects).toEqual([
      project("g2", "Team Bob", "mp2", "Fix the cart", "approved"),
    ]);
    const [attemptFilter] = Attempt.find.mock.calls[0];
    expect(String(attemptFilter.studentId)).toBe(String(ids.bob));
    const [groupFilter] = ProjectGroup.find.mock.calls[0];
    expect(String(groupFilter.memberIds)).toBe(String(ids.bob));
  });

  it("gives a professor two empty lists without querying", async () => {
    for (const caller of ["profA", "alice"]) {
      const response = await get(ids.profA, ids[caller]);
      expect(response.body.data).toMatchObject({ completedChallenges: [], projects: [] });
    }
    expect(Challenge.find).not.toHaveBeenCalled();
    expect(Attempt.find).not.toHaveBeenCalled();
    expect(ProjectGroup.find).not.toHaveBeenCalled();
    expect(MiniProject.find).not.toHaveBeenCalled();
  });

  it("sends empty lists, not an error, to a student with no classrooms", async () => {
    const response = await get(ids.cara, ids.cara);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ completedChallenges: [], projects: [] });
  });
});

// Phase G cases:
// G13 adds nextMilestone, worked out from the same helpfulCount as milestones.
describe("GET /api/users/:id/profile: next milestone (G13)", () => {
  it.each([
    [0, { label: "First Assist", threshold: 1 }],
    [1, { label: "Helpful Five", threshold: 5 }],
    [4, { label: "Helpful Five", threshold: 5 }],
    [9, { label: "Challenge Guide", threshold: 10 }],
    [10, null],
    [11, null],
  ])("gives %s helpful resolutions the next milestone %j", async (count, nextMilestone) => {
    HelpRequest.countDocuments.mockResolvedValue(count);
    const response = await get(ids.alice, ids.bob);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("nextMilestone", nextMilestone);
    expect(response.body.data.helpfulCount).toBe(count);
  });

  it("gives a professor the first milestone, since their count is always 0", async () => {
    const response = await get(ids.profA, ids.profA);
    expect(response.body.data.nextMilestone).toEqual({ label: "First Assist", threshold: 1 });
  });
});
