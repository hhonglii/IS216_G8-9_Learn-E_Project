import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";
import { loadSessionUser } from "../src/middleware/sessionUser.js";
import { hashToken } from "../src/services/sessionService.js";
import { asyncHandler } from "../src/utils/asyncHandler.js";

const userId = new mongoose.Types.ObjectId();
const sessionId = new mongoose.Types.ObjectId();
const user = { _id: userId, displayName: "Alice", role: "student" };
const token = "issued-token";

function reqFor(authorization) {
  return {
    get: (name) => (name === "Authorization" ? authorization : undefined),
  };
}

async function run(authorization) {
  const req = reqFor(authorization);
  const next = vi.fn();
  await loadSessionUser(req, {}, next);
  return { req, next };
}

function expectInvalidSession(next) {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ status: 401, code: "INVALID_SESSION" }),
  );
}

let findSession;
let findUser;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  findSession = vi
    .spyOn(Session, "findOne")
    .mockResolvedValue({ _id: sessionId, userId });
  findUser = vi.spyOn(User, "findById").mockResolvedValue(user);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("loadSessionUser (G16 Step 5)", () => {
  it("continues with no user and no lookup when there is no header", async () => {
    const { req, next } = await run(undefined);
    expect(req.prototypeUser).toBeNull();
    expect(req.sessionId).toBeNull();
    expect(next).toHaveBeenCalledWith();
    expect(findSession).not.toHaveBeenCalled();
  });

  it("loads the session's user and remembers the session id", async () => {
    const { req, next } = await run(`Bearer ${token}`);
    expect(req.prototypeUser).toBe(user);
    expect(req.sessionId).toBe(sessionId);
    expect(next).toHaveBeenCalledWith();
    expect(findUser).toHaveBeenCalledWith(userId);
  });

  it("looks up the hash of the token alone, never the raw token or the header", async () => {
    await run(`Bearer ${token}`);
    const query = findSession.mock.calls[0][0];
    expect(query.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(query)).not.toContain(token);
  });

  it("asks only for a session that has not expired yet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    await run(`Bearer ${token}`);
    expect(findSession.mock.calls[0][0].expiresAt).toEqual({
      $gt: new Date("2026-10-27T12:00:00Z"),
    });
  });

  it.each([
    ["another scheme", "Basic abc"],
    ["a lower-case scheme", `bearer ${token}`],
    ["no token after Bearer", "Bearer "],
    ["the scheme alone", "Bearer"],
  ])("refuses %s with 401 and no lookup", async (_label, header) => {
    const { req, next } = await run(header);
    expectInvalidSession(next);
    expect(req.prototypeUser).toBeNull();
    expect(findSession).not.toHaveBeenCalled();
  });

  it("refuses a malformed header even with no database", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
    const { next } = await run("Basic abc");
    expectInvalidSession(next);
  });

  it("refuses an unknown or expired token with 401 and no user lookup", async () => {
    findSession.mockResolvedValue(null);
    const { req, next } = await run(`Bearer ${token}`);
    expectInvalidSession(next);
    expect(req.prototypeUser).toBeNull();
    expect(req.sessionId).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });

  it("refuses a session whose user no longer exists", async () => {
    findUser.mockResolvedValue(null);
    const { req, next } = await run(`Bearer ${token}`);
    expectInvalidSession(next);
    expect(req.prototypeUser).toBeNull();
    expect(req.sessionId).toBeNull();
  });

  it("does not wait on a database lookup while disconnected", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
    const { req, next } = await run(`Bearer ${token}`);
    expect(req.prototypeUser).toBeNull();
    expect(next).toHaveBeenCalledWith();
    expect(findSession).not.toHaveBeenCalled();
    expect(findUser).not.toHaveBeenCalled();
  });

  it("passes database failures on to the error handler, as the routes mount it", async () => {
    const error = new Error("database unavailable");
    findSession.mockRejectedValue(error);
    const next = vi.fn();
    await asyncHandler(loadSessionUser)(reqFor(`Bearer ${token}`), {}, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
