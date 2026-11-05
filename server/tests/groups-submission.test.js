// Test cases for slices G1 and G2.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import MiniProject from "../src/models/MiniProject.js";
import Classroom from "../src/models/Classroom.js";

// No live database, same approach as groups-repository.test.js: readyState is
// mocked to 1 so loadSessionUser resolves the caller, and model methods are
// replaced per test. Decisions G-1 (what is required), G-2 (5000 characters)
// and G-3 (approved is final) are the rules under test for submit; G-4 (the
// review body) and G-5 (feedback on a return) for review.
const memberId = new mongoose.Types.ObjectId();
const outsiderId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const otherProfessorId = new mongoose.Types.ObjectId();
const groupId = new mongoose.Types.ObjectId();
const miniProjectId = new mongoose.Types.ObjectId();
const classroomId = new mongoose.Types.ObjectId();
const users = {
  [String(memberId)]: { _id: memberId, displayName: "Alice", role: "student" },
  [String(outsiderId)]: { _id: outsiderId, displayName: "Bob", role: "student" },
  [String(ownerId)]: { _id: ownerId, displayName: "Prof Tan", role: "professor" },
  [String(otherProfessorId)]: { _id: otherProfessorId, displayName: "Prof Lim", role: "professor" },
};
const evidence = {
  Diagnose: "The counter starts at one.",
  Repair: "Initialised it to zero.",
  Extend: "",
  Verify: "Added a test for the first render.",
  Reflect: "",
};
const storedGroup = (fields = {}) =>
  ProjectGroup.hydrate({
    _id: groupId,
    miniProjectId,
    name: "Team Rocket",
    memberIds: [memberId],
    stageEvidence: evidence,
    submissionStatus: "draft",
    updatedAt: new Date("2026-10-20T08:00:00Z"),
    ...fields,
  });

function submit(callerId, body, id = String(groupId)) {
  const req = request(createApp()).put(`/api/groups/${id}/submit`);
  if (callerId) req.set(...sessionHeader(callerId));
  return body === undefined ? req : req.send(body);
}
function review(callerId, body, id = String(groupId)) {
  const req = request(createApp()).put(`/api/groups/${id}/review`);
  if (callerId) req.set(...sessionHeader(callerId));
  return body === undefined ? req : req.send(body);
}
const fields = (response) => response.body.error.details.map((detail) => detail.field);

let findGroup;
let update;
let findMiniProject;
let findClassroom;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  findGroup = vi.spyOn(ProjectGroup, "findById").mockResolvedValue(storedGroup());
  // Apply the $set to the group the handler just read, so the response
  // reflects the write and keeps what the $set leaves out (professorFeedback).
  update = vi.spyOn(ProjectGroup, "findOneAndUpdate").mockImplementation(async (_filter, change) => {
    const read = await findGroup.mock.results.at(-1).value;
    return storedGroup({
      ...read.toObject(),
      ...change.$set,
      updatedAt: new Date("2026-10-24T08:00:00Z"),
    });
  });
  findMiniProject = vi
    .spyOn(MiniProject, "findById")
    .mockResolvedValue({ _id: miniProjectId, classroomId });
  findClassroom = vi
    .spyOn(Classroom, "findById")
    .mockResolvedValue({ _id: classroomId, professorId: ownerId });
});
afterEach(() => vi.restoreAllMocks());

describe("PUT /api/groups/:id/submit: who may submit", () => {
  it("rejects a request with no selected user as 401 without a lookup or write", async () => {
    const response = await submit(null, { reflection: "Done." });
    expect(response.status).toBe(401);
    expect(findGroup).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a malformed group id as 400", async () => {
    const response = await submit(memberId, { reflection: "Done." }, "abc");
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe("id");
    expect(update).not.toHaveBeenCalled();
  });

  it("answers a group that does not exist with 404", async () => {
    findGroup.mockResolvedValue(null);
    const response = await submit(memberId, { reflection: "Done." });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("GROUP_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses someone outside the group as 403 and writes nothing", async () => {
    const response = await submit(outsiderId, { reflection: "Done." });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(response.body.error.message).toBe("Only group members can submit this group's work.");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/groups/:id/submit: state (decision G-3)", () => {
  it("refuses work already waiting for review as 409", async () => {
    findGroup.mockResolvedValue(storedGroup({ submissionStatus: "submitted" }));
    const response = await submit(memberId, { reflection: "Again." });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_SUBMISSION_STATUS");
    expect(response.body.error.message).toBe("This group's work is already waiting for review.");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses approved work as 409, since approved is final", async () => {
    findGroup.mockResolvedValue(storedGroup({ submissionStatus: "approved" }));
    const response = await submit(memberId, { reflection: "Again." });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_SUBMISSION_STATUS");
    expect(response.body.error.message).toBe("This group's work is already approved.");
    expect(update).not.toHaveBeenCalled();
  });

  it("checks the state before the evidence, so approved work with gaps is still 409", async () => {
    findGroup.mockResolvedValue(
      storedGroup({ submissionStatus: "approved", stageEvidence: { ...evidence, Verify: "" } }),
    );
    const response = await submit(memberId, {});
    expect(response.status).toBe(409);
  });
});

describe("PUT /api/groups/:id/submit: evidence and reflection (decisions G-1, G-2)", () => {
  it("names Verify when it is empty and writes nothing", async () => {
    findGroup.mockResolvedValue(storedGroup({ stageEvidence: { ...evidence, Verify: "" } }));
    const response = await submit(memberId, { reflection: "Done." });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(fields(response)).toEqual(["stageEvidence.Verify"]);
    expect(response.body.error.details[0].message).toMatch(/Verify/);
    expect(update).not.toHaveBeenCalled();
  });

  it("treats evidence that is only spaces as empty", async () => {
    findGroup.mockResolvedValue(storedGroup({ stageEvidence: { ...evidence, Repair: "   \n " } }));
    const response = await submit(memberId, { reflection: "Done." });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["stageEvidence.Repair"]);
  });

  it("lists every problem at once", async () => {
    findGroup.mockResolvedValue(storedGroup({ stageEvidence: undefined }));
    const response = await submit(memberId, { reflection: "  " });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual([
      "stageEvidence.Diagnose",
      "stageEvidence.Repair",
      "stageEvidence.Verify",
      "reflection",
    ]);
  });

  it("does not require Extend or the Reflect stage", async () => {
    const response = await submit(memberId, { reflection: "Done." });
    expect(response.status).toBe(200);
  });

  it("reads evidence from the saved group, not the body", async () => {
    findGroup.mockResolvedValue(storedGroup({ stageEvidence: { ...evidence, Verify: "" } }));
    const response = await submit(memberId, {
      reflection: "Done.",
      stageEvidence: { ...evidence, Verify: "Claimed in the body." },
    });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["stageEvidence.Verify"]);
  });

  it.each([
    ["missing", {}],
    ["blank", { reflection: "   " }],
    ["not a string", { reflection: 42 }],
    ["an array", { reflection: ["Done."] }],
  ])("rejects a reflection that is %s", async (_, body) => {
    const response = await submit(memberId, body);
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["reflection"]);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a request with no body without crashing", async () => {
    const response = await submit(memberId);
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["reflection"]);
  });

  it("rejects a reflection over 5000 characters", async () => {
    const response = await submit(memberId, { reflection: "a".repeat(5001) });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["reflection"]);
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts exactly 5000 characters, counted after trimming", async () => {
    const response = await submit(memberId, { reflection: `  ${"a".repeat(5000)}  ` });
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1].$set.reflection).toHaveLength(5000);
  });
});

describe("PUT /api/groups/:id/submit: saving", () => {
  it("moves a draft to submitted and saves the trimmed reflection", async () => {
    const response = await submit(memberId, { reflection: "  We fixed the start value.  " });
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1]).toEqual({
      $set: { submissionStatus: "submitted", reflection: "We fixed the start value." },
    });
    expect(response.body.data).toEqual({
      id: String(groupId),
      submissionStatus: "submitted",
      reflection: "We fixed the start value.",
      professorFeedback: "",
      updatedAt: "2026-10-24T08:00:00.000Z",
    });
  });

  it("only saves while the caller is a member and the group is still draft or returned", async () => {
    await submit(memberId, { reflection: "Done." });
    const filter = update.mock.calls[0][0];
    expect(String(filter._id)).toBe(String(groupId));
    expect(String(filter.memberIds)).toBe(String(memberId));
    expect(filter.submissionStatus).toEqual({ $in: ["draft", "returned"] });
  });

  it("resubmits returned work and keeps the professor's feedback", async () => {
    findGroup.mockResolvedValue(
      storedGroup({ submissionStatus: "returned", professorFeedback: "Add a Verify test." }),
    );
    const response = await submit(memberId, { reflection: "Added the test." });
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1].$set).not.toHaveProperty("professorFeedback");
    expect(response.body.data.submissionStatus).toBe("submitted");
    expect(response.body.data.professorFeedback).toBe("Add a Verify test.");
  });

  it("answers 409 when another member submitted between the read and the write", async () => {
    update.mockResolvedValue(null);
    const response = await submit(memberId, { reflection: "Done." });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_SUBMISSION_STATUS");
    expect(response.body.error.message).toBe("This group's work was just submitted by someone else.");
  });
});


describe("PUT /api/groups/:id/review: who may review", () => {
  const submitted = () => findGroup.mockResolvedValue(storedGroup({ submissionStatus: "submitted" }));

  it("rejects a request with no selected user as 401 without a lookup or write", async () => {
    const response = await review(null, { decision: "approve" });
    expect(response.status).toBe(401);
    expect(findGroup).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a malformed group id as 400", async () => {
    const response = await review(ownerId, { decision: "approve" }, "abc");
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe("id");
    expect(update).not.toHaveBeenCalled();
  });

  it("answers a group that does not exist with 404", async () => {
    findGroup.mockResolvedValue(null);
    const response = await review(ownerId, { decision: "approve" });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("GROUP_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });

  it("follows the group to its mini-project and classroom", async () => {
    submitted();
    await review(ownerId, { decision: "approve" });
    expect(String(findMiniProject.mock.calls[0][0])).toBe(String(miniProjectId));
    expect(String(findClassroom.mock.calls[0][0])).toBe(String(classroomId));
  });

  it.each([
    ["a member approving their own group", memberId],
    ["a student outside the group", outsiderId],
    ["a professor who does not own the classroom", otherProfessorId],
  ])("refuses %s as 403 and writes nothing", async (_, callerId) => {
    submitted();
    const response = await review(callerId, { decision: "approve" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a student even if their id is the classroom's professorId", async () => {
    submitted();
    findClassroom.mockResolvedValue({ _id: classroomId, professorId: memberId });
    const response = await review(memberId, { decision: "approve" });
    expect(response.status).toBe(403);
  });

  it.each([
    ["mini-project", () => findMiniProject.mockResolvedValue(null)],
    ["classroom", () => findClassroom.mockResolvedValue(null)],
  ])("answers 403, not a crash, when the %s is missing", async (_, breakIt) => {
    submitted();
    breakIt();
    const response = await review(ownerId, { decision: "approve" });
    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/groups/:id/review: the body (decisions G-4, G-5)", () => {
  beforeEach(() => findGroup.mockResolvedValue(storedGroup({ submissionStatus: "submitted" })));

  it.each([
    ["missing", {}],
    ["a status word instead of a decision", { decision: "approved" }],
    ["not a string", { decision: 1 }],
  ])("rejects a decision that is %s as 400", async (_, body) => {
    const response = await review(ownerId, body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects feedback that is not a string", async () => {
    const response = await review(ownerId, { decision: "approve", feedback: 42 });
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { decision: "return" }],
    ["blank", { decision: "return", feedback: "   " }],
  ])("requires feedback on a return: %s is 400", async (_, body) => {
    const response = await review(ownerId, body);
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/Feedback is required/);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a request with no body without crashing", async () => {
    const response = await review(ownerId);
    expect(response.status).toBe(400);
  });
});

describe("PUT /api/groups/:id/review: only submitted work", () => {
  it.each(["draft", "returned", "approved"])("refuses a %s group as 409", async (status) => {
    findGroup.mockResolvedValue(storedGroup({ submissionStatus: status }));
    const response = await review(ownerId, { decision: "approve" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_REVIEW_STATUS");
    expect(update).not.toHaveBeenCalled();
  });

  it("answers 409 when the group was reviewed between the read and the write", async () => {
    findGroup.mockResolvedValue(storedGroup({ submissionStatus: "submitted" }));
    update.mockResolvedValue(null);
    const response = await review(ownerId, { decision: "approve" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_REVIEW_STATUS");
  });
});

describe("PUT /api/groups/:id/review: saving", () => {
  beforeEach(() =>
    findGroup.mockResolvedValue(
      storedGroup({ submissionStatus: "submitted", reflection: "We fixed the start value." }),
    ),
  );

  it("approves submitted work, saving only the status and feedback", async () => {
    const response = await review(ownerId, { decision: "approve", feedback: "  Good evidence.  " });
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][0]).toEqual({ _id: groupId, submissionStatus: "submitted" });
    expect(update.mock.calls[0][1]).toEqual({
      $set: { submissionStatus: "approved", professorFeedback: "Good evidence." },
    });
    expect(response.body.data).toEqual({
      id: String(groupId),
      submissionStatus: "approved",
      professorFeedback: "Good evidence.",
      updatedAt: "2026-10-24T08:00:00.000Z",
    });
  });

  it("approves without feedback", async () => {
    const response = await review(ownerId, { decision: "approve" });
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1].$set.professorFeedback).toBe("");
  });

  it("returns work with its feedback and leaves evidence, tasks and reflection alone", async () => {
    const response = await review(ownerId, { decision: "return", feedback: "Add a Verify test." });
    expect(response.status).toBe(200);
    expect(response.body.data.submissionStatus).toBe("returned");
    expect(Object.keys(update.mock.calls[0][1].$set).sort()).toEqual([
      "professorFeedback",
      "submissionStatus",
    ]);
  });
});

describe("submit and review together", () => {
  it("returns, resubmits and then approves one group, keeping its evidence", async () => {
    // A tiny stand-in for the database: one stored group that both handlers
    // read and conditionally update, so each step sees the previous one.
    let stored = storedGroup().toObject();
    findGroup.mockImplementation(async () => storedGroup(stored));
    update.mockImplementation(async (filter, change) => {
      if (filter.submissionStatus) {
        const allowed = filter.submissionStatus.$in ?? [filter.submissionStatus];
        if (!allowed.includes(stored.submissionStatus)) return null;
      }
      stored = { ...stored, ...change.$set };
      return storedGroup(stored);
    });

    expect((await submit(memberId, { reflection: "First try." })).status).toBe(200);
    expect((await review(ownerId, { decision: "return", feedback: "Add a Verify test." })).status).toBe(200);
    expect(stored.submissionStatus).toBe("returned");

    const resubmitted = await submit(memberId, { reflection: "Added the test." });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.data.professorFeedback).toBe("Add a Verify test.");

    const approved = await review(ownerId, { decision: "approve", feedback: "Good." });
    expect(approved.status).toBe(200);
    expect(stored.submissionStatus).toBe("approved");
    expect(stored.stageEvidence).toEqual(evidence);
    expect(stored.reflection).toBe("Added the test.");

    expect((await submit(memberId, { reflection: "Again." })).status).toBe(409);
    expect((await review(ownerId, { decision: "return", feedback: "No." })).status).toBe(409);
  });
});
