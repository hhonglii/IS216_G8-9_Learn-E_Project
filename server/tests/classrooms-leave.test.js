// UX audit A4: a student leaves a classroom.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Membership from "../src/models/Membership.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import HelpRequest from "../src/models/HelpRequest.js";

// No live database. Only the Membership row is removed; attempts are never
// touched, which the spies below show. The help request calls are checked by
// their filters, since the tidy-up is two plain bulk writes.
const { ObjectId } = mongoose.Types;
const ids = {
  student: new ObjectId(),
  prof: new ObjectId(),
  classroom: new ObjectId(),
  miniProject: new ObjectId(),
  membership: new ObjectId(),
};
const users = {
  [String(ids.student)]: { _id: ids.student, displayName: "Alice", role: "student" },
  [String(ids.prof)]: { _id: ids.prof, displayName: "Prof Tan", role: "professor" },
};

let membership;
let group;
let removeMembership;
let withdrawOpen;
let returnClaims;
beforeEach(() => {
  membership = { _id: ids.membership, classroomId: ids.classroom, userId: ids.student };
  group = null;
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  vi.spyOn(Membership, "findOne").mockImplementation(async (filter) =>
    membership &&
    String(filter.classroomId) === String(membership.classroomId) &&
    String(filter.userId) === String(membership.userId)
      ? membership
      : null,
  );
  removeMembership = vi.spyOn(Membership, "deleteOne").mockResolvedValue({ deletedCount: 1 });
  vi.spyOn(MiniProject, "find").mockResolvedValue([{ _id: ids.miniProject }]);
  vi.spyOn(ProjectGroup, "findOne").mockImplementation(async () => group);
  withdrawOpen = vi.spyOn(HelpRequest, "deleteMany").mockResolvedValue({ deletedCount: 1 });
  returnClaims = vi.spyOn(HelpRequest, "updateMany").mockResolvedValue({ modifiedCount: 1 });
});
afterEach(() => vi.restoreAllMocks());

function leave(callerId, id = String(ids.classroom)) {
  const req = request(createApp()).put(`/api/classrooms/${id}/leave`);
  return callerId ? req.set(...sessionHeader(callerId)) : req;
}

describe("PUT /api/classrooms/:id/leave (UX audit A4)", () => {
  it("removes only the membership and tidies the student's unanswered help requests", async () => {
    const response = await leave(ids.student);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ classroomId: String(ids.classroom), left: true });
    expect(removeMembership).toHaveBeenCalledWith({ _id: ids.membership });
    expect(withdrawOpen).toHaveBeenCalledWith({
      classroomId: String(ids.classroom),
      requesterId: ids.student,
      status: "open",
    });
    expect(returnClaims).toHaveBeenCalledWith(
      { classroomId: String(ids.classroom), claimedBy: ids.student, status: "claimed" },
      { $set: { status: "open" }, $unset: { claimedBy: "" } },
    );
  });

  it("looks for a group only in this classroom's mini-projects", async () => {
    await leave(ids.student);
    expect(MiniProject.find).toHaveBeenCalledWith({ classroomId: String(ids.classroom) }, "_id");
    expect(ProjectGroup.findOne).toHaveBeenCalledWith(
      { miniProjectId: { $in: [ids.miniProject] }, memberIds: ids.student },
      "name",
    );
  });

  it("refuses while the student is still in a group, names it, and changes nothing", async () => {
    group = { name: "Team Rocket" };
    const response = await leave(ids.student);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IN_A_GROUP");
    expect(response.body.error.message).toBe(
      'Leave your mini-project group "Team Rocket" first, then leave the classroom.',
    );
    expect(removeMembership).not.toHaveBeenCalled();
    expect(withdrawOpen).not.toHaveBeenCalled();
    expect(returnClaims).not.toHaveBeenCalled();
  });

  it("answers 404 when the student is not in the classroom", async () => {
    membership = null;
    const response = await leave(ids.student);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_A_MEMBER");
    expect(removeMembership).not.toHaveBeenCalled();
  });

  it("rejects no caller as 401, a professor as 403 and a malformed id as 400", async () => {
    expect((await leave(undefined)).status).toBe(401);
    expect((await leave(ids.prof)).status).toBe(403);
    expect((await leave(ids.student, "nope")).status).toBe(400);
    expect(removeMembership).not.toHaveBeenCalled();
  });
});
