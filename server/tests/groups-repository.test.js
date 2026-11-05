// Test cases for slice F4.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import ProjectGroup from "../src/models/ProjectGroup.js";

// No live database, same approach as classrooms-join.test.js: readyState is
// mocked to 1 so loadSessionUser resolves the caller, and model methods are
// replaced per test.
const memberId = new mongoose.Types.ObjectId();
const outsiderId = new mongoose.Types.ObjectId();
const groupId = new mongoose.Types.ObjectId();
const users = {
  [String(memberId)]: { _id: memberId, displayName: "Alice", role: "student" },
  [String(outsiderId)]: { _id: outsiderId, displayName: "Bob", role: "student" },
};
const snapshot = {
  repository: { name: "old-repo" },
  commits: [],
  lastRefreshedAt: "2026-10-20T08:00:00.000Z",
};
const storedGroup = (fields = {}) =>
  ProjectGroup.hydrate({
    _id: groupId,
    miniProjectId: new mongoose.Types.ObjectId(),
    name: "Team Rocket",
    memberIds: [memberId],
    updatedAt: new Date("2026-10-20T08:00:00Z"),
    ...fields,
  });

function put(callerId, body, id = String(groupId)) {
  const req = request(createApp()).put(`/api/groups/${id}/repository`);
  if (callerId) req.set(...sessionHeader(callerId));
  return body === undefined ? req : req.send(body);
}

let findGroup;
let update;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  findGroup = vi.spyOn(ProjectGroup, "findById").mockResolvedValue(storedGroup());
  // Echo the $set back as the saved group, so the response reflects the write.
  update = vi
    .spyOn(ProjectGroup, "findOneAndUpdate")
    .mockImplementation(async (_filter, change) =>
      storedGroup({ ...change.$set, updatedAt: new Date("2026-10-23T08:00:00Z") }),
    );
});
afterEach(() => vi.restoreAllMocks());

describe("PUT /api/groups/:id/repository: who may attach", () => {
  it("rejects a request with no selected user as 401 without a lookup or write", async () => {
    const response = await put(null, { repositoryUrl: "https://github.com/octo/demo" });
    expect(response.status).toBe(401);
    expect(findGroup).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a malformed group id as 400", async () => {
    const response = await put(memberId, { repositoryUrl: "https://github.com/octo/demo" }, "abc");
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe("id");
    expect(update).not.toHaveBeenCalled();
  });

  it("answers a group that does not exist with 404", async () => {
    findGroup.mockResolvedValue(null);
    const response = await put(memberId, { repositoryUrl: "https://github.com/octo/demo" });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("GROUP_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses someone outside the group as 403 and writes nothing", async () => {
    const response = await put(outsiderId, { repositoryUrl: "https://github.com/octo/demo" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/groups/:id/repository: checking the link", () => {
  it.each([
    ["missing", {}],
    ["blank", { repositoryUrl: "   " }],
    ["a number", { repositoryUrl: 42 }],
    ["null", { repositoryUrl: null }],
  ])("rejects a link that is %s as 400 without a write", async (_, body) => {
    const response = await put(memberId, body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details.field).toBe("repositoryUrl");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a request with no body at all as 400, not a crash", async () => {
    const response = await put(memberId);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    "http://github.com/octo/demo",
    "https://github.com/octo/demo/tree/main",
    "https://github.com/octo",
    "https://gitlab.com/octo/demo",
  ])("rejects %s through the shared parser as 400", async (repositoryUrl) => {
    const response = await put(memberId, { repositoryUrl });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_GITHUB_REPOSITORY_URL");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/groups/:id/repository: saving", () => {
  it.each([
    "https://github.com/octo/demo",
    "  https://github.com/octo/demo  ",
    "https://github.com/octo/demo.git",
    "https://github.com/octo/demo/",
  ])("stores %j in the standard form", async (repositoryUrl) => {
    const response = await put(memberId, { repositoryUrl });
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1].$set).toEqual({
      repositoryUrl: "https://github.com/octo/demo",
    });
    expect(response.body.data.repositoryUrl).toBe("https://github.com/octo/demo");
  });

  it("only writes while the caller is still a member", async () => {
    await put(memberId, { repositoryUrl: "https://github.com/octo/demo" });
    const filter = update.mock.calls[0][0];
    expect(String(filter._id)).toBe(String(groupId));
    expect(String(filter.memberIds)).toBe(String(memberId));
  });

  it("returns the agreed DTO with the id as a string and no cache", async () => {
    const response = await put(memberId, { repositoryUrl: "https://github.com/octo/demo" });
    expect(Object.keys(response.body.data).sort()).toEqual(["id", "repositoryUrl", "updatedAt"]);
    expect(response.body.data.id).toBe(String(groupId));
  });

  it("answers 404 when the group or membership vanished before the write", async () => {
    update.mockResolvedValue(null);
    const response = await put(memberId, { repositoryUrl: "https://github.com/octo/demo" });
    expect(response.status).toBe(404);
  });
});

describe("PUT /api/groups/:id/repository: the cache (decision F-5)", () => {
  it("clears the old snapshot when the link changes", async () => {
    findGroup.mockResolvedValue(
      storedGroup({ repositoryUrl: "https://github.com/octo/old-repo", githubCache: snapshot }),
    );
    const response = await put(memberId, { repositoryUrl: "https://github.com/octo/demo" });
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1].$unset).toEqual({ githubCache: 1 });
  });

  it("clears it on the first attach too, so nothing stale can survive", async () => {
    await put(memberId, { repositoryUrl: "https://github.com/octo/demo" });
    expect(update.mock.calls[0][1].$unset).toEqual({ githubCache: 1 });
  });

  it.each(["https://github.com/octo/demo", "https://github.com/octo/demo.git"])(
    "changes nothing when %s is the link already attached",
    async (repositoryUrl) => {
      findGroup.mockResolvedValue(
        storedGroup({ repositoryUrl: "https://github.com/octo/demo", githubCache: snapshot }),
      );
      const response = await put(memberId, { repositoryUrl });
      expect(response.status).toBe(200);
      expect(response.body.data.repositoryUrl).toBe("https://github.com/octo/demo");
      expect(update).not.toHaveBeenCalled();
    },
  );
});
