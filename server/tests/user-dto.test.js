import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import { toUserResponse } from "../src/utils/userDto.js";

const id = new mongoose.Types.ObjectId();

describe("toUserResponse (G16 Step 1)", () => {
  it("returns exactly id, username, displayName and role, with a string id", () => {
    expect(
      toUserResponse({
        _id: id,
        username: "alice",
        displayName: "Alice",
        role: "student",
      }),
    ).toEqual({
      id: String(id),
      username: "alice",
      displayName: "Alice",
      role: "student",
    });
  });

  it("sends username as null for a user created before login existed", () => {
    expect(
      toUserResponse({ _id: id, displayName: "Prof Tan", role: "professor" })
        .username,
    ).toBeNull();
  });

  it("never copies passwordHash or other stored fields, even when loaded", () => {
    const response = toUserResponse({
      _id: id,
      username: "alice",
      displayName: "Alice",
      role: "student",
      passwordHash: "scrypt$salt$hash",
      createdAt: new Date(),
    });
    expect(Object.keys(response).sort()).toEqual([
      "displayName",
      "id",
      "role",
      "username",
    ]);
    expect(JSON.stringify(response)).not.toContain("scrypt$");
  });
});

describe("User schema login fields (G16 Step 1)", () => {
  it("never returns passwordHash from a normal query", () => {
    expect(User.schema.path("passwordHash").options.select).toBe(false);
  });

  it("stores usernames trimmed and lower-case", () => {
    const user = new User({
      username: "  Alice.Tan ",
      displayName: "Alice",
      role: "student",
    });
    expect(user.username).toBe("alice.tan");
  });

  it("keeps username optional, so records from before login still validate", async () => {
    await expect(
      new User({ displayName: "Prof Tan", role: "professor" }).validate(),
    ).resolves.toBeUndefined();
  });

  it("makes username unique, skipping users that have none", () => {
    expect(User.schema.indexes()).toContainEqual([
      { username: 1 },
      expect.objectContaining({ unique: true, sparse: true }),
    ]);
  });
});
