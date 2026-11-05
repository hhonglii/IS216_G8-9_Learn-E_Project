import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";
import {
  hashPassword,
  verifyPassword,
} from "../src/services/passwordService.js";

// No live database. The session helper fakes Session.findOne; User.findById
// answers both the middleware's plain lookup (no hash, as select: false does)
// and changePassword's .select("+passwordHash") reload.
const callerId = new mongoose.Types.ObjectId();
const currentPassword = "old password";
let stored;
let findById;
let selectHash;

beforeEach(async () => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  stored = {
    _id: callerId,
    username: "alice.t",
    displayName: "Alice",
    role: "student",
    passwordHash: await hashPassword(currentPassword),
  };
  selectHash = vi.fn(async () => stored);
  findById = vi.spyOn(User, "findById").mockImplementation((id) => {
    if (String(id) !== String(callerId)) {
      return Object.assign(Promise.resolve(null), {
        select: async () => null,
      });
    }
    const { passwordHash: _hidden, ...withoutHash } = stored;
    return Object.assign(Promise.resolve(withoutHash), { select: selectHash });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("PUT /api/users/me (G16 Step 6)", () => {
  let update;
  beforeEach(() => {
    update = vi
      .spyOn(User, "findByIdAndUpdate")
      .mockImplementation(async (_id, change) => ({
        ...stored,
        ...change.$set,
      }));
  });

  function put(body, caller = callerId) {
    const pending = request(createApp()).put("/api/users/me");
    return (caller ? pending.set(...sessionHeader(caller)) : pending).send(
      body,
    );
  }

  it("saves the trimmed display name and returns the user response", async () => {
    const response = await put({ displayName: "  Ally  " });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: String(callerId),
        username: "alice.t",
        displayName: "Ally",
        role: "student",
      },
    });
    expect(update).toHaveBeenCalledWith(
      callerId,
      { $set: { displayName: "Ally" } },
      { returnDocument: "after" },
    );
    expect(JSON.stringify(response.body)).not.toContain("scrypt");
  });

  it("changes only the caller's display name, ignoring every other field", async () => {
    const otherId = new mongoose.Types.ObjectId();
    await put({
      displayName: "Ally",
      role: "professor",
      username: "someone.else",
      passwordHash: "scrypt$00$00",
      _id: String(otherId),
      id: String(otherId),
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe(callerId);
    expect(update.mock.calls[0][1]).toEqual({ $set: { displayName: "Ally" } });
  });

  it.each([
    ["one-character", "A"],
    ["60-character", "n".repeat(60)],
  ])("accepts a %s name", async (_label, displayName) => {
    expect((await put({ displayName })).status).toBe(200);
  });

  it.each([
    ["missing", {}],
    ["non-string", { displayName: 42 }],
    ["empty", { displayName: "" }],
    ["blank", { displayName: "   " }],
    ["61-character", { displayName: "n".repeat(61) }],
  ])("rejects a %s name with 400 and no write", async (_label, body) => {
    const response = await put(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "VALIDATION_FAILED",
      message: "Check the highlighted fields.",
      details: [{ field: "displayName", message: expect.any(String) }],
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a request with no session, without a write", async () => {
    const response = await put({ displayName: "Ally" }, null);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(update).not.toHaveBeenCalled();
  });

  it("answers 401 when the user was deleted after the session check", async () => {
    update.mockResolvedValue(null);
    const response = await put({ displayName: "Ally" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("hides database failures behind a 500", async () => {
    update.mockRejectedValue(new Error("private-db-detail"));
    const response = await put({ displayName: "Ally" });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
  });
});

describe("PUT /api/users/me/password (G16 Step 6)", () => {
  let updateOne;
  let deleteMany;
  beforeEach(() => {
    updateOne = vi.spyOn(User, "updateOne").mockResolvedValue({});
    deleteMany = vi.spyOn(Session, "deleteMany").mockResolvedValue({});
  });

  function put(body, caller = callerId) {
    const pending = request(createApp()).put("/api/users/me/password");
    return (caller ? pending.set(...sessionHeader(caller)) : pending).send(
      body,
    );
  }

  const valid = { currentPassword, newPassword: "new password" };

  function expectNoWrites() {
    expect(updateOne).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  }

  it("answers 204 with no body after saving a hash of the new password", async () => {
    const response = await put(valid);
    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(selectHash).toHaveBeenCalledWith("+passwordHash");
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, change] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: callerId });
    expect(Object.keys(change.$set)).toEqual(["passwordHash"]);
    const newHash = change.$set.passwordHash;
    expect(newHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("new password", newHash)).toBe(true);
    expect(await verifyPassword(currentPassword, newHash)).toBe(false);
  });

  it("ends the caller's other sessions but keeps this one", async () => {
    await put(valid);
    expect(deleteMany).toHaveBeenCalledWith({
      userId: callerId,
      _id: { $ne: `session-${callerId}` },
    });
  });

  it.each([
    ["a wrong", { currentPassword: "not my password" }],
    ["a missing", { currentPassword: undefined }],
    ["a non-string", { currentPassword: 12345678 }],
  ])(
    "refuses %s current password with 401 and no write",
    async (_label, change) => {
      const response = await put({ ...valid, ...change });
      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({
        code: "INVALID_CREDENTIALS",
        message: "Current password is incorrect.",
        details: null,
      });
      expectNoWrites();
    },
  );

  it("refuses a user who has no password yet", async () => {
    delete stored.passwordHash;
    const response = await put(valid);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expectNoWrites();
  });

  it.each([
    ["missing", undefined],
    ["7-character", "1234567"],
    ["129-character", "p".repeat(129)],
  ])(
    "rejects a %s new password with 400 and no write",
    async (_label, newPassword) => {
      const response = await put({ currentPassword, newPassword });
      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields.",
        details: [
          {
            field: "newPassword",
            message: "Password must be 8 to 128 characters.",
          },
        ],
      });
      expectNoWrites();
    },
  );

  it("checks the current password before the new one", async () => {
    const response = await put({
      currentPassword: "wrong one",
      newPassword: "x",
    });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("ignores every field except the two passwords", async () => {
    await put({ ...valid, role: "professor", displayName: "Mallory" });
    expect(Object.keys(updateOne.mock.calls[0][1].$set)).toEqual([
      "passwordHash",
    ]);
  });

  it("rejects a request with no session, without a lookup or write", async () => {
    const response = await put(valid, null);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(findById).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("hides database failures behind a 500", async () => {
    updateOne.mockRejectedValue(new Error("private-db-detail"));
    const response = await put(valid);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
  });
});
