// Test cases for slice G15 Step 3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Membership from "../src/models/Membership.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";

// Create group, join, tasks and stage evidence with no live database. The
// groups live in a small fake store whose findOneAndUpdate applies the filter
// operators the handlers use ($ne, memberIds.N $exists, updatedAt) and the
// unique { miniProjectId, memberIds } index, so the capacity, second-group and
// stale-save rules are decided by the handler's own atomic update, not by a
// canned answer. Decisions E-5 (merge stages), E-7 (join answers) and E-8
// (stale task saves) are the rules under test.
const { ObjectId } = mongoose.Types;
const ids = {
  alice: new ObjectId(),
  bob: new ObjectId(),
  cara: new ObjectId(),
  dan: new ObjectId(), // a student outside the classroom
  prof: new ObjectId(),
};
const users = {
  [String(ids.alice)]: { _id: ids.alice, displayName: "Alice", role: "student" },
  [String(ids.bob)]: { _id: ids.bob, displayName: "Bob", role: "student" },
  [String(ids.cara)]: { _id: ids.cara, displayName: "Cara", role: "student" },
  [String(ids.dan)]: { _id: ids.dan, displayName: "Dan", role: "student" },
  [String(ids.prof)]: { _id: ids.prof, displayName: "Prof Tan", role: "professor" },
};
const enrolled = [ids.alice, ids.bob, ids.cara].map(String);
const classroomId = new ObjectId();
const miniProjectId = new ObjectId();
const groupId = new ObjectId();
const otherGroupId = new ObjectId();
const loaded = new Date("2026-10-20T08:00:00Z");

let miniProject;
let store;
const has = (list, id) => list.some((member) => String(member) === String(id));
const stored = (id = groupId) => store.get(String(id));
function seedGroup(fields = {}) {
  const group = {
    _id: groupId,
    miniProjectId,
    name: "Team Rocket",
    memberIds: [ids.alice],
    tasks: [],
    stageEvidence: {},
    updatedAt: loaded,
    ...fields,
  };
  store.set(String(group._id), group);
  return group;
}

// Only the filter keys and update operators the Phase E handlers send.
function matches(group, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "_id") return String(group._id) === String(condition);
    if (key === "updatedAt") return group.updatedAt.getTime() === condition.getTime();
    if (key === "memberIds") {
      if (condition?.$size !== undefined) return group.memberIds.length === condition.$size;
      return condition?.$ne ? !has(group.memberIds, condition.$ne) : has(group.memberIds, condition);
    }
    const slot = key.match(/^memberIds\.(\d+)$/);
    if (slot && condition.$exists === false) return group.memberIds.length <= Number(slot[1]);
    throw new Error(`fake store: unsupported filter ${key}`);
  });
}
function apply(group, update) {
  const next = { ...group, stageEvidence: { ...group.stageEvidence } };
  if (update.$push?.memberIds) {
    const id = update.$push.memberIds;
    // The unique index: one group per student per mini-project.
    for (const other of store.values()) {
      if (String(other.miniProjectId) === String(group.miniProjectId) && has(other.memberIds, id)) {
        throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      }
    }
    next.memberIds = [...group.memberIds, id];
  }
  if (update.$pull?.memberIds) {
    next.memberIds = group.memberIds.filter((member) => String(member) !== String(update.$pull.memberIds));
  }
  for (const [key, value] of Object.entries(update.$set ?? {})) {
    if (key === "tasks") {
      // Mongoose gives a new task an _id when it casts the update.
      next.tasks = value.map((task) => ({ ...task, _id: task._id ?? new ObjectId() }));
    } else if (key.startsWith("stageEvidence.")) {
      next.stageEvidence[key.slice("stageEvidence.".length)] = value;
    } else throw new Error(`fake store: unsupported $set ${key}`);
  }
  next.updatedAt = new Date(group.updatedAt.getTime() + 1000);
  return next;
}

function call(method, path, callerId, body) {
  const req = request(createApp())[method](path);
  if (callerId) req.set(...sessionHeader(callerId));
  return body === undefined ? req : req.send(body);
}
const createGroup = (callerId, body, id = String(miniProjectId)) =>
  call("post", `/api/mini-projects/${id}/groups`, callerId, body);
const join = (callerId, id = String(groupId)) => call("put", `/api/groups/${id}/join`, callerId);
const saveTasks = (callerId, tasks, updatedAt = loaded.toISOString()) =>
  call("put", `/api/groups/${groupId}/tasks`, callerId, { tasks, updatedAt });
const leave = (callerId, id = String(groupId)) => call("put", `/api/groups/${id}/leave`, callerId);
const saveStages = (callerId, stageEvidence) =>
  call("put", `/api/groups/${groupId}/stages`, callerId, { stageEvidence });
const fields = (response) => response.body.error.details.map((detail) => detail.field);

let write;
let insert;
beforeEach(() => {
  store = new Map();
  miniProject = { _id: miniProjectId, classroomId, maxGroupSize: 3, status: "published" };
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  vi.spyOn(MiniProject, "findById").mockImplementation(async (id) =>
    String(id) === String(miniProjectId) ? miniProject : null,
  );
  vi.spyOn(Membership, "findOne").mockImplementation(async ({ classroomId: cid, userId }) =>
    String(cid) === String(classroomId) && enrolled.includes(String(userId))
      ? { classroomId, userId }
      : null,
  );
  vi.spyOn(ProjectGroup, "findById").mockImplementation(async (id) => {
    const group = store.get(String(id));
    return group ? ProjectGroup.hydrate(group) : null;
  });
  vi.spyOn(ProjectGroup, "findOne").mockImplementation(async (filter) => {
    const group = [...store.values()].find(
      (candidate) =>
        String(candidate.miniProjectId) === String(filter.miniProjectId) &&
        has(candidate.memberIds, filter.memberIds),
    );
    return group ? ProjectGroup.hydrate(group) : null;
  });
  write = vi.spyOn(ProjectGroup, "findOneAndUpdate").mockImplementation(async (filter, update) => {
    const group = [...store.values()].find((candidate) => matches(candidate, filter));
    if (!group) return null;
    const next = apply(group, update);
    store.set(String(next._id), next);
    return ProjectGroup.hydrate(next);
  });
  vi.spyOn(ProjectGroup, "deleteOne").mockImplementation(async (filter) => {
    const group = [...store.values()].find((candidate) => matches(candidate, filter));
    if (group) store.delete(String(group._id));
    return { deletedCount: group ? 1 : 0 };
  });
  insert = vi.spyOn(ProjectGroup, "create").mockImplementation(async (doc) => {
    const group = { _id: new ObjectId(), tasks: [], stageEvidence: {}, updatedAt: loaded, ...doc };
    store.set(String(group._id), group);
    return ProjectGroup.hydrate(group);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/mini-projects/:id/groups: creating a group", () => {
  it("creates the group with the founder as its only member and answers 201", async () => {
    const response = await createGroup(ids.bob, { name: "  Team Spark  " });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: "Team Spark", memberIds: [String(ids.bob)] });
    const saved = stored(response.body.data.id);
    expect(saved.name).toBe("Team Spark");
    expect(saved.memberIds.map(String)).toEqual([String(ids.bob)]);
    expect(String(saved.miniProjectId)).toBe(String(miniProjectId));
  });

  it("refuses a student already in a group for this project as 409, since the founder joins", async () => {
    seedGroup();
    const response = await createGroup(ids.alice, { name: "Second team" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_IN");
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ["a student outside the classroom", ids.dan],
    ["a professor", ids.prof],
  ])("refuses %s as 403", async (_, callerId) => {
    const response = await createGroup(callerId, { name: "Team" });
    expect(response.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a blank name as 400", async () => {
    const response = await createGroup(ids.bob, { name: "   " });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["name"]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers an unpublished mini-project with 404", async () => {
    miniProject.status = "draft";
    const response = await createGroup(ids.bob, { name: "Team" });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MINIPROJECT_NOT_FOUND");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("PUT /api/groups/:id/join: joining (E-7)", () => {
  it("adds a classmate to a group with room and answers 200 with the new member list", async () => {
    seedGroup();
    const response = await join(ids.bob);
    expect(response.status).toBe(200);
    expect(response.body.data.memberIds).toEqual([String(ids.alice), String(ids.bob)]);
    expect(stored().memberIds.map(String)).toEqual([String(ids.alice), String(ids.bob)]);
  });

  it("answers 200 and writes nothing when the student is already in this group", async () => {
    seedGroup();
    const response = await join(ids.alice);
    expect(response.status).toBe(200);
    expect(response.body.data.memberIds).toEqual([String(ids.alice)]);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses a full group as 409 and leaves it unchanged", async () => {
    miniProject.maxGroupSize = 2;
    seedGroup({ memberIds: [ids.alice, ids.cara] });
    const response = await join(ids.bob);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("GROUP_FULL");
    expect(stored().memberIds).toHaveLength(2);
    // Capacity is part of the update's filter, not a separate read.
    expect(write.mock.calls[0][0]).toMatchObject({ "memberIds.1": { $exists: false } });
  });

  it("refuses a second group in the same project as 409 and leaves both unchanged", async () => {
    seedGroup();
    store.set(String(otherGroupId), {
      _id: otherGroupId,
      miniProjectId,
      name: "Team Spark",
      memberIds: [ids.bob],
      tasks: [],
      stageEvidence: {},
      updatedAt: loaded,
    });
    const response = await join(ids.bob);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ALREADY_IN");
    expect(stored().memberIds.map(String)).toEqual([String(ids.alice)]);
    expect(stored(otherGroupId).memberIds.map(String)).toEqual([String(ids.bob)]);
  });

  it("gives the last place to exactly one of two students joining at once", async () => {
    miniProject.maxGroupSize = 2;
    seedGroup();
    // Hold each request's first read until both have read, so both see the
    // free place. Only the update's own filter can then stop the second one.
    const read = ProjectGroup.findById.getMockImplementation();
    let release;
    const bothRead = new Promise((resolve) => (release = resolve));
    let reads = 0;
    ProjectGroup.findById.mockImplementation(async (id) => {
      const group = await read(id);
      if (++reads === 2) release();
      await bothRead;
      return group;
    });
    const responses = await Promise.all([join(ids.bob), join(ids.cara)]);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409).body.error.code).toBe("GROUP_FULL");
    expect(stored().memberIds).toHaveLength(2);
  });

  it.each([
    ["a student outside the classroom", ids.dan],
    ["a professor", ids.prof],
  ])("refuses %s as 403", async (_, callerId) => {
    seedGroup();
    const response = await join(callerId);
    expect(response.status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });

  it("answers a malformed id with 400 and a missing group with 404", async () => {
    expect((await join(ids.bob, "abc")).status).toBe(400);
    const missing = await join(ids.bob, String(new ObjectId()));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("GROUP_NOT_FOUND");
  });
});

describe("PUT /api/groups/:id/leave: leaving a group (UX audit A4)", () => {
  const taskId = new ObjectId();

  it("takes the member out, keeps their tasks without an owner and keeps others' owners", async () => {
    seedGroup({
      memberIds: [ids.alice, ids.bob],
      tasks: [
        { _id: taskId, title: "Find the bug", ownerId: ids.alice, status: "done" },
        { _id: new ObjectId(), title: "Write the test", ownerId: ids.bob, status: "todo" },
      ],
    });
    const response = await leave(ids.alice);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id: String(groupId), left: true, groupDeleted: false });
    expect(stored().memberIds.map(String)).toEqual([String(ids.bob)]);
    const [mine, bobs] = stored().tasks;
    expect(String(mine._id)).toBe(String(taskId));
    expect(mine).toMatchObject({ title: "Find the bug", status: "done" });
    expect(mine.ownerId).toBeUndefined();
    expect(String(bobs.ownerId)).toBe(String(ids.bob));
  });

  it("lets the student join another group in the project afterwards", async () => {
    seedGroup({ memberIds: [ids.alice, ids.bob] });
    store.set(String(otherGroupId), { ...stored(), _id: otherGroupId, memberIds: [ids.cara] });
    expect((await leave(ids.alice)).status).toBe(200);
    expect((await join(ids.alice, String(otherGroupId))).status).toBe(200);
  });

  it("deletes the group when its last member leaves", async () => {
    seedGroup();
    const response = await leave(ids.alice);
    expect(response.status).toBe(200);
    expect(response.body.data.groupDeleted).toBe(true);
    expect(stored()).toBeUndefined();
  });

  it.each(["submitted", "approved"])("refuses while the work is %s, as 409", async (status) => {
    seedGroup({ memberIds: [ids.alice, ids.bob], submissionStatus: status });
    const response = await leave(ids.alice);
    expect(response.status).toBe(409);
    expect(stored().memberIds).toHaveLength(2);
  });

  it("allows leaving a returned group", async () => {
    seedGroup({ memberIds: [ids.alice, ids.bob], submissionStatus: "returned" });
    expect((await leave(ids.alice)).status).toBe(200);
  });

  it("refuses as 409 when the group changed after it was read", async () => {
    seedGroup({ memberIds: [ids.alice, ids.bob] });
    ProjectGroup.findById.mockImplementationOnce(async () =>
      ProjectGroup.hydrate({ ...stored(), updatedAt: new Date(loaded.getTime() - 1000) }),
    );
    const response = await leave(ids.alice);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("GROUP_CHANGED");
    expect(stored().memberIds).toHaveLength(2);
  });

  it("refuses a non-member as 403, a malformed id as 400 and a missing group as 404", async () => {
    seedGroup();
    expect((await leave(ids.bob)).status).toBe(403);
    expect((await leave(undefined)).status).toBe(401);
    expect((await leave(ids.alice, "nope")).status).toBe(400);
    expect((await leave(ids.alice, String(new ObjectId()))).status).toBe(404);
    expect(stored().memberIds).toHaveLength(1);
  });
});

describe("PUT /api/groups/:id/tasks: creating and updating tasks (E-8)", () => {
  const taskId = new ObjectId();
  const existing = () => ({ _id: taskId, title: "Find the bug", ownerId: ids.alice, status: "todo" });

  it("creates a task with a new id, trimmed title and owner, and answers 200", async () => {
    seedGroup({ memberIds: [ids.alice, ids.bob] });
    const response = await saveTasks(ids.alice, [
      { title: "  Write the test  ", ownerId: String(ids.bob), status: "todo" },
    ]);
    expect(response.status).toBe(200);
    const [task] = response.body.data.tasks;
    expect(task).toMatchObject({
      title: "Write the test",
      ownerId: String(ids.bob),
      status: "todo",
      evidenceUrl: "",
    });
    expect(task.id).toMatch(/^[a-f0-9]{24}$/);
    expect(stored().tasks).toHaveLength(1);
    expect(response.body.data.updatedAt).not.toBe(loaded.toISOString());
  });

  it("updates an existing task in place, keeping its id", async () => {
    seedGroup({ tasks: [existing()] });
    const response = await saveTasks(ids.alice, [
      {
        id: String(taskId),
        title: "Find the bug",
        status: "done",
        evidenceUrl: "https://github.com/octo/demo/pull/1",
      },
    ]);
    expect(response.status).toBe(200);
    expect(response.body.data.tasks).toEqual([
      {
        id: String(taskId),
        title: "Find the bug",
        ownerId: null,
        status: "done",
        evidenceUrl: "https://github.com/octo/demo/pull/1",
      },
    ]);
    expect(String(stored().tasks[0]._id)).toBe(String(taskId));
  });

  it("replaces the whole list, so a task left out is deleted", async () => {
    seedGroup({ tasks: [existing()] });
    const response = await saveTasks(ids.alice, [{ title: "Only this one", status: "todo" }]);
    expect(response.status).toBe(200);
    expect(response.body.data.tasks.map((task) => task.title)).toEqual(["Only this one"]);
    expect(response.body.data.tasks[0].id).not.toBe(String(taskId));
  });

  it("refuses a save based on an old updatedAt as 409 and keeps the stored tasks", async () => {
    seedGroup({ tasks: [existing()] });
    const response = await saveTasks(ids.alice, [], "2026-10-19T08:00:00.000Z");
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("GROUP_CHANGED");
    expect(stored().tasks).toHaveLength(1);
  });

  it.each([
    ["a blank title", { title: " ", status: "todo" }, "tasks.0.title"],
    ["an unknown status", { title: "Test", status: "blocked" }, "tasks.0.status"],
    ["an owner outside the group", { title: "Test", status: "todo", ownerId: String(ids.bob) }, "tasks.0.ownerId"],
    ["an unsafe evidence link", { title: "Test", status: "todo", evidenceUrl: "javascript:alert(1)" }, "tasks.0.evidenceUrl"],
    ["a task id from another group", { id: String(new ObjectId()), title: "Test", status: "todo" }, "tasks.0.id"],
  ])("rejects %s as 400 and writes nothing", async (_, task, field) => {
    seedGroup();
    const response = await saveTasks(ids.alice, [task]);
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual([field]);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a save with no updatedAt as 400", async () => {
    seedGroup();
    const response = await call("put", `/api/groups/${groupId}/tasks`, ids.alice, { tasks: [] });
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(["updatedAt"]);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses a classmate outside the group as 403", async () => {
    seedGroup();
    const response = await saveTasks(ids.bob, [{ title: "Sneaky", status: "todo" }]);
    expect(response.status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("PUT /api/groups/:id/stages: saving stage evidence (E-5)", () => {
  it("saves only the stages sent and keeps the others", async () => {
    seedGroup({ stageEvidence: { Diagnose: "Old note", Repair: "Set the start to zero." } });
    const response = await saveStages(ids.alice, { Diagnose: "The counter starts at one." });
    expect(response.status).toBe(200);
    expect(response.body.data.stageEvidence).toEqual({
      Diagnose: "The counter starts at one.",
      Repair: "Set the start to zero.",
      Extend: "",
      Verify: "",
      Reflect: "",
    });
    expect(write.mock.calls[0][1]).toEqual({
      $set: { "stageEvidence.Diagnose": "The counter starts at one." },
    });
  });

  it.each([
    ["an unknown stage", { Hack: "x" }, ["stageEvidence.Hack"]],
    ["a stage that is not text", { Verify: 3 }, ["stageEvidence.Verify"]],
    ["an empty object", {}, ["stageEvidence"]],
    ["a list", ["Diagnose"], ["stageEvidence"]],
  ])("rejects %s as 400 and writes nothing", async (_, stageEvidence, expected) => {
    seedGroup();
    const response = await saveStages(ids.alice, stageEvidence);
    expect(response.status).toBe(400);
    expect(fields(response)).toEqual(expected);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses a classmate outside the group as 403", async () => {
    seedGroup();
    const response = await saveStages(ids.bob, { Diagnose: "Not mine" });
    expect(response.status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });
});
