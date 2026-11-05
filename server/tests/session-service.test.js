import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import Session from "../src/models/Session.js";
import { hashToken, startSession } from "../src/services/sessionService.js";

const userId = new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("hashToken (G16 Step 3)", () => {
  it("is SHA-256 as 64 hex characters", () => {
    // The published SHA-256 test vector for "abc".
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("gives the same hash for the same token, so a lookup can find it", () => {
    expect(hashToken("same-token")).toBe(hashToken("same-token"));
    expect(hashToken("same-token")).not.toBe(hashToken("same-tokem"));
  });
});

describe("startSession (G16 Step 3)", () => {
  it("stores only the token's hash and returns the token itself", async () => {
    const create = vi.spyOn(Session, "create").mockResolvedValue({});
    const token = await startSession(userId);
    expect(create).toHaveBeenCalledTimes(1);
    const saved = create.mock.calls[0][0];
    expect(Object.keys(saved).sort()).toEqual([
      "expiresAt",
      "tokenHash",
      "userId",
    ]);
    expect(saved.userId).toBe(userId);
    expect(saved.tokenHash).toBe(hashToken(token));
    expect(saved.tokenHash).not.toBe(token);
    expect(JSON.stringify(saved)).not.toContain(token);
  });

  it("makes a 32-byte base64url token, safe to send in a header", async () => {
    vi.spyOn(Session, "create").mockResolvedValue({});
    const token = await startSession(userId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("gives every session a different token", async () => {
    vi.spyOn(Session, "create").mockResolvedValue({});
    const tokens = new Set();
    for (let i = 0; i < 20; i += 1) tokens.add(await startSession(userId));
    expect(tokens.size).toBe(20);
  });

  it("expires the session 7 days from now", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const create = vi.spyOn(Session, "create").mockResolvedValue({});
    await startSession(userId);
    expect(create.mock.calls[0][0].expiresAt).toEqual(
      new Date("2026-11-02T12:00:00Z"),
    );
  });

  it("gives no token when the session could not be saved", async () => {
    vi.spyOn(Session, "create").mockRejectedValue(new Error("db down"));
    await expect(startSession(userId)).rejects.toThrow("db down");
  });
});

describe("Session schema (G16 Step 3)", () => {
  it("requires userId, tokenHash and expiresAt", async () => {
    const error = await new Session({}).validate().catch((e) => e);
    expect(Object.keys(error.errors).sort()).toEqual([
      "expiresAt",
      "tokenHash",
      "userId",
    ]);
  });

  it("stores expiresAt as a date and tokenHash as text", async () => {
    const session = new Session({
      userId,
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + DAY),
    });
    await expect(session.validate()).resolves.toBeUndefined();
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(session.tokenHash).toBe("a".repeat(64));
  });

  it("keeps hashes unique and lets MongoDB delete expired sessions", () => {
    const indexes = Session.schema.indexes();
    expect(indexes).toContainEqual([
      { tokenHash: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    expect(indexes).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
  });
});
