// Test cases for slice A5a.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import { readFile } from "node:fs/promises";
import { coverIds } from "../src/config/covers.js";

// No live database. loadSessionUser only looks the caller up when readyState
// is 1, so it is mocked to 1 here (the user tests mock 0 because they need no
// caller). Persistence against Atlas stays a manual check (guide section 7,
// A5-A6 "verify the write, not just the message").
const professorId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const otherId = new mongoose.Types.ObjectId();
const users = {
  [String(professorId)]: {
    _id: professorId,
    displayName: "Prof Tan",
    role: "professor",
  },
  [String(studentId)]: { _id: studentId, displayName: "Alice", role: "student" },
};

function duplicateKeyError() {
  return Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
}

function post(callerId) {
  const req = request(createApp()).post("/api/classrooms");
  return callerId ? req.set(...sessionHeader(callerId)) : req;
}

let create;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(
    async (id) => users[String(id)] ?? null,
  );
  create = vi
    .spyOn(Classroom, "create")
    .mockImplementation(async (fields) => ({
      _id: new mongoose.Types.ObjectId(),
      ...fields,
    }));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/classrooms: who may create", () => {
  it("rejects a request with no selected user as 401 without a write", async () => {
    const response = await post().send({ name: "WAD2" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a student as 403 without a write", async () => {
    const response = await post(studentId).send({ name: "WAD2" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(create).not.toHaveBeenCalled();
  });

  it("still rejects a student who claims a professor as owner in the body", async () => {
    const response = await post(studentId).send({
      name: "WAD2",
      professorId: String(professorId),
      role: "professor",
    });
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/classrooms: input validation", () => {
  it.each([
    ["missing", {}],
    ["blank", { name: "   " }],
    ["empty", { name: "" }],
    ["non-string", { name: 42 }],
    ["null", { name: null }],
  ])("rejects a %s name as 400 without a write", async (_label, body) => {
    const response = await post(professorId).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toEqual({ field: "name" });
    expect(create).not.toHaveBeenCalled();
  });

  // Express 5 leaves req.body undefined when no body is sent. Expected to fail
  // with a 500 until A5 close-out Step 3 is done.
  it("rejects a request with no body at all as 400, not a crash", async () => {
    const response = await post(professorId);
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual({ field: "name" });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["number", 7],
    ["object", { text: "hi" }],
    ["array", ["hi"]],
  ])("rejects a %s description as 400 without a write", async (_label, description) => {
    const response = await post(professorId).send({ name: "WAD2", description });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual({ field: "description" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/classrooms: successful creation", () => {
  it("creates the classroom with a trimmed name and returns 201 with its DTO", async () => {
    const response = await post(professorId).send({
      name: "  WAD2 G10  ",
      description: "Web app dev",
    });
    expect(response.status).toBe(201);
    const { data } = response.body;
    expect(data).toEqual({
      id: expect.any(String),
      name: "WAD2 G10",
      description: "Web app dev",
      joinCode: expect.any(String),
      coverId: "default",
      professorId: String(professorId),
    });
    expect(data.id).toMatch(/^[a-f0-9]{24}$/);
    expect(data.joinCode.length).toBeGreaterThan(0);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      name: "WAD2 G10",
      description: "Web app dev",
      professorId,
    });
  });

  it("accepts a missing description", async () => {
    const response = await post(professorId).send({ name: "WAD2" });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("takes the owner from the caller and the code from the server, never the body", async () => {
    const response = await post(professorId).send({
      name: "WAD2",
      professorId: String(otherId),
      joinCode: "HACKED",
      _id: String(otherId),
    });
    expect(response.status).toBe(201);
    const fields = create.mock.calls[0][0];
    expect(String(fields.professorId)).toBe(String(professorId));
    expect(fields.joinCode).not.toBe("HACKED");
    expect(fields).not.toHaveProperty("_id");
    expect(response.body.data.professorId).toBe(String(professorId));
  });

  it("generates a different join code across separate classrooms", async () => {
    const codes = new Set();
    for (let i = 0; i < 5; i++) {
      const response = await post(professorId).send({ name: `Class ${i}` });
      codes.add(response.body.data.joinCode);
    }
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("POST /api/classrooms: cover choice (decision G-10)", () => {
  it("saves and returns a listed cover", async () => {
    const response = await post(professorId).send({
      name: "WAD2",
      coverId: "teal-loop",
    });
    expect(response.status).toBe(201);
    expect(create.mock.calls[0][0].coverId).toBe("teal-loop");
    expect(response.body.data.coverId).toBe("teal-loop");
  });

  it("creates the classroom without a cover and reports the default", async () => {
    const response = await post(professorId).send({ name: "WAD2" });
    expect(response.status).toBe(201);
    expect(create.mock.calls[0][0].coverId).toBeUndefined();
    expect(response.body.data.coverId).toBe("default");
  });

  it.each([
    ["unknown id", "purple-stars"],
    ["file path", "/covers/default.svg"],
    ["number", 3],
    ["null", null],
    ["array", ["default"]],
  ])("rejects a cover that is a %s as 400 without a write", async (_label, coverId) => {
    const response = await post(professorId).send({ name: "WAD2", coverId });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toEqual({ field: "coverId" });
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps the server's cover ids the same as the client's list", async () => {
    const client = await readFile(
      new URL("../../client/src/config/covers.js", import.meta.url),
      "utf8",
    );
    const clientIds = [...client.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
    expect(clientIds).toEqual(coverIds);
  });
});

describe("POST /api/classrooms: join code collisions", () => {
  it("retries with a new code after one duplicate-key collision and returns 201", async () => {
    create.mockRejectedValueOnce(duplicateKeyError());
    const response = await post(professorId).send({ name: "WAD2" });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(2);
    expect(response.body.data.joinCode).toBe(create.mock.calls[1][0].joinCode);
  });

  it("gives up with 409 after repeated collisions instead of looping forever", async () => {
    create.mockRejectedValue(duplicateKeyError());
    const response = await post(professorId).send({ name: "WAD2" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("JOIN_CODE_CONFLICT");
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("does not retry other database errors and hides their details behind a 500", async () => {
    create.mockRejectedValue(new Error("private-db-detail"));
    const response = await post(professorId).send({ name: "WAD2" });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
