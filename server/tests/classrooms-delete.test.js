// UX audit A6: the owning professor deletes a classroom and everything in it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";
import Challenge from "../src/models/Challenge.js";
import Attempt from "../src/models/Attempt.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import HelpRequest from "../src/models/HelpRequest.js";
import ClassroomGame from "../src/models/ClassroomGame.js";
import GamePlay from "../src/models/GamePlay.js";
import * as store from "../src/services/materialStore.js";

vi.mock("../src/services/materialStore.js", () => ({
  saveMaterialFile: vi.fn(),
  readMaterialFile: vi.fn(),
  deleteMaterialFile: vi.fn(),
}));

// No live database. Each delete is a spy that records its filter and the
// order it ran in, so the tests show what goes and that the classroom goes last.
const { ObjectId } = mongoose.Types;
const ids = {
  owner: new ObjectId(),
  otherProf: new ObjectId(),
  student: new ObjectId(),
  classroom: new ObjectId(),
  challenge: new ObjectId(),
  miniProject: new ObjectId(),
  game: new ObjectId(),
  fileA: new ObjectId(),
  fileB: new ObjectId(),
};
const users = {
  [String(ids.owner)]: { _id: ids.owner, displayName: "Prof Tan", role: "professor" },
  [String(ids.otherProf)]: { _id: ids.otherProf, displayName: "Prof Lim", role: "professor" },
  [String(ids.student)]: { _id: ids.student, displayName: "Alice", role: "student" },
};

let classroom;
let order;
function recordDelete(model, name, method) {
  return vi.spyOn(model, method).mockImplementation(async () => {
    order.push(name);
    return { deletedCount: 1 };
  });
}
let spies;
beforeEach(() => {
  order = [];
  classroom = { _id: ids.classroom, name: "WAD2", professorId: ids.owner };
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  vi.spyOn(Classroom, "findById").mockImplementation(async (id) =>
    classroom && String(id) === String(classroom._id) ? classroom : null,
  );
  vi.spyOn(Challenge, "find").mockResolvedValue([{ _id: ids.challenge }]);
  vi.spyOn(MiniProject, "find").mockResolvedValue([
    { _id: ids.miniProject, materials: [{ fileId: ids.fileA }, { fileId: ids.fileB }] },
  ]);
  vi.spyOn(ClassroomGame, "find").mockResolvedValue([{ _id: ids.game }]);
  store.deleteMaterialFile.mockReset();
  store.deleteMaterialFile.mockImplementation(async () => order.push("file"));
  spies = {
    attempts: recordDelete(Attempt, "attempts", "deleteMany"),
    helpRequests: recordDelete(HelpRequest, "helpRequests", "deleteMany"),
    groups: recordDelete(ProjectGroup, "groups", "deleteMany"),
    miniProjects: recordDelete(MiniProject, "miniProjects", "deleteMany"),
    challenges: recordDelete(Challenge, "challenges", "deleteMany"),
    memberships: recordDelete(Membership, "memberships", "deleteMany"),
    gamePlays: recordDelete(GamePlay, "gamePlays", "deleteMany"),
    games: recordDelete(ClassroomGame, "games", "deleteMany"),
    classroom: recordDelete(Classroom, "classroom", "deleteOne"),
  };
});
afterEach(() => vi.restoreAllMocks());

function remove(callerId, id = String(ids.classroom)) {
  const req = request(createApp()).delete(`/api/classrooms/${id}`);
  return callerId ? req.set(...sessionHeader(callerId)) : req;
}

describe("DELETE /api/classrooms/:id (UX audit A6)", () => {
  it("deletes everything in the classroom, files included, and the classroom last", async () => {
    const response = await remove(ids.owner);
    expect(response.status).toBe(204);
    expect(spies.attempts).toHaveBeenCalledWith({ challengeId: { $in: [ids.challenge] } });
    expect(spies.helpRequests).toHaveBeenCalledWith({ classroomId: ids.classroom });
    expect(spies.groups).toHaveBeenCalledWith({ miniProjectId: { $in: [ids.miniProject] } });
    expect(store.deleteMaterialFile.mock.calls).toEqual([[ids.fileA], [ids.fileB]]);
    expect(spies.miniProjects).toHaveBeenCalledWith({ classroomId: ids.classroom });
    expect(spies.challenges).toHaveBeenCalledWith({ classroomId: ids.classroom });
    expect(spies.memberships).toHaveBeenCalledWith({ classroomId: ids.classroom });
    expect(spies.gamePlays).toHaveBeenCalledWith({ gameId: { $in: [ids.game] } });
    expect(spies.games).toHaveBeenCalledWith({ classroomId: ids.classroom });
    expect(order.indexOf("gamePlays")).toBeLessThan(order.indexOf("games"));
    expect(spies.classroom).toHaveBeenCalledWith({ _id: ids.classroom });
    expect(order.at(-1)).toBe("classroom");
    expect(order.indexOf("file")).toBeLessThan(order.indexOf("miniProjects"));
  });

  it("keeps the classroom when a step fails, so pressing Delete again can finish", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    store.deleteMaterialFile.mockRejectedValueOnce(new Error("GridFS is down"));
    const response = await remove(ids.owner);
    expect(response.status).toBe(500);
    expect(spies.miniProjects).not.toHaveBeenCalled();
    expect(spies.classroom).not.toHaveBeenCalled();
    expect((await remove(ids.owner)).status).toBe(204);
    expect(spies.classroom).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another professor", "otherProf"],
    ["a student", "student"],
  ])("refuses %s as 403 and deletes nothing", async (_, caller) => {
    const response = await remove(ids[caller]);
    expect(response.status).toBe(403);
    expect(order).toEqual([]);
    expect(store.deleteMaterialFile).not.toHaveBeenCalled();
  });

  it("rejects no caller as 401, a malformed id as 400 and a missing classroom as 404", async () => {
    expect((await remove(undefined)).status).toBe(401);
    expect((await remove(ids.owner, "nope")).status).toBe(400);
    expect((await remove(ids.owner, String(new ObjectId()))).status).toBe(404);
    expect(order).toEqual([]);
  });
});
