import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
} from "../src/services/passwordService.js";

describe("hashPassword and verifyPassword (G16 Step 2)", () => {
  it("stores scrypt$<16-byte salt>$<64-byte hash>, never the password", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored).not.toContain("correct horse");
  });

  it("verifies the same password and refuses a different one", async () => {
    const stored = await hashPassword("correct horse");
    await expect(verifyPassword("correct horse", stored)).resolves.toBe(true);
    await expect(verifyPassword("correct horsf", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("salts each hash, so the same password gives two different strings", async () => {
    const first = await hashPassword("correct horse");
    const second = await hashPassword("correct horse");
    expect(first).not.toBe(second);
    await expect(verifyPassword("correct horse", second)).resolves.toBe(true);
  });

  it("treats a user with no stored hash as a wrong password, not an error", async () => {
    await expect(verifyPassword("anything", undefined)).resolves.toBe(false);
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
  });

  it.each([
    ["another method's label", (s) => s.replace(/^scrypt/, "bcrypt")],
    ["a fourth part", (s) => `${s}$extra`],
    ["no label", (s) => s.slice("scrypt$".length)],
    ["an empty hash part", (s) => s.slice(0, s.lastIndexOf("$") + 1)],
    ["a shortened hash", (s) => s.slice(0, -2)],
  ])("refuses a stored value with %s", async (_label, damage) => {
    const stored = damage(await hashPassword("correct horse"));
    await expect(verifyPassword("correct horse", stored)).resolves.toBe(false);
  });

  it("refuses any password against a record whose hash part is empty", async () => {
    await expect(verifyPassword("x", "scrypt$abcd$")).resolves.toBe(false);
  });
});

describe("passwordProblem (G16 Step 2)", () => {
  it.each([
    ["8 characters", "a".repeat(8)],
    ["128 characters", "a".repeat(128)],
    ["spaces, which are kept", "  pass word  "],
  ])("accepts %s", (_label, plain) => {
    expect(passwordProblem(plain)).toBeNull();
  });

  it.each([
    ["7 characters", "a".repeat(7)],
    ["129 characters", "a".repeat(129)],
    ["an empty string", ""],
    ["a number", 12345678],
    ["nothing", undefined],
  ])("refuses %s", (_label, plain) => {
    expect(passwordProblem(plain)).toBe("Password must be 8 to 128 characters.");
  });
});
