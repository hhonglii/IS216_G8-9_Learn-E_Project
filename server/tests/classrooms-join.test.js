// Test cases for slice A6a.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";

// No live database, same approach as classrooms-create.test.js: readyState is
// mocked to 1 so loadSessionUser resolves the caller, and model methods are
// replaced per test. Classroom and Membership mocks return hydrated documents,
// so .id and toJSON behave as they do against Atlas. The unique index itself
// can only be proven in Atlas (A6a Step 10).
const professorId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const classroomId = new mongoose.Types.ObjectId();
const users = {
  [String(professorId)]: {
    _id: professorId,
    displayName: "Prof Tan",
    role: "professor",
  },
  [String(studentId)]: { _id: studentId, displayName: "Alice", role: "student" },
};
const storedClassroom = () =>
  Classroom.hydrate({
    _id: classroomId,
    name: "IS216 G10",
    description: "Debugging practice",
    joinCode: "ABC234",
    professorId,
  });

function duplicateKeyError() {
  return Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
}

function post(callerId) {
  const req = request(createApp()).post("/api/classrooms/join");
  return callerId ? req.set(...sessionHeader(callerId)) : req;
}

let findClassroom;
let create;
let findMembership;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(
    async (id) => users[String(id)] ?? null,
  );
  findClassroom = vi
    .spyOn(Classroom, "findOne")
    .mockImplementation(async (filter) =>
      filter?.joinCode === "ABC234" ? storedClassroom() : null,
    );
  create = vi
    .spyOn(Membership, "create")
    .mockImplementation(async (fields) =>
      Membership.hydrate({ _id: new mongoose.Types.ObjectId(), ...fields }),
    );
  findMembership = vi.spyOn(Membership, "findOne").mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/classrooms/join: who may join", () => {
  it("rejects a request with no selected user as 401 without a lookup or write", async () => {
    const response = await post().send({ joinCode: "ABC234" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(findClassroom).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a professor as 403 before touching the database", async () => {
    const response = await post(professorId).send({ joinCode: "ABC234" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(findClassroom).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/classrooms/join: input validation", () => {
  it.each([
    ["missing", {}],
    ["blank", { joinCode: "   " }],
    ["empty", { joinCode: "" }],
    ["a number", { joinCode: 123456 }],
    ["null", { joinCode: null }],
    ["an array", { joinCode: ["ABC234"] }],
  ])("rejects a joinCode that is %s as 400 without a lookup", async (_, body) => {
    const response = await post(studentId).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details.field).toBe("joinCode");
    expect(findClassroom).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a request with no body at all as 400, not a crash", async () => {
    const response = await post(studentId);
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe("joinCode");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/classrooms/join: finding the classroom", () => {
  it("trims and uppercases the code before the lookup (decision A-1)", async () => {
    const response = await post(studentId).send({ joinCode: "  abc234 " });
    expect(response.status).toBe(201);
    expect(findClassroom.mock.calls[0][0]).toMatchObject({ joinCode: "ABC234" });
  });

  it("answers an unknown code with 404 and writes nothing", async () => {
    const response = await post(studentId).send({ joinCode: "ZZZ999" });
    expect(response.status).toBe(404);
    expect(typeof response.body.error.code).toBe("string");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/classrooms/join: successful join", () => {
  it("returns 201 with the agreed DTO and ids as strings", async () => {
    const response = await post(studentId).send({ joinCode: "ABC234" });
    expect(response.status).toBe(201);
    const { data } = response.body;
    expect(typeof data.id).toBe("string");
    expect(data.classroomId).toBe(String(classroomId));
    expect(data.userId).toBe(String(studentId));
    expect(data.classroom).toEqual({
      id: String(classroomId),
      name: "IS216 G10",
      description: "Debugging practice",
      coverId: "default",
    });
  });

  it("does not leak the join code, owner or points to the student (decision A-4)", async () => {
    const response = await post(studentId).send({ joinCode: "abc234" });
    expect(response.status).toBe(201);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain("ABC234");
    expect(text).not.toContain(String(professorId));
    expect(text).not.toContain("contributionPoints");
    expect(text).not.toContain("__v");
  });

  it("creates the membership from the found classroom and the caller only, never the body", async () => {
    const response = await post(studentId).send({
      joinCode: "ABC234",
      userId: String(professorId),
      classroomId: String(new mongoose.Types.ObjectId()),
    });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    const fields = create.mock.calls[0][0];
    expect(Object.keys(fields).sort()).toEqual(["classroomId", "userId"]);
    expect(String(fields.classroomId)).toBe(String(classroomId));
    expect(String(fields.userId)).toBe(String(studentId));
  });
});

describe("POST /api/classrooms/join: repeat join and failures", () => {
  it("answers a repeat join with 200 and the existing membership (decision A-2)", async () => {
    const existingId = new mongoose.Types.ObjectId();
    create.mockRejectedValue(duplicateKeyError());
    findMembership.mockResolvedValue(
      Membership.hydrate({ _id: existingId, classroomId, userId: studentId }),
    );
    const response = await post(studentId).send({ joinCode: "ABC234" });
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(String(existingId));
    expect(response.body.data.classroomId).toBe(String(classroomId));
    expect(response.body.data.userId).toBe(String(studentId));
    expect(response.body.data.classroom).toEqual({
      id: String(classroomId),
      name: "IS216 G10",
      description: "Debugging practice",
      coverId: "default",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not treat other create errors as a repeat join, and hides them behind a 500", async () => {
    create.mockRejectedValue(new Error("private-db-detail"));
    const response = await post(studentId).send({ joinCode: "ABC234" });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("hides a failed classroom lookup behind a 500", async () => {
    findClassroom.mockRejectedValue(new Error("private-db-detail"));
    const response = await post(studentId).send({ joinCode: "ABC234" });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
    expect(create).not.toHaveBeenCalled();
  });
});
