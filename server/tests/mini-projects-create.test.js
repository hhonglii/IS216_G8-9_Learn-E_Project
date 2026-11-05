// Test cases for slice G15 Step 3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Challenge from "../src/models/Challenge.js";
import MiniProject from "../src/models/MiniProject.js";

// POST /api/classrooms/:id/mini-projects with mocked models and no database,
// the same approach as groups-submission.test.js. Decisions H-8 (created as a
// draft; publishing is tested in mini-projects-drafts.test.js), E-2 (qualifying
// challenge), E-3 (no upper group size) and E-4 (starter URL through the shared
// GitHub parser) are the rules under test.
const ownerId = new mongoose.Types.ObjectId();
const otherProfessorId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const classroomId = new mongoose.Types.ObjectId();
const challengeId = new mongoose.Types.ObjectId();
const users = {
  [String(ownerId)]: { _id: ownerId, displayName: "Prof Tan", role: "professor" },
  [String(otherProfessorId)]: { _id: otherProfessorId, displayName: "Prof Lim", role: "professor" },
  [String(studentId)]: { _id: studentId, displayName: "Alice", role: "student" },
};
const brief = () => ({
  title: "  Repair the counter app  ",
  brief: "Find and fix the counter bug.",
  rubric: "Working fix, a test and a short reflection.",
  stageInstructions: {
    Diagnose: "Say what is wrong.",
    Repair: "Fix it.",
    Extend: "Add a reset button.",
    Verify: "Write a test.",
    Reflect: "What would you do differently?",
  },
  acceptanceCriteria: [" Counter starts at zero ", "Reset works"],
  maxGroupSize: 3,
});

function create(callerId, body, id = String(classroomId)) {
  const req = request(createApp()).post(`/api/classrooms/${id}/mini-projects`);
  if (callerId) req.set(...sessionHeader(callerId));
  return body === undefined ? req : req.send(body);
}
const fields = (response) => response.body.error.details.map((detail) => detail.field);

let findClassroom;
let findChallenge;
let save;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  findClassroom = vi
    .spyOn(Classroom, "findById")
    .mockResolvedValue({ _id: classroomId, professorId: ownerId });
  findChallenge = vi.spyOn(Challenge, "findOne").mockResolvedValue({ _id: challengeId });
  // Hand back what was written, as the database would, with a new id.
  save = vi
    .spyOn(MiniProject, "create")
    .mockImplementation(async (doc) =>
      MiniProject.hydrate({ _id: new mongoose.Types.ObjectId(), ...doc }),
    );
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/classrooms/:id/mini-projects: creating (H-8)", () => {
  it("creates the brief as a draft for the owning professor and answers 201", async () => {
    const response = await create(ownerId, brief());
    expect(response.status).toBe(201);
    expect(save).toHaveBeenCalledTimes(1);
    const written = save.mock.calls[0][0];
    expect(written.status).toBe("draft");
    expect(String(written.classroomId)).toBe(String(classroomId));
    expect(String(written.createdBy)).toBe(String(ownerId));
    // Text is trimmed before it is saved.
    expect(written.title).toBe("Repair the counter app");
    expect(written.acceptanceCriteria).toEqual(["Counter starts at zero", "Reset works"]);
    expect(response.body.data).toMatchObject({
      classroomId: String(classroomId),
      title: "Repair the counter app",
      maxGroupSize: 3,
      status: "draft",
      createdBy: String(ownerId),
    });
    expect(response.body.data.id).toMatch(/^[a-f0-9]{24}$/);
    expect(response.body.data).not.toHaveProperty("qualifyingChallengeId");
  });

  it("ignores status, createdBy and classroomId sent in the body", async () => {
    const response = await create(ownerId, {
      ...brief(),
      status: "published",
      createdBy: String(studentId),
      classroomId: String(new mongoose.Types.ObjectId()),
    });
    expect(response.status).toBe(201);
    const written = save.mock.calls[0][0];
    expect(written.status).toBe("draft");
    expect(String(written.createdBy)).toBe(String(ownerId));
    expect(String(written.classroomId)).toBe(String(classroomId));
  });

  it("stores the starter repository in the parser's canonical form (E-4)", async () => {
    const response = await create(ownerId, {
      ...brief(),
      starterRepoUrl: "https://github.com/Octo/Demo.git",
    });
    expect(response.status).toBe(201);
    expect(save.mock.calls[0][0].starterRepoUrl).toBe("https://github.com/Octo/Demo");
    expect(response.body.data.starterRepoUrl).toBe("https://github.com/Octo/Demo");
  });

  it("accepts a published challenge from this classroom as the qualifying challenge (E-2)", async () => {
    const response = await create(ownerId, { ...brief(), qualifyingChallengeId: String(challengeId) });
    expect(response.status).toBe(201);
    expect(findChallenge).toHaveBeenCalledWith({
      _id: String(challengeId),
      classroomId,
      status: "published",
    });
    expect(response.body.data.qualifyingChallengeId).toBe(String(challengeId));
  });

  it("puts no upper limit on the group size (E-3)", async () => {
    const response = await create(ownerId, { ...brief(), maxGroupSize: 50 });
    expect(response.status).toBe(201);
    expect(save.mock.calls[0][0].maxGroupSize).toBe(50);
  });
});

describe("POST /api/classrooms/:id/mini-projects: who may create", () => {
  it("rejects a request with no selected user as 401", async () => {
    const response = await create(null, brief());
    expect(response.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ["a student", studentId],
    ["a professor who does not own the classroom", otherProfessorId],
  ])("refuses %s as 403 and saves nothing", async (_, callerId) => {
    const response = await create(callerId, brief());
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(save).not.toHaveBeenCalled();
  });

  it("answers a malformed classroom id with 400 and a missing classroom with 404", async () => {
    const malformed = await create(ownerId, brief(), "abc");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.details.field).toBe("id");
    expect(findClassroom).not.toHaveBeenCalled();

    findClassroom.mockResolvedValue(null);
    const missing = await create(ownerId, brief());
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("CLASSROOM_NOT_FOUND");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("POST /api/classrooms/:id/mini-projects: validation", () => {
  it("needs only a title to save a draft", async () => {
    const response = await create(ownerId, { title: "Counter app" });
    expect(response.status).toBe(201);
    expect(save.mock.calls[0][0]).toMatchObject({ title: "Counter app", status: "draft" });
    expect(save.mock.calls[0][0]).not.toHaveProperty("brief");
  });

  it("refuses a draft with no title and saves nothing", async () => {
    const response = await create(ownerId, {});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(fields(response)).toEqual(["title"]);
    expect(save).not.toHaveBeenCalled();
  });

  it("drops blank criteria and saves every stage, blank where none was typed", async () => {
    const response = await create(ownerId, {
      title: "Counter app",
      stageInstructions: { Diagnose: " Say what is wrong. " },
      acceptanceCriteria: ["Starts at zero", "  ", ""],
    });
    expect(response.status).toBe(201);
    const written = save.mock.calls[0][0];
    expect(written.stageInstructions).toEqual({
      Diagnose: "Say what is wrong.",
      Repair: "",
      Extend: "",
      Verify: "",
      Reflect: "",
    });
    expect(written.acceptanceCriteria).toEqual(["Starts at zero"]);
  });

  it.each([
    ["a blank title", { title: "   " }, "title"],
    ["a stage that is not text", { stageInstructions: { Verify: 3 } }, "stageInstructions.Verify"],
    ["criteria that are not text", { acceptanceCriteria: ["Works", 2] }, "acceptanceCriteria"],
    ["a brief that is not text", { brief: 4 }, "brief"],
    ["a group size of 0", { maxGroupSize: 0 }, "maxGroupSize"],
    ["a fractional group size", { maxGroupSize: 2.5 }, "maxGroupSize"],
    ["a group size sent as text", { maxGroupSize: "3" }, "maxGroupSize"],
    ["a starter URL that is not GitHub", { starterRepoUrl: "https://gitlab.com/octo/demo" }, "starterRepoUrl"],
    ["a malformed qualifying challenge id", { qualifyingChallengeId: "abc" }, "qualifyingChallengeId"],
  ])("rejects %s as 400", async (_, change, field) => {
    const response = await create(ownerId, { ...brief(), ...change });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual([field]);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a qualifying challenge that is not published in this classroom (E-2)", async () => {
    findChallenge.mockResolvedValue(null);
    const response = await create(ownerId, { ...brief(), qualifyingChallengeId: String(challengeId) });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["qualifyingChallengeId"]);
    expect(save).not.toHaveBeenCalled();
  });
});
