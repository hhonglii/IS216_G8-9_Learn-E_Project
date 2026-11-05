// Test cases for slice F5.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import { environment } from "../src/config/environment.js";
import User from "../src/models/User.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import MiniProject from "../src/models/MiniProject.js";
import Classroom from "../src/models/Classroom.js";

// No live database and no real GitHub: readyState is mocked to 1 so the
// caller resolves, model methods are replaced per test, and fetch is a fake
// that answers by address like github.test.js.
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
const repositoryUrl = "https://github.com/octo/demo";
const oldCache = {
  repository: { name: "demo", description: "Old" },
  commits: [],
  lastRefreshedAt: "2026-10-20T08:00:00.000Z",
};
const storedGroup = (fields = {}) =>
  ProjectGroup.hydrate({
    _id: groupId,
    miniProjectId,
    name: "Team Rocket",
    memberIds: [memberId],
    repositoryUrl,
    githubCache: oldCache,
    ...fields,
  });

const apiUrl = "https://api.github.com/repos/octo/demo";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const repoBody = {
  name: "demo",
  description: "Fresh",
  language: "JavaScript",
  default_branch: "main",
  updated_at: "2026-10-22T08:00:00Z",
  private: false,
};
const commitBody = {
  sha: "abc123",
  html_url: "https://github.com/octo/demo/commit/abc123",
  commit: { message: "First", author: { name: "Alice", date: "2026-10-22T08:00:00Z" } },
};
function fakeGitHub({ repo = () => json(repoBody), commits = () => json([commitBody]) } = {}) {
  return vi.fn(async (url) => {
    const address = String(url);
    if (address.startsWith(`${apiUrl}/commits`)) return commits();
    if (address.startsWith(`${apiUrl}/contributors`)) return json([]);
    if (address.startsWith(apiUrl)) return repo();
    throw new Error(`Unexpected request to ${address}`);
  });
}

function refresh(callerId, id = String(groupId)) {
  const req = request(createApp()).post(`/api/groups/${id}/github/refresh`);
  return callerId ? req.set(...sessionHeader(callerId)) : req;
}

let findGroup;
let findMiniProject;
let findClassroom;
let update;
let fetch;
let savedToken;
beforeEach(() => {
  savedToken = environment.githubToken;
  environment.githubToken = "";
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  findGroup = vi.spyOn(ProjectGroup, "findById").mockResolvedValue(storedGroup());
  findMiniProject = vi
    .spyOn(MiniProject, "findById")
    .mockResolvedValue({ _id: miniProjectId, classroomId });
  findClassroom = vi
    .spyOn(Classroom, "findById")
    .mockResolvedValue({ _id: classroomId, professorId: ownerId });
  // Echo the $set back as the saved group, so the response reflects the write.
  update = vi
    .spyOn(ProjectGroup, "findOneAndUpdate")
    .mockImplementation(async (_filter, change) => storedGroup(change.$set));
  fetch = fakeGitHub();
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  environment.githubToken = savedToken;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/groups/:id/github/refresh: who may refresh (decision F-3)", () => {
  it("rejects a request with no selected user as 401 without a lookup or GitHub call", async () => {
    const response = await refresh(null);
    expect(response.status).toBe(401);
    expect(findGroup).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a malformed group id as 400", async () => {
    const response = await refresh(memberId, "abc");
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe("id");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers a group that does not exist with 404", async () => {
    findGroup.mockResolvedValue(null);
    const response = await refresh(memberId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("GROUP_NOT_FOUND");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lets a member refresh without the professor lookups", async () => {
    const response = await refresh(memberId);
    expect(response.status).toBe(200);
    expect(findMiniProject).not.toHaveBeenCalled();
    expect(findClassroom).not.toHaveBeenCalled();
  });

  it("lets the professor who owns the classroom refresh", async () => {
    const response = await refresh(ownerId);
    expect(response.status).toBe(200);
    expect(String(findMiniProject.mock.calls[0][0])).toBe(String(miniProjectId));
    expect(String(findClassroom.mock.calls[0][0])).toBe(String(classroomId));
  });

  it.each([
    ["a student outside the group", outsiderId],
    ["a professor who does not own the classroom", otherProfessorId],
  ])("refuses %s as 403 and asks GitHub nothing", async (_, callerId) => {
    const response = await refresh(callerId);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(fetch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ["mini-project", () => findMiniProject.mockResolvedValue(null)],
    ["classroom", () => findClassroom.mockResolvedValue(null)],
  ])("answers 403, not a crash, when the %s is missing", async (_, breakIt) => {
    breakIt();
    const response = await refresh(ownerId);
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/groups/:id/github/refresh: a link must be attached", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("answers 409 when the link is %s and never calls GitHub", async (_, value) => {
    findGroup.mockResolvedValue(storedGroup({ repositoryUrl: value, githubCache: undefined }));
    const response = await refresh(memberId);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("REPOSITORY_NOT_ATTACHED");
    expect(fetch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("POST /api/groups/:id/github/refresh: saving after success", () => {
  it("saves the fresh snapshot with a new time and returns it", async () => {
    const before = Date.now();
    const response = await refresh(memberId);
    expect(response.status).toBe(200);

    const saved = update.mock.calls[0][1].$set.githubCache;
    expect(saved.repository.description).toBe("Fresh");
    expect(saved.commits.map((commit) => commit.sha)).toEqual(["abc123"]);
    expect(Date.parse(saved.lastRefreshedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(saved.lastRefreshedAt).not.toBe(oldCache.lastRefreshedAt);

    expect(response.body.data).toMatchObject({
      repositoryUrl,
      repository: saved.repository,
      commits: saved.commits,
      lastRefreshedAt: saved.lastRefreshedAt,
    });
  });

  it("only saves while the link is still the one it fetched", async () => {
    await refresh(memberId);
    const filter = update.mock.calls[0][0];
    expect(String(filter._id)).toBe(String(groupId));
    expect(filter.repositoryUrl).toBe(repositoryUrl);
  });

  it("asks GitHub for the attached repository only", async () => {
    await refresh(memberId);
    const addresses = fetch.mock.calls.map(([url]) => new URL(String(url)));
    expect(addresses.every((url) => url.origin === "https://api.github.com")).toBe(true);
    expect(addresses.some((url) => url.pathname === "/repos/octo/demo")).toBe(true);
  });

  it("saves an empty repository as a snapshot with no commits", async () => {
    fetch = fakeGitHub({ commits: () => json({ message: "Git Repository is empty." }, 409) });
    vi.stubGlobal("fetch", fetch);
    const response = await refresh(memberId);
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1].$set.githubCache.commits).toEqual([]);
  });

  it("answers 409 when the link changed during the refresh", async () => {
    update.mockResolvedValue(null);
    const response = await refresh(memberId);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("REPOSITORY_CHANGED");
  });
});

describe("POST /api/groups/:id/github/refresh: a failure keeps the old snapshot (decision F-6)", () => {
  it.each([
    ["missing", { repo: () => json({ message: "Not Found" }, 404) }, 404, "GITHUB_REPOSITORY_NOT_FOUND"],
    ["private", { repo: () => json({ ...repoBody, private: true }) }, 400, "GITHUB_REPOSITORY_PRIVATE"],
    ["rate limited", { repo: () => json({ message: "API rate limit exceeded" }, 403) }, 429, "GITHUB_RATE_LIMITED"],
    ["down", { repo: () => json({ message: "Server Error" }, 500) }, 502, "GITHUB_UNAVAILABLE"],
    ["failing on commits only", { commits: () => json({ message: "Server Error" }, 500) }, 502, "GITHUB_UNAVAILABLE"],
  ])("names a %s repository and saves nothing", async (_, replies, status, code) => {
    vi.stubGlobal("fetch", fakeGitHub(replies));
    const response = await refresh(memberId);
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(response.body.data).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("saves nothing when GitHub cannot be reached at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const response = await refresh(memberId);
    expect(response.status).toBe(502);
    expect(update).not.toHaveBeenCalled();
  });
});
