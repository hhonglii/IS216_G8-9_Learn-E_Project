// Test cases for slices F6 Step 1 and G8 Step 1.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import MiniProject from "../src/models/MiniProject.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";
import ProjectGroup from "../src/models/ProjectGroup.js";

// Checks the three GitHub fields Get mini-project adds to each group for the
// page (repositoryUrl, github, lastRefreshedAt), F7's contributors inside
// github, and G8's submission fields (submissionStatus, reflection,
// professorFeedback), with mocked models and no database. The browser side is
// covered by client/e2e/mini-project-github.spec.js and mini-project-submit.spec.js.
const studentId = new mongoose.Types.ObjectId();
const professorId = new mongoose.Types.ObjectId();
const classroomId = new mongoose.Types.ObjectId();
const miniProjectId = new mongoose.Types.ObjectId();
const attachedId = new mongoose.Types.ObjectId();
const bareId = new mongoose.Types.ObjectId();
const users = {
  [String(studentId)]: { _id: studentId, displayName: "Alice", role: "student" },
  [String(professorId)]: { _id: professorId, displayName: "Prof Tan", role: "professor" },
};
const githubCache = {
  repository: { name: "demo", description: "Saved", language: "JavaScript" },
  commits: [{ sha: "abc123", message: "Fix the loop" }],
  contributors: [{ login: "alice", commits: 12, url: "https://github.com/alice" }],
  lastRefreshedAt: "2026-10-22T09:00:00.000Z",
};
const group = (id, fields = {}) =>
  ProjectGroup.hydrate({
    _id: id,
    miniProjectId,
    name: `Group ${String(id).slice(-4)}`,
    memberIds: [],
    tasks: [],
    ...fields,
  });

let groups;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  vi.spyOn(User, "find").mockResolvedValue([{ _id: studentId, displayName: "Alice" }]);
  vi.spyOn(MiniProject, "findById").mockResolvedValue(
    MiniProject.hydrate({
      _id: miniProjectId,
      classroomId,
      title: "Repair the counter app",
      brief: "Find and fix the counter bug.",
      maxGroupSize: 4,
      acceptanceCriteria: ["Counter starts at zero"],
      status: "published",
    }),
  );
  vi.spyOn(Classroom, "findById").mockResolvedValue({ _id: classroomId, professorId });
  vi.spyOn(Membership, "findOne").mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
  groups = [
    group(attachedId, {
      memberIds: [studentId],
      repositoryUrl: "https://github.com/octo/demo",
      githubCache,
    }),
    group(bareId),
  ];
  vi.spyOn(ProjectGroup, "find").mockImplementation(async () => groups);
});
afterEach(() => vi.restoreAllMocks());

const getAs = (userId) =>
  request(createApp())
    .get(`/api/mini-projects/${miniProjectId}`)
    .set(...sessionHeader(userId));

describe("GET /api/mini-projects/:id: saved GitHub data (F6)", () => {
  it("gives a member their group's link, snapshot and time without asking GitHub", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await getAs(studentId);
    expect(response.status).toBe(200);
    const { myGroup } = response.body.data;
    expect(myGroup.repositoryUrl).toBe("https://github.com/octo/demo");
    expect(myGroup.github).toEqual({
      repository: githubCache.repository,
      commits: githubCache.commits,
      contributors: githubCache.contributors,
    });
    expect(myGroup.lastRefreshedAt).toBe(githubCache.lastRefreshedAt);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the time out of the github object, since the panel takes it separately", async () => {
    const response = await getAs(studentId);
    expect(response.body.data.myGroup.github).not.toHaveProperty("lastRefreshedAt");
  });

  it("sends an empty link, null snapshot and null time for a group with nothing attached", async () => {
    groups = [group(bareId, { memberIds: [studentId] })];
    const response = await getAs(studentId);
    expect(response.body.data.myGroup).toMatchObject({
      repositoryUrl: "",
      github: null,
      lastRefreshedAt: null,
    });
  });

  it("sends a link with no snapshot yet as attached but never refreshed", async () => {
    groups = [group(attachedId, { memberIds: [studentId], repositoryUrl: "https://github.com/octo/demo" })];
    const response = await getAs(studentId);
    expect(response.body.data.myGroup).toMatchObject({
      repositoryUrl: "https://github.com/octo/demo",
      github: null,
      lastRefreshedAt: null,
    });
  });

  it("sends contributors as null, not [], for a snapshot saved before F7", async () => {
    const { contributors, ...beforeF7 } = githubCache;
    groups = [group(attachedId, { memberIds: [studentId], repositoryUrl: "https://github.com/octo/demo", githubCache: beforeF7 })];
    const response = await getAs(studentId);
    expect(response.body.data.myGroup.github.contributors).toBeNull();
    expect(response.body.data.myGroup.github.commits).toEqual(githubCache.commits);
  });

  it("keeps an empty contributors list as [] (an empty repository)", async () => {
    groups = [
      group(attachedId, {
        memberIds: [studentId],
        repositoryUrl: "https://github.com/octo/demo",
        githubCache: { ...githubCache, commits: [], contributors: [] },
      }),
    ];
    const response = await getAs(studentId);
    expect(response.body.data.myGroup.github.contributors).toEqual([]);
  });

  it("gives the owning professor the same fields on every workspace", async () => {
    const response = await getAs(professorId);
    expect(response.status).toBe(200);
    const byId = Object.fromEntries(response.body.data.workspaces.map((w) => [w.id, w]));
    expect(byId[String(attachedId)].github.commits).toEqual(githubCache.commits);
    expect(byId[String(attachedId)].lastRefreshedAt).toBe(githubCache.lastRefreshedAt);
    expect(byId[String(bareId)]).toMatchObject({ repositoryUrl: "", github: null, lastRefreshedAt: null });
  });

  it("keeps other groups' GitHub data out of the public group list", async () => {
    const response = await getAs(studentId);
    for (const listed of response.body.data.groups) {
      expect(Object.keys(listed).sort()).toEqual(["id", "memberIds", "name"]);
    }
  });
});

describe("GET /api/mini-projects/:id: submission fields (G8)", () => {
  it("gives a member their group's status, reflection and feedback", async () => {
    groups = [
      group(attachedId, {
        memberIds: [studentId],
        submissionStatus: "returned",
        reflection: "We fixed the loop.",
        professorFeedback: "Add a test for zero.",
      }),
    ];
    const response = await getAs(studentId);
    expect(response.status).toBe(200);
    expect(response.body.data.myGroup).toMatchObject({
      submissionStatus: "returned",
      reflection: "We fixed the loop.",
      professorFeedback: "Add a test for zero.",
    });
  });

  it("sends a group that never submitted as draft with empty strings, not missing keys", async () => {
    groups = [group(bareId, { memberIds: [studentId] })];
    const { myGroup } = (await getAs(studentId)).body.data;
    expect(myGroup.submissionStatus).toBe("draft");
    expect(myGroup.reflection).toBe("");
    expect(myGroup.professorFeedback).toBe("");
  });

  it("gives the owning professor the same fields on every workspace", async () => {
    groups = [
      group(attachedId, { submissionStatus: "submitted", reflection: "Ready." }),
      group(bareId),
    ];
    const response = await getAs(professorId);
    const byId = Object.fromEntries(response.body.data.workspaces.map((w) => [w.id, w]));
    expect(byId[String(attachedId)]).toMatchObject({
      submissionStatus: "submitted",
      reflection: "Ready.",
      professorFeedback: "",
    });
    expect(byId[String(bareId)]).toMatchObject({
      submissionStatus: "draft",
      reflection: "",
      professorFeedback: "",
    });
  });
});
