// Mini-project drafts (H-8): PUT /api/mini-projects/:id edits a draft and
// POST /api/mini-projects/:id/publish makes it live. Mocked models, no database,
// the same approach as mini-projects-create.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Challenge from "../src/models/Challenge.js";
import MiniProject from "../src/models/MiniProject.js";

const ownerId = new mongoose.Types.ObjectId();
const otherProfessorId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const classroomId = new mongoose.Types.ObjectId();
const challengeId = new mongoose.Types.ObjectId();
const miniProjectId = new mongoose.Types.ObjectId();
const users = {
  [String(ownerId)]: { _id: ownerId, displayName: "Prof Tan", role: "professor" },
  [String(otherProfessorId)]: { _id: otherProfessorId, displayName: "Prof Lim", role: "professor" },
  [String(studentId)]: { _id: studentId, displayName: "Alice", role: "student" },
};
const complete = () => ({
  title: "Repair the counter app",
  brief: "Find and fix the counter bug.",
  rubric: "Working fix, a test and a short reflection.",
  stageInstructions: {
    Diagnose: "Say what is wrong.",
    Repair: "Fix it.",
    Extend: "Add a reset button.",
    Verify: "Write a test.",
    Reflect: "What would you do differently?",
  },
  acceptanceCriteria: ["Counter starts at zero"],
  maxGroupSize: 3,
});

let stored;
let findChallenge;
let saves;
function storeBrief(fields) {
  stored = MiniProject.hydrate({
    _id: miniProjectId,
    classroomId,
    createdBy: ownerId,
    maxGroupSize: 2,
    acceptanceCriteria: [],
    status: "draft",
    ...fields,
  });
}

beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  vi.spyOn(Classroom, "findById").mockResolvedValue({ _id: classroomId, professorId: ownerId });
  vi.spyOn(MiniProject, "findById").mockImplementation(async (id) =>
    String(id) === String(miniProjectId) ? stored : null,
  );
  findChallenge = vi.spyOn(Challenge, "findOne").mockResolvedValue({ _id: challengeId });
  saves = 0;
  vi.spyOn(MiniProject.prototype, "save").mockImplementation(async function save() {
    await this.validate();
    saves += 1;
    return this;
  });
  storeBrief({ title: "Counter app" });
});
afterEach(() => vi.restoreAllMocks());

function call(method, path, callerId, body) {
  const req = request(createApp())[method](`/api/mini-projects/${path}`);
  if (callerId) req.set(...sessionHeader(callerId));
  return body === undefined ? req : req.send(body);
}
const edit = (callerId, body, id = String(miniProjectId)) => call("put", id, callerId, body);
const publish = (callerId, id = String(miniProjectId)) =>
  call("post", `${id}/publish`, callerId);
const fields = (response) => response.body.error.details.map((detail) => detail.field);

describe("PUT /api/mini-projects/:id: editing a draft", () => {
  it("saves the fields sent and keeps the rest", async () => {
    storeBrief({ title: "Counter app", rubric: "A working fix." });
    const response = await edit(ownerId, { title: " Counter app v2 ", brief: "Fix the bug." });
    expect(response.status).toBe(200);
    expect(saves).toBe(1);
    expect(response.body.data).toMatchObject({
      id: String(miniProjectId),
      title: "Counter app v2",
      brief: "Fix the bug.",
      rubric: "A working fix.",
      status: "draft",
    });
  });

  it("clears a starter URL and qualifying challenge sent blank", async () => {
    storeBrief({
      title: "Counter app",
      starterRepoUrl: "https://github.com/octo/demo",
      qualifyingChallengeId: challengeId,
    });
    const response = await edit(ownerId, {
      title: "Counter app",
      starterRepoUrl: "",
      qualifyingChallengeId: "",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.starterRepoUrl).toBeUndefined();
    expect(response.body.data).not.toHaveProperty("qualifyingChallengeId");
  });

  it("ignores status sent in the body, so editing never publishes", async () => {
    const response = await edit(ownerId, { title: "Counter app", status: "published" });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("draft");
  });

  it("refuses to edit a published brief with 409", async () => {
    storeBrief({ ...complete(), status: "published" });
    const response = await edit(ownerId, { title: "Changed" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("MINIPROJECT_PUBLISHED");
    expect(saves).toBe(0);
  });

  it("refuses a blank title and a qualifying challenge from elsewhere with 400", async () => {
    const blank = await edit(ownerId, { title: " " });
    expect(blank.status).toBe(400);
    expect(fields(blank)).toEqual(["title"]);

    findChallenge.mockResolvedValue(null);
    const elsewhere = await edit(ownerId, {
      title: "Counter app",
      qualifyingChallengeId: String(challengeId),
    });
    expect(elsewhere.status).toBe(400);
    expect(fields(elsewhere)).toEqual(["qualifyingChallengeId"]);
    expect(saves).toBe(0);
  });

  it.each([
    ["a student", studentId],
    ["a professor who does not own the classroom", otherProfessorId],
  ])("refuses %s with 403", async (_, callerId) => {
    const response = await edit(callerId, { title: "Changed" });
    expect(response.status).toBe(403);
    expect(saves).toBe(0);
  });

  it("answers 401 with no user, 400 for a malformed id and 404 for a missing brief", async () => {
    expect((await edit(null, { title: "x" })).status).toBe(401);
    expect((await edit(ownerId, { title: "x" }, "abc")).status).toBe(400);
    const missing = await edit(ownerId, { title: "x" }, String(new mongoose.Types.ObjectId()));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("MINIPROJECT_NOT_FOUND");
  });
});

describe("POST /api/mini-projects/:id/publish", () => {
  it("lists everything a draft still needs in one 400 and stays a draft", async () => {
    const response = await publish(ownerId);
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual([
      "brief",
      "rubric",
      "stageInstructions",
      "acceptanceCriteria",
    ]);
    expect(stored.status).toBe("draft");
    expect(saves).toBe(0);
  });

  it("names a blank stage", async () => {
    storeBrief({
      ...complete(),
      stageInstructions: { ...complete().stageInstructions, Verify: "" },
    });
    const response = await publish(ownerId);
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["stageInstructions.Verify"]);
  });

  it("publishes a complete draft, and publishing again answers the same brief", async () => {
    storeBrief(complete());
    const response = await publish(ownerId);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: String(miniProjectId), status: "published" });
    expect(saves).toBe(1);

    const again = await publish(ownerId);
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe("published");
    expect(saves).toBe(1);
  });

  it("checks the qualifying challenge is still published in this classroom (E-2)", async () => {
    storeBrief({ ...complete(), qualifyingChallengeId: challengeId });
    findChallenge.mockResolvedValue(null);
    const response = await publish(ownerId);
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["qualifyingChallengeId"]);
    expect(findChallenge).toHaveBeenCalledWith({
      _id: String(challengeId),
      classroomId,
      status: "published",
    });
    expect(stored.status).toBe("draft");
  });

  it("lets only the owning professor publish", async () => {
    storeBrief(complete());
    expect((await publish(studentId)).status).toBe(403);
    expect((await publish(otherProfessorId)).status).toBe(403);
    expect(stored.status).toBe("draft");
  });
});
