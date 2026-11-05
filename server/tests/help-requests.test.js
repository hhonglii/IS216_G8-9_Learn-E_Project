// Phase D HTTP tests.
// Covers the Phase D checkpoints in docs/CORE_BUILD_GUIDE.md section 10 and decisions
// D-2 to D-10, G-8 and D7d with a mocked database: an in-memory store answers the
// Mongoose calls the controllers make, and HelpRequest.create runs real validation.
// The store applies each conditional update in one step, so the concurrent cases
// show the handlers rely on conditional updates; they cannot prove Atlas atomicity.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import Attempt from "../src/models/Attempt.js";
import Challenge from "../src/models/Challenge.js";
import Classroom from "../src/models/Classroom.js";
import HelpRequest from "../src/models/HelpRequest.js";
import Membership from "../src/models/Membership.js";
import User from "../src/models/User.js";

// Fixture: prof owns the classroom. asker, mentor, mentor2 and unqualified are
// members; mentor and mentor2 have an approved attempt on the published challenge,
// unqualified only a pending one. outsider and otherProf belong to nothing.
const { ObjectId } = mongoose.Types;
const ids = Object.fromEntries(
  [
    "prof",
    "otherProf",
    "asker",
    "mentor",
    "mentor2",
    "unqualified",
    "outsider",
    "classroom",
    "challenge",
    "draft",
    "question1",
    "question2",
  ].map((key) => [key, new ObjectId()]),
);
const users = {
  [ids.prof]: { _id: ids.prof, role: "professor", displayName: "Prof Tan" },
  [ids.otherProf]: { _id: ids.otherProf, role: "professor", displayName: "Prof Lim" },
  [ids.asker]: { _id: ids.asker, role: "student", displayName: "Asha" },
  [ids.mentor]: { _id: ids.mentor, role: "student", displayName: "Ben" },
  [ids.mentor2]: { _id: ids.mentor2, role: "student", displayName: "Chen" },
  [ids.unqualified]: { _id: ids.unqualified, role: "student", displayName: "Dev" },
  [ids.outsider]: { _id: ids.outsider, role: "student", displayName: "Eli" },
};
const classrooms = {
  [ids.classroom]: { _id: ids.classroom, name: "WAD2", professorId: ids.prof },
};
const challenges = {
  [ids.challenge]: {
    _id: ids.challenge,
    classroomId: ids.classroom,
    title: "Loops",
    status: "published",
    codeSnippet: "for (let i = 1; i < 5; i++) {}",
    // Stored out of order: the queue numbers questions by their order field.
    questions: [
      { _id: ids.question2, order: 1, prompt: "Which line is wrong?", acceptedAnswer: "SECRET-KEY" },
      {
        _id: ids.question1,
        order: 0,
        type: "predict-output",
        prompt: "What does it print?",
        options: [
          { id: "a", label: "1 2 3 4" },
          { id: "b", label: "1 2 3 4 5" },
        ],
        explanation: "SECRET-EXPLANATION",
      },
    ],
  },
  [ids.draft]: { _id: ids.draft, classroomId: ids.classroom, title: "Draft", status: "draft" },
};
const attempts = [
  { challengeId: ids.challenge, studentId: ids.mentor, reviewStatus: "approved", completedAt: new Date() },
  { challengeId: ids.challenge, studentId: ids.mentor2, reviewStatus: "approved", completedAt: new Date() },
  { challengeId: ids.challenge, studentId: ids.unqualified, reviewStatus: "pending", completedAt: null },
];

const plain = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => a !== undefined && a !== null && String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, want]) => {
    const have = doc[key];
    if (want?.constructor === Object) {
      if ("$in" in want) return want.$in.some((value) => same(have, value));
      if ("$ne" in want) return want.$ne === null ? have != null : !same(have, want.$ne);
      throw new Error(`Unsupported filter on ${key}`);
    }
    if (want === null) return have == null;
    if (typeof want === "boolean") return have === want;
    return same(have, want);
  });
}
function applyUpdate(doc, update) {
  Object.assign(doc, update.$set);
  for (const key of Object.keys(update.$unset ?? {})) delete doc[key];
  for (const [key, step] of Object.entries(update.$inc ?? {})) doc[key] = (doc[key] ?? 0) + step;
}
// A thenable query: awaiting it gives the result, and chained calls are recorded.
function query(run) {
  const state = { populate: [], sort: null };
  const q = {
    select: () => q,
    lean: () => q,
    sort: (spec) => ((state.sort = spec), q),
    populate: (path) => (state.populate.push(path), q),
    then: (ok, fail) =>
      Promise.resolve()
        .then(() => run(state))
        .then(ok, fail),
  };
  return q;
}
function sorted(rows, spec) {
  if (!spec) return rows;
  const [[key, direction]] = Object.entries(spec);
  return [...rows].sort((a, b) => (a[key] > b[key] ? direction : a[key] < b[key] ? -direction : 0));
}

let requests, memberships;

beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[id] ?? null);
  vi.spyOn(Classroom, "findById").mockImplementation(async (id) => classrooms[id] ?? null);
  vi.spyOn(Challenge, "findById").mockImplementation((id) => query(() => challenges[id] ?? null));
  vi.spyOn(Attempt, "find").mockImplementation((filter) =>
    query(() => attempts.filter((row) => matches(row, filter))),
  );
  vi.spyOn(Attempt, "findOne").mockImplementation((filter) =>
    query(() => attempts.find((row) => matches(row, filter)) ?? null),
  );

  memberships = ["asker", "mentor", "mentor2", "unqualified"].map((key) => ({
    _id: new ObjectId(),
    classroomId: ids.classroom,
    userId: ids[key],
    contributionPoints: 0,
  }));
  vi.spyOn(Membership, "findOne").mockImplementation(
    async (filter) => memberships.find((row) => matches(row, filter)) ?? null,
  );
  vi.spyOn(Membership, "find").mockImplementation((filter) =>
    query((state) =>
      sorted(
        memberships.filter((row) => matches(row, filter)).map((row) => ({ ...row })),
        state.sort,
      ).map((row) =>
        state.populate.includes("userId") ? { ...row, userId: users[row.userId] ?? null } : row,
      ),
    ),
  );
  vi.spyOn(Membership, "findOneAndUpdate").mockImplementation(async (filter, update) => {
    const row = memberships.find((item) => matches(item, filter));
    if (!row) return null;
    applyUpdate(row, update);
    return { ...row };
  });

  requests = new Map();
  vi.spyOn(HelpRequest, "create").mockImplementation(async (fields) => {
    const doc = new HelpRequest(fields);
    await doc.validate();
    requests.set(String(doc._id), plain(doc.toObject()));
    return doc;
  });
  vi.spyOn(HelpRequest, "findById").mockImplementation((id) =>
    query(() => {
      const row = requests.get(String(id));
      return row ? HelpRequest.hydrate(structuredClone(row)) : null;
    }),
  );
  vi.spyOn(HelpRequest, "findOneAndUpdate").mockImplementation(async (filter, update) => {
    const row = [...requests.values()].find((item) => matches(item, filter));
    if (!row) return null;
    applyUpdate(row, update);
    requests.set(String(row._id), plain(row));
    return HelpRequest.hydrate(structuredClone(requests.get(String(row._id))));
  });
  vi.spyOn(HelpRequest, "updateOne").mockImplementation(async (filter, update) => {
    const row = [...requests.values()].find((item) => matches(item, filter));
    if (row) {
      applyUpdate(row, update);
      requests.set(String(row._id), plain(row));
    }
    return { matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 };
  });
  vi.spyOn(HelpRequest, "deleteOne").mockImplementation(async (filter) => {
    const row = [...requests.values()].find((item) => matches(item, filter));
    if (row) requests.delete(String(row._id));
    return { deletedCount: row ? 1 : 0 };
  });
  vi.spyOn(HelpRequest, "find").mockImplementation((filter) =>
    query((state) =>
      sorted(
        [...requests.values()].filter((row) => matches(row, filter)),
        state.sort,
      ).map((row) => ({
        ...row,
        challengeId:
          state.populate.includes("challengeId") && row.challengeId
            ? {
                _id: row.challengeId,
                title: challenges[row.challengeId]?.title,
                questions: challenges[row.challengeId]?.questions,
                codeSnippet: challenges[row.challengeId]?.codeSnippet,
              }
            : row.challengeId,
        requesterId: state.populate.includes("requesterId")
          ? { _id: row.requesterId, displayName: users[row.requesterId]?.displayName }
          : row.requesterId,
      })),
    ),
  );
});

afterEach(() => vi.restoreAllMocks());

function call(method, path, caller, body) {
  const pending = request(createApp())[method](path);
  return (caller ? pending.set(...sessionHeader(caller)) : pending).send(body);
}
// Question help: a question of the challenge and a hint type (H-14).
const validBody = (fields = {}) => ({
  contextType: "challenge",
  contextId: String(ids.challenge),
  questionId: String(ids.question2),
  hintType: "Guiding question",
  ...fields,
});
// General class help: a snippet, both behaviours and a hint type (H-14).
const generalBody = (fields = {}) => ({
  contextType: "classroom",
  contextId: String(ids.classroom),
  codeSnippet: "  for (let i = 1; i < 5; i++) {}  ",
  expectedBehaviour: "  Prints 1 to 5  ",
  actualBehaviour: "Prints 1 to 4",
  hintType: "Concept reminder",
  ...fields,
});
const create = (caller, body = validBody()) => call("post", "/api/help-requests", caller, body);
const list = (caller, id = ids.classroom) => call("get", `/api/classrooms/${id}/help-requests`, caller);
const claim = (caller, id) => call("put", `/api/help-requests/${id}/claim`, caller);
const respond = (caller, id, response) =>
  call("put", `/api/help-requests/${id}/respond`, caller, { response });
const resolve = (caller, id, resolution) =>
  call("put", `/api/help-requests/${id}/resolve`, caller, { resolution });
const withdraw = (caller, id) => call("delete", `/api/help-requests/${id}`, caller);
const unclaim = (caller, id) => call("put", `/api/help-requests/${id}/unclaim`, caller);
const leaderboard = (caller, id = ids.classroom) =>
  call("get", `/api/classrooms/${id}/leaderboard`, caller);

// Stores a HelpRequest directly, as if it had already reached that state. The
// default is a request from before H-14, with the old reasoning fields.
function seedRequest(fields = {}) {
  const doc = new HelpRequest({
    classroomId: ids.classroom,
    challengeId: ids.challenge,
    qualifyingChallengeId: ids.challenge,
    requesterId: ids.asker,
    expectedBehaviour: "Prints 1 to 5",
    actualBehaviour: "Prints 1 to 4",
    hintType: "Guiding question",
    ...fields,
  });
  requests.set(String(doc._id), plain(doc.toObject()));
  return String(doc._id);
}
const general = {
  kind: "general",
  challengeId: undefined,
  qualifyingChallengeId: undefined,
  codeSnippet: "let x = 1",
};
const responded = (fields = {}) =>
  seedRequest({ status: "responded", claimedBy: ids.mentor, mentorResponse: "Check the bound.", ...fields });
const stored = (id) => requests.get(String(id));
const pointsOf = (key) => memberships.find((row) => same(row.userId, ids[key])).contributionPoints;
const quietErrors = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("POST /api/help-requests: who may ask", () => {
  it("rejects a request with no selected user as 401", async () => {
    const response = await create(undefined);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a professor as 403", async () => {
    const response = await create(ids.prof);
    expect(response.status).toBe(403);
    expect(requests.size).toBe(0);
  });

  it("rejects a student who is not in the challenge's classroom as 403", async () => {
    const response = await create(ids.outsider);
    expect(response.status).toBe(403);
    expect(requests.size).toBe(0);
  });

  it("rejects general class help from a student outside the classroom as 403", async () => {
    const response = await create(ids.outsider, generalBody());
    expect(response.status).toBe(403);
    expect(requests.size).toBe(0);
  });
});

describe("POST /api/help-requests: context (H-14)", () => {
  it.each([
    ["a project group context", { contextType: "group" }, "contextType"],
    ["a missing context type", { contextType: undefined }, "contextType"],
    ["a malformed challenge id", { contextId: "not-an-id" }, "contextId"],
  ])("rejects %s as 400", async (_, fields, field) => {
    const response = await create(ids.asker, validBody(fields));
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe(field);
    expect(requests.size).toBe(0);
  });

  it.each([
    ["a draft challenge", () => ids.draft],
    ["a challenge that does not exist", () => new ObjectId()],
  ])("answers %s with 404", async (_, id) => {
    const response = await create(ids.asker, validBody({ contextId: String(id()) }));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CHALLENGE_NOT_FOUND");
    expect(requests.size).toBe(0);
  });

  it("rejects general class help with a malformed classroom id as 400", async () => {
    const response = await create(ids.asker, generalBody({ contextId: "nope" }));
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe("contextId");
  });

  it("answers general class help about a missing classroom with 404", async () => {
    const response = await create(ids.asker, generalBody({ contextId: String(new ObjectId()) }));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CLASSROOM_NOT_FOUND");
  });
});

describe("POST /api/help-requests: question help fields (H-14)", () => {
  it.each([
    ["questionId", { questionId: undefined }],
    ["questionId", { questionId: "nope" }],
    ["questionId", { questionId: String(new ObjectId()) }],
    ["hintType", { hintType: "The answer" }],
  ])("rejects a missing or invalid %s as 400 and names the field", async (field, fields) => {
    const response = await create(ids.asker, validBody(fields));
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([expect.objectContaining({ field })]);
    expect(requests.size).toBe(0);
  });

  it("needs no written fields and ignores any that are sent", async () => {
    const response = await create(
      ids.asker,
      validBody({ expectedBehaviour: "x", attemptedReasoning: "y", codeSnippet: "z" }),
    );
    expect(response.status).toBe(201);
    const row = stored(response.body.data.id);
    expect(row).not.toHaveProperty("expectedBehaviour");
    expect(row).not.toHaveProperty("attemptedReasoning");
    expect(row).not.toHaveProperty("codeSnippet");
  });
});

describe("POST /api/help-requests: general class help fields (H-14)", () => {
  it.each([
    ["codeSnippet", { codeSnippet: "   " }],
    ["expectedBehaviour", { expectedBehaviour: "" }],
    ["actualBehaviour", { actualBehaviour: undefined }],
    ["actualBehaviour", { actualBehaviour: "\n\t" }],
    ["hintType", { hintType: "" }],
  ])("rejects a missing or invalid %s as 400 and names the field", async (field, fields) => {
    const response = await create(ids.asker, generalBody(fields));
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([expect.objectContaining({ field })]);
    expect(requests.size).toBe(0);
  });

  it("names every failing field at once", async () => {
    const response = await create(
      ids.asker,
      generalBody({ codeSnippet: "", expectedBehaviour: "", actualBehaviour: "", hintType: "" }),
    );
    expect(response.body.error.details.map((item) => item.field)).toEqual([
      "codeSnippet",
      "expectedBehaviour",
      "actualBehaviour",
      "hintType",
    ]);
  });
});

describe("POST /api/help-requests: creating", () => {
  it("stores an open question request for the caller, never a requester from the body", async () => {
    const response = await create(ids.asker, { ...validBody(), requesterId: String(ids.mentor) });
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ id: expect.any(String), status: "open" });
    expect(stored(response.body.data.id)).toMatchObject({
      kind: "question",
      classroomId: String(ids.classroom),
      challengeId: String(ids.challenge),
      qualifyingChallengeId: String(ids.challenge),
      questionId: String(ids.question2),
      requesterId: String(ids.asker),
      hintType: "Guiding question",
      status: "open",
      helpful: null,
      pointsAwarded: false,
      reopenCount: 0,
    });
  });

  it("stores general class help against the classroom with trimmed text and no challenge", async () => {
    const response = await create(ids.asker, generalBody());
    expect(response.status).toBe(201);
    const row = stored(response.body.data.id);
    expect(row).toMatchObject({
      kind: "general",
      classroomId: String(ids.classroom),
      requesterId: String(ids.asker),
      codeSnippet: "for (let i = 1; i < 5; i++) {}",
      expectedBehaviour: "Prints 1 to 5",
      actualBehaviour: "Prints 1 to 4",
      hintType: "Concept reminder",
      status: "open",
    });
    expect(row).not.toHaveProperty("challengeId");
    expect(row).not.toHaveProperty("qualifyingChallengeId");
  });

  it("keeps the official answer out of the stored request and the response", async () => {
    const response = await create(ids.asker);
    const text = JSON.stringify([response.body, stored(response.body.data.id)]);
    expect(text).not.toContain("SECRET");
  });
});

describe("GET /api/classrooms/:id/help-requests: access", () => {
  it.each([
    ["no selected user", undefined, ids.classroom, 401],
    ["a malformed classroom id", ids.asker, "nope", 400],
    ["a classroom that does not exist", ids.asker, new ObjectId(), 404],
    ["a student outside the classroom", ids.outsider, ids.classroom, 403],
    ["a professor who does not own it", ids.otherProf, ids.classroom, 403],
  ])("rejects %s", async (_, caller, classroomId, status) => {
    const response = await list(caller, classroomId);
    expect(response.status).toBe(status);
  });

  it.each([["a member", "asker"], ["the owning professor", "prof"]])(
    "lets %s read the queue",
    async (_, caller) => {
      seedRequest();
      const response = await list(ids[caller]);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    },
  );
});

describe("GET /api/classrooms/:id/help-requests: the queue DTO", () => {
  it("lists newest first with display fields and string ids", async () => {
    const older = seedRequest({ createdAt: new Date("2026-10-01") });
    const newer = seedRequest({ createdAt: new Date("2026-10-02"), requesterId: ids.mentor2 });
    const response = await list(ids.asker);
    expect(response.body.data.map((item) => item.id)).toEqual([newer, older]);
    expect(response.body.data[1]).toMatchObject({
      id: older,
      status: "open",
      hintType: "Guiding question",
      challengeId: String(ids.challenge),
      challengeTitle: "Loops",
      requesterId: String(ids.asker),
      requesterName: "Asha",
      mentorId: null,
      helpful: null,
      reopenCount: 0,
    });
  });

  it("never includes the challenge's answer key or explanation", async () => {
    seedRequest();
    seedRequest({ kind: "question", questionId: ids.question2 });
    const response = await list(ids.prof);
    expect(JSON.stringify(response.body)).not.toContain("SECRET");
  });

  it("numbers question help by the question's order and shows its prompt", async () => {
    seedRequest({ questionId: ids.question2, expectedBehaviour: undefined, actualBehaviour: undefined });
    const [item] = (await list(ids.asker)).body.data;
    expect(item).toMatchObject({
      kind: "question",
      questionId: String(ids.question2),
      questionNumber: 2,
      questionPrompt: "Which line is wrong?",
    });
  });

  it("reads a request from before H-14 as question help with its old fields", async () => {
    seedRequest({ attemptedReasoning: "I traced the loop.", suspectedCause: "The bound." });
    const [item] = (await list(ids.asker)).body.data;
    expect(item).toMatchObject({
      kind: "question",
      questionId: null,
      questionNumber: null,
      expectedBehaviour: "Prints 1 to 5",
      attemptedReasoning: "I traced the loop.",
      suspectedCause: "The bound.",
    });
  });

  it("lists general class help with its snippet and no challenge", async () => {
    seedRequest({
      kind: "general",
      challengeId: undefined,
      qualifyingChallengeId: undefined,
      codeSnippet: "let x = 1",
    });
    const [item] = (await list(ids.asker)).body.data;
    expect(item).toMatchObject({
      kind: "general",
      challengeId: null,
      questionNumber: null,
      codeSnippet: "let x = 1",
      actualBehaviour: "Prints 1 to 4",
    });
  });
});

// UX audit item 17: the mentor sees the asker's last wrong answer, so the help
// form no longer asks for it.
describe("POST /api/help-requests: the asker's last answer", () => {
  function withAnswers(answers, run) {
    const row = { challengeId: ids.challenge, studentId: ids.asker, reviewStatus: "not-submitted", answers };
    attempts.push(row);
    return run().finally(() => attempts.splice(attempts.indexOf(row), 1));
  }
  const askAbout = () => create(ids.asker, validBody({ questionId: String(ids.question1) }));

  it("stores the label of a wrong last answer to that question", () =>
    withAnswers(
      [
        { questionId: String(ids.question1), value: "a", correct: false },
        { questionId: String(ids.question2), value: "x", correct: false },
        { questionId: String(ids.question1), value: "b", correct: false },
      ],
      async () => {
        const response = await askAbout();
        expect(response.status).toBe(201);
        expect(stored(response.body.data.id).askerAnswer).toBe("1 2 3 4 5");
      },
    ));

  it("stores nothing when the last answer was right", () =>
    withAnswers(
      [
        { questionId: String(ids.question1), value: "a", correct: false },
        { questionId: String(ids.question1), value: "b", correct: true },
      ],
      async () => {
        const response = await askAbout();
        expect(stored(response.body.data.id)).not.toHaveProperty("askerAnswer");
      },
    ));

  it("stores nothing when they haven't answered, and ignores a sent askerAnswer", async () => {
    const response = await create(
      ids.asker,
      validBody({ questionId: String(ids.question1), askerAnswer: "made up" }),
    );
    expect(response.status).toBe(201);
    expect(stored(response.body.data.id)).not.toHaveProperty("askerAnswer");
  });
});

describe("GET /api/classrooms/:id/help-requests: the code and the last answer (items 12, 17)", () => {
  it.each([
    ["the requester", "asker", true],
    ["a mentor who could claim it", "mentor2", true],
    ["the owning professor", "prof", true],
    ["a classmate still on the challenge", "unqualified", false],
  ])("shows the asker's answer to %s only if they may see it", async (_, caller, visible) => {
    seedRequest({ questionId: ids.question1, askerAnswer: "1 2 3 4 5" });
    const [item] = (await list(ids[caller])).body.data;
    if (visible) expect(item.askerAnswer).toBe("1 2 3 4 5");
    else expect(item).not.toHaveProperty("askerAnswer");
  });

  it("sends the challenge's code with question help but not with general help", async () => {
    seedRequest({ createdAt: new Date("2026-10-01") });
    seedRequest({ ...general, createdAt: new Date("2026-10-02") });
    const [generalItem, questionItem] = (await list(ids.mentor)).body.data;
    expect(questionItem.challengeCode).toBe("for (let i = 1; i < 5; i++) {}");
    expect(generalItem).not.toHaveProperty("challengeCode");
    expect(generalItem.codeSnippet).toBe("let x = 1");
  });
});

describe("GET /api/classrooms/:id/help-requests: who sees mentorResponse (D-6)", () => {
  it.each([
    ["the requester", "asker", true],
    ["the assigned mentor", "mentor", true],
    ["the owning professor", "prof", true],
    ["another member", "mentor2", false],
    ["an unqualified member", "unqualified", false],
  ])("%s", async (_, caller, visible) => {
    responded();
    const [item] = (await list(ids[caller])).body.data;
    if (visible) expect(item.mentorResponse).toBe("Check the bound.");
    else expect(item).not.toHaveProperty("mentorResponse");
  });
});

describe("GET /api/classrooms/:id/help-requests: canClaim", () => {
  it.each([
    ["a qualified member on an open request", "mentor", {}, true],
    ["the requester on their own request", "asker", {}, false],
    ["the requester even when qualified", "mentor", { requesterId: ids.mentor }, false],
    ["a member without an approved attempt", "unqualified", {}, false],
    ["the owning professor", "prof", {}, false],
    ["a qualified member on a claimed request", "mentor2", { status: "claimed", claimedBy: ids.mentor }, false],
  ])("is right for %s", async (_, caller, fields, expected) => {
    seedRequest(fields);
    const [item] = (await list(ids[caller])).body.data;
    expect(item.canClaim).toBe(expected);
  });

  it.each([
    ["any other member on open general help", "unqualified", {}, true],
    ["the requester on their own general help", "asker", {}, false],
    ["the owning professor", "prof", {}, false],
    ["any member once it is claimed", "unqualified", { status: "claimed", claimedBy: ids.mentor }, false],
  ])("is right for %s", async (_, caller, fields, expected) => {
    seedRequest({ ...general, ...fields });
    const [item] = (await list(ids[caller])).body.data;
    expect(item.canClaim).toBe(expected);
  });
});

describe("PUT /api/help-requests/:id/claim: who may claim", () => {
  it.each([
    ["no selected user", undefined, 401],
    ["a professor", "prof", 403],
    ["a student outside the classroom", "outsider", 403],
    ["the requester", "asker", 403],
  ])("rejects %s", async (_, caller, status) => {
    const id = seedRequest();
    const response = await claim(caller && ids[caller], id);
    expect(response.status).toBe(status);
    expect(stored(id).status).toBe("open");
  });

  it("rejects a member without an approved attempt and names the challenge", async () => {
    const id = seedRequest();
    const response = await claim(ids.unqualified, id);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("NOT_ELIGIBLE");
    expect(response.body.error.message).toContain('"Loops"');
    expect(stored(id).status).toBe("open");
  });

  it("answers a malformed id with 400 and a missing request with 404", async () => {
    expect((await claim(ids.mentor, "nope")).status).toBe(400);
    expect((await claim(ids.mentor, new ObjectId())).status).toBe(404);
  });

  it("lets any other member claim general class help, with no approved attempt (H-14)", async () => {
    const id = seedRequest(general);
    const response = await claim(ids.unqualified, id);
    expect(response.status).toBe(200);
    expect(stored(id)).toMatchObject({ status: "claimed", claimedBy: String(ids.unqualified) });
  });

  it("still keeps general class help from the requester and outsiders", async () => {
    const id = seedRequest(general);
    expect((await claim(ids.asker, id)).status).toBe(403);
    expect((await claim(ids.outsider, id)).status).toBe(403);
    expect(stored(id).status).toBe("open");
  });
});

describe("PUT /api/help-requests/:id/claim: claiming (D-4, D-7)", () => {
  it("claims an open request for a qualified mentor", async () => {
    const id = seedRequest();
    const response = await claim(ids.mentor, id);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id, status: "claimed", mentorId: String(ids.mentor) });
    expect(stored(id)).toMatchObject({ status: "claimed", claimedBy: String(ids.mentor) });
  });

  it("answers the winner's repeat with 200 and anyone else with 409 (D-7)", async () => {
    const id = seedRequest();
    await claim(ids.mentor, id);
    const repeat = await claim(ids.mentor, id);
    expect(repeat.status).toBe(200);
    expect(repeat.body.data.mentorId).toBe(String(ids.mentor));
    const rival = await claim(ids.mentor2, id);
    expect(rival.status).toBe(409);
    expect(rival.body.error.code).toBe("CLAIM_CONFLICT");
    expect(stored(id).claimedBy).toBe(String(ids.mentor));
  });

  it("gives two simultaneous claims exactly one winner", async () => {
    const id = seedRequest();
    const results = await Promise.all([claim(ids.mentor, id), claim(ids.mentor2, id)]);
    expect(results.map((item) => item.status).sort()).toEqual([200, 409]);
    const winner = results.find((item) => item.status === 200).body.data.mentorId;
    expect(stored(id).claimedBy).toBe(winner);
  });

  it("lets the same mentor reclaim a reopened request (D-4)", async () => {
    const id = seedRequest({ reopenCount: 1 });
    const response = await claim(ids.mentor, id);
    expect(response.status).toBe(200);
    expect(stored(id)).toMatchObject({ status: "claimed", claimedBy: String(ids.mentor), reopenCount: 1 });
  });

  it.each(["responded", "resolved"])("rejects a claim on a %s request as 409", async (status) => {
    const id = seedRequest({ status, claimedBy: ids.mentor2 });
    const response = await claim(ids.mentor, id);
    expect(response.status).toBe(409);
    expect(stored(id)).toMatchObject({ status, claimedBy: String(ids.mentor2) });
  });
});

describe("PUT /api/help-requests/:id/respond", () => {
  const claimed = () => seedRequest({ status: "claimed", claimedBy: ids.mentor });

  it.each([
    ["no selected user", undefined, 401],
    ["the requester", "asker", 403],
    ["a different mentor", "mentor2", 403],
  ])("rejects %s", async (_, caller, status) => {
    const id = claimed();
    const response = await respond(caller && ids[caller], id, "A hint");
    expect(response.status).toBe(status);
    expect(stored(id)).not.toHaveProperty("mentorResponse");
  });

  it("answers a malformed id with 400 and a missing request with 404", async () => {
    expect((await respond(ids.mentor, "nope", "A hint")).status).toBe(400);
    expect((await respond(ids.mentor, new ObjectId(), "A hint")).status).toBe(404);
  });

  it("saves the trimmed hint and moves the request to responded", async () => {
    const id = claimed();
    const response = await respond(ids.mentor, id, "  What is the last value of i?  ");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id,
      status: "responded",
      mentorResponse: "What is the last value of i?",
    });
    expect(stored(id)).toMatchObject({ status: "responded", mentorResponse: "What is the last value of i?" });
  });

  it("lets the mentor overwrite the hint while responded (D-8)", async () => {
    const id = responded();
    const response = await respond(ids.mentor, id, "A better hint");
    expect(response.status).toBe(200);
    expect(stored(id).mentorResponse).toBe("A better hint");
  });

  it("refuses to change the hint once resolved (D-8)", async () => {
    const id = responded({ status: "resolved", helpful: true, pointsAwarded: true });
    const response = await respond(ids.mentor, id, "Too late");
    expect(response.status).toBe(409);
    expect(stored(id).mentorResponse).toBe("Check the bound.");
  });

  it("accepts 1000 characters after trim and rejects 1001 (D-9)", async () => {
    const id = claimed();
    expect((await respond(ids.mentor, id, `  ${"a".repeat(1000)}  `)).status).toBe(200);
    const tooLong = await respond(ids.mentor, id, "b".repeat(1001));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details.field).toBe("response");
    expect(stored(id).mentorResponse).toBe("a".repeat(1000));
  });

  it.each([["empty", ""], ["blank", "   "], ["missing", undefined]])(
    "rejects an %s hint as 400",
    async (_, text) => {
      const id = claimed();
      const response = await respond(ids.mentor, id, text);
      expect(response.status).toBe(400);
      expect(stored(id).status).toBe("claimed");
    },
  );
});

describe("PUT /api/help-requests/:id/resolve: who and when", () => {
  it.each([
    ["no selected user", undefined, "helpful", 401],
    ["the mentor", "mentor", "helpful", 403],
    ["the owning professor", "prof", "unresolved", 403],
  ])("rejects %s", async (_, caller, resolution, status) => {
    const id = responded();
    const response = await resolve(caller && ids[caller], id, resolution);
    expect(response.status).toBe(status);
    expect(stored(id).status).toBe("responded");
  });

  it.each([["missing", undefined], ["unknown", "yes"]])(
    "rejects a %s resolution as 400",
    async (_, resolution) => {
      const response = await resolve(ids.asker, responded(), resolution);
      expect(response.status).toBe(400);
      expect(response.body.error.details.field).toBe("resolution");
    },
  );

  // G15 Step 1: a malformed id used to reach findById, throw and answer 500.
  it("answers a malformed id with 400 and a missing request with 404", async () => {
    const malformed = await resolve(ids.asker, "abc", "helpful");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_FAILED");
    expect(malformed.body.error.details.field).toBe("id");
    expect(HelpRequest.findById).not.toHaveBeenCalled();
    expect((await resolve(ids.asker, new ObjectId(), "helpful")).status).toBe(404);
  });

  it.each([
    ["open", {}],
    ["claimed", { status: "claimed", claimedBy: ids.mentor }],
  ])("rejects resolving a %s request as 409", async (_, fields) => {
    const id = seedRequest(fields);
    for (const resolution of ["helpful", "unresolved"]) {
      expect((await resolve(ids.asker, id, resolution)).status).toBe(409);
    }
    expect(Membership.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects unresolved after a helpful resolution as 409", async () => {
    const id = responded({ status: "resolved", helpful: true, pointsAwarded: true });
    expect((await resolve(ids.asker, id, "unresolved")).status).toBe(409);
    expect(stored(id).status).toBe("resolved");
  });
});

describe("PUT /api/help-requests/:id/resolve: unresolved (D-3, G-8)", () => {
  it("reopens the request, clears the mentor's fields and awards nothing", async () => {
    const id = responded({ reopenCount: 1 });
    const response = await resolve(ids.asker, id, "unresolved");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id, status: "open", helpful: null, reopenCount: 2 });
    const row = stored(id);
    expect(row).toMatchObject({ status: "open", helpful: null, pointsAwarded: false, reopenCount: 2 });
    expect(row).not.toHaveProperty("claimedBy");
    expect(row).not.toHaveProperty("mentorResponse");
    expect(Membership.findOneAndUpdate).not.toHaveBeenCalled();
    expect(pointsOf("mentor")).toBe(0);
  });

  it("puts the reopened request back in the queue without the old hint", async () => {
    const id = responded();
    await resolve(ids.asker, id, "unresolved");
    const [item] = (await list(ids.asker)).body.data;
    expect(item).toMatchObject({ id, status: "open", mentorId: null });
    expect(item.mentorResponse).toBeUndefined();
  });
});

describe("PUT /api/help-requests/:id/resolve: helpful (D-1, D-10)", () => {
  it("resolves the request and awards the mentor five points", async () => {
    const id = responded();
    const response = await resolve(ids.asker, id, "helpful");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id, status: "resolved", helpful: true });
    expect(stored(id)).toMatchObject({ status: "resolved", helpful: true, pointsAwarded: true });
    expect(pointsOf("mentor")).toBe(5);
    expect(pointsOf("asker")).toBe(0);
  });

  it("answers a repeat helpful with 200 and no second award (D-10)", async () => {
    const id = responded();
    await resolve(ids.asker, id, "helpful");
    const repeat = await resolve(ids.asker, id, "helpful");
    expect(repeat.status).toBe(200);
    expect(repeat.body.data).toEqual({ id, status: "resolved", helpful: true });
    expect(pointsOf("mentor")).toBe(5);
    expect(Membership.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("awards once when two helpful resolutions arrive together", async () => {
    const id = responded();
    const results = await Promise.all([
      resolve(ids.asker, id, "helpful"),
      resolve(ids.asker, id, "helpful"),
    ]);
    expect(results.map((item) => item.status)).toEqual([200, 200]);
    expect(pointsOf("mentor")).toBe(5);
    expect(Membership.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("rolls the request back if the points write fails, so a retry still awards once", async () => {
    quietErrors();
    const id = responded();
    Membership.findOneAndUpdate.mockRejectedValueOnce(new Error("write failed"));
    const failed = await resolve(ids.asker, id, "helpful");
    expect(failed.status).toBe(500);
    expect(stored(id)).toMatchObject({ status: "responded", helpful: null, pointsAwarded: false });
    expect(pointsOf("mentor")).toBe(0);

    const retry = await resolve(ids.asker, id, "helpful");
    expect(retry.status).toBe(200);
    expect(pointsOf("mentor")).toBe(5);
  });

  it("rolls back when the mentor has no membership to credit", async () => {
    quietErrors();
    const id = responded({ claimedBy: ids.outsider });
    const response = await resolve(ids.asker, id, "helpful");
    expect(response.status).toBe(500);
    expect(stored(id)).toMatchObject({ status: "responded", pointsAwarded: false });
  });
});

describe("DELETE /api/help-requests/:id: withdrawing (UX audit A2)", () => {
  it.each([
    ["no selected user", undefined, 401],
    ["another student", "mentor", 403],
    ["the owning professor", "prof", 403],
  ])("rejects %s and keeps the request", async (_, caller, status) => {
    const id = seedRequest();
    expect((await withdraw(caller && ids[caller], id)).status).toBe(status);
    expect(stored(id)).toBeDefined();
  });

  it("answers a malformed id with 400 and a missing request with 404", async () => {
    expect((await withdraw(ids.asker, "nope")).status).toBe(400);
    expect((await withdraw(ids.asker, new ObjectId())).status).toBe(404);
  });

  it("removes the asker's open request from the queue", async () => {
    const id = seedRequest({ reopenCount: 1 });
    const response = await withdraw(ids.asker, id);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id, withdrawn: true });
    expect(stored(id)).toBeUndefined();
    expect((await list(ids.asker)).body.data).toEqual([]);
  });

  it.each([
    ["claimed", { status: "claimed", claimedBy: ids.mentor }],
    ["responded", { status: "responded", claimedBy: ids.mentor, mentorResponse: "Hint" }],
    ["resolved", { status: "resolved", claimedBy: ids.mentor, helpful: true, pointsAwarded: true }],
  ])("refuses once the request is %s, as 409", async (status, fields) => {
    const id = seedRequest(fields);
    const response = await withdraw(ids.asker, id);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_STATE");
    expect(stored(id).status).toBe(status);
  });

  it("lets a claim that lands first win over a withdraw", async () => {
    const id = seedRequest();
    await claim(ids.mentor, id);
    expect((await withdraw(ids.asker, id)).status).toBe(409);
    expect(stored(id)).toMatchObject({ status: "claimed", claimedBy: String(ids.mentor) });
  });
});

describe("PUT /api/help-requests/:id/unclaim (UX audit A3)", () => {
  const claimed = (fields = {}) => seedRequest({ status: "claimed", claimedBy: ids.mentor, ...fields });

  it.each([
    ["no selected user", undefined, 401],
    ["the requester", "asker", 403],
    ["a different mentor", "mentor2", 403],
  ])("rejects %s and keeps the claim", async (_, caller, status) => {
    const id = claimed();
    expect((await unclaim(caller && ids[caller], id)).status).toBe(status);
    expect(stored(id)).toMatchObject({ status: "claimed", claimedBy: String(ids.mentor) });
  });

  it("answers a malformed id with 400 and a missing request with 404", async () => {
    expect((await unclaim(ids.mentor, "nope")).status).toBe(400);
    expect((await unclaim(ids.mentor, new ObjectId())).status).toBe(404);
  });

  it("puts the request back in the queue for anyone to claim, without counting a reopen", async () => {
    const id = claimed({ reopenCount: 1 });
    const response = await unclaim(ids.mentor, id);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id, status: "open", mentorId: null });
    const row = stored(id);
    expect(row).toMatchObject({ status: "open", reopenCount: 1 });
    expect(row).not.toHaveProperty("claimedBy");
    expect((await claim(ids.mentor2, id)).status).toBe(200);
  });

  it.each([
    ["responded", { status: "responded", mentorResponse: "Hint" }],
    ["resolved", { status: "resolved", mentorResponse: "Hint", helpful: true, pointsAwarded: true }],
  ])("refuses once the request is %s, as 409", async (status, fields) => {
    const id = claimed(fields);
    const response = await unclaim(ids.mentor, id);
    expect(response.status).toBe(409);
    expect(stored(id)).toMatchObject({ status, claimedBy: String(ids.mentor) });
  });
});

describe("GET /api/classrooms/:id/leaderboard (D7d)", () => {
  it.each([
    ["no selected user", undefined, ids.classroom, 401],
    ["a malformed classroom id", ids.asker, "nope", 400],
    ["a classroom that does not exist", ids.asker, new ObjectId(), 404],
    ["a student outside the classroom", ids.outsider, ids.classroom, 403],
    ["a professor who does not own it", ids.otherProf, ids.classroom, 403],
  ])("rejects %s", async (_, caller, classroomId, status) => {
    expect((await leaderboard(caller, classroomId)).status).toBe(status);
  });

  it.each([["a member", "asker"], ["the owning professor", "prof"]])(
    "gives %s stored totals, highest first, as exactly three fields",
    async (_, caller) => {
      memberships[1].contributionPoints = 5;
      memberships[2].contributionPoints = 15;
      const response = await leaderboard(ids[caller]);
      expect(response.status).toBe(200);
      expect(response.body.data.slice(0, 2)).toEqual([
        { userId: String(ids.mentor2), displayName: "Chen", contributionPoints: 15 },
        { userId: String(ids.mentor), displayName: "Ben", contributionPoints: 5 },
      ]);
      expect(response.body.data).toHaveLength(4);
      for (const entry of response.body.data) {
        expect(Object.keys(entry).sort()).toEqual(["contributionPoints", "displayName", "userId"]);
      }
    },
  );

  it("reflects a helpful award", async () => {
    await resolve(ids.asker, responded(), "helpful");
    const [top] = (await leaderboard(ids.asker)).body.data;
    expect(top).toEqual({ userId: String(ids.mentor), displayName: "Ben", contributionPoints: 5 });
  });

  // G4 (decision G-6): equal points go by display name A to Z ignoring case, then user id.
  describe("tie order (G4)", () => {
    const [samLow, samHigh] = [new ObjectId(), new ObjectId()].sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
    const extra = {
      zed: { _id: new ObjectId(), role: "student", displayName: "Zed" },
      bob: { _id: new ObjectId(), role: "student", displayName: "Bob" },
      alice: { _id: new ObjectId(), role: "student", displayName: "alice" },
      samHigh: { _id: samHigh, role: "student", displayName: "Sam" },
      samLow: { _id: samLow, role: "student", displayName: "sam" },
    };
    // Two deleted users tie on name and points, so the id rule meets a null userId.
    const deletedUserIds = [new ObjectId(), new ObjectId()];
    const points = { zed: 12, bob: 10, alice: 10, samHigh: 10, samLow: 10 };

    beforeEach(() => {
      for (const [key, user] of Object.entries(extra)) {
        users[user._id] = user;
        memberships.push({
          _id: new ObjectId(),
          classroomId: ids.classroom,
          userId: user._id,
          contributionPoints: points[key],
        });
      }
      for (const userId of deletedUserIds) {
        memberships.push({
          _id: new ObjectId(),
          classroomId: ids.classroom,
          userId,
          contributionPoints: 10,
        });
      }
    });
    afterEach(() => {
      for (const user of Object.values(extra)) delete users[user._id];
    });

    const order = (response) =>
      response.body.data.map((entry) => [entry.displayName, entry.contributionPoints, entry.userId]);
    const expected = [
      ["Zed", 12, String(extra.zed._id)],
      ["alice", 10, String(extra.alice._id)],
      ["Bob", 10, String(extra.bob._id)],
      ["sam", 10, String(samLow)],
      ["Sam", 10, String(samHigh)],
      ["Unknown student", 10, null],
      ["Unknown student", 10, null],
      ["Asha", 0, String(ids.asker)],
      ["Ben", 0, String(ids.mentor)],
      ["Chen", 0, String(ids.mentor2)],
      ["Dev", 0, String(ids.unqualified)],
    ];

    it("orders equal points by name ignoring case, then by user id, with deleted users by their placeholder name", async () => {
      const response = await leaderboard(ids.asker);
      expect(response.status).toBe(200);
      expect(order(response)).toEqual(expected);
    });

    it("gives the same order whatever order the database returns the rows in", async () => {
      const first = order(await leaderboard(ids.prof));
      memberships.reverse();
      const second = order(await leaderboard(ids.prof));
      expect(first).toEqual(expected);
      expect(second).toEqual(expected);
    });
  });
});
