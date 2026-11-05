// B5a/B8 HTTP tests.
// Real schema validation with in-memory persistence; no live MongoDB connection.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { badSessionHeader, sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Challenge from "../src/models/Challenge.js";
import Membership from "../src/models/Membership.js";
import Attempt from "../src/models/Attempt.js";

const ownerId = new mongoose.Types.ObjectId();
const otherProfessorId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const outsiderId = new mongoose.Types.ObjectId();
const classroomId = new mongoose.Types.ObjectId();
const missingId = new mongoose.Types.ObjectId();
const users = {
  [ownerId]: { _id: ownerId, role: "professor" },
  [otherProfessorId]: { _id: otherProfessorId, role: "professor" },
  [studentId]: { _id: studentId, role: "student" },
  [outsiderId]: { _id: outsiderId, role: "student" },
};
const classroom = {
  _id: classroomId,
  professorId: new mongoose.Types.ObjectId(String(ownerId)),
};
const date = new Date("2026-10-07T07:00:00.000Z");
function findCreate(items) {
  for (const item of items) {
    if (item.name === "Create challenge" && item.request) return item.request;
    if (item.item) {
      const found = findCreate(item.item);
      if (found) return found;
    }
  }
}
const collection = JSON.parse(
  readFileSync(
    new URL("../../postman/Learn-E.postman_collection.json", import.meta.url),
    "utf8",
  ),
);
const fullBody = JSON.parse(findCreate(collection.item).body.raw);
const metadata = { language: "JavaScript", objective: "Trace a loop" };
function withBlock(index, changes) {
  return {
    ...metadata,
    title: "Draft",
    questions: [{ ...structuredClone(fullBody.questions[index]), ...changes }],
  };
}
function post(caller = ownerId, id = classroomId) {
  const pending = request(createApp()).post(`/api/classrooms/${id}/challenges`);
  return caller ? pending.set(...sessionHeader(caller)) : pending;
}
let saved, create, findClassroom, findChallenge, findMembership;
beforeEach(() => {
  saved = [];
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(
    async (id) => users[String(id)] ?? null,
  );
  findClassroom = vi
    .spyOn(Classroom, "findById")
    .mockImplementation(async (id) =>
      String(id) === String(classroomId) ? classroom : null,
    );
  create = vi.spyOn(Challenge, "create").mockImplementation(async (fields) => {
    const document = new Challenge({
      ...fields,
      createdAt: date,
      updatedAt: date,
    });
    await document.validate();
    saved.push(document);
    return document;
  });
  findChallenge = vi
    .spyOn(Challenge, "findById")
    .mockImplementation(
      async (id) =>
        saved.find(
          (document) => String(document._id) === String(id).toLowerCase(),
        ) ?? null,
    );
  findMembership = vi
    .spyOn(Membership, "findOne")
    .mockImplementation(async (filter) =>
      String(filter.classroomId) === String(classroomId) &&
      String(filter.userId) === String(studentId)
        ? { _id: new mongoose.Types.ObjectId(), classroomId, userId: studentId }
        : null,
    );

  // Phase C: Published learner reads now check for an existing Attempt.
  // These Phase B tests assume the student has not started the challenge.
  vi.spyOn(Attempt, "findOne").mockResolvedValue(null);
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/classrooms/:id/challenges: draft creation", () => {
  it("creates a metadata-only draft and returns the complete professor DTO", async () => {
    const response = await post().send({ title: "  My draft  ", ...metadata });
    expect(response.status).toBe(201);
    expect(saved).toHaveLength(1);
    expect(response.body).toEqual({
      data: {
        id: String(saved[0]._id),
        classroomId: String(classroomId),
        title: "My draft",
        ...metadata,
        prompt: "",
        codeSnippet: "",
        questions: [],
        appliedCase: { prompt: "" },
        progressiveHints: [],
        explanation: "",
        status: "draft",
        createdBy: String(ownerId),
        createdAt: date.toISOString(),
        updatedAt: date.toISOString(),
      },
    });
    expect(saved[0].language).toBe(metadata.language);
    expect(saved[0].classroomId.toString()).toBe(String(classroomId));
    expect(saved[0].createdBy.toString()).toBe(String(ownerId));
  });

  it("saves the real Postman example with all three formats and professor-only answers", async () => {
    const response = await post().send(fullBody);
    expect(response.status).toBe(201);
    expect(saved).toHaveLength(1);
    expect(response.body.data.questions).toHaveLength(3);
    for (const [index, block] of response.body.data.questions.entries()) {
      expect(block).toMatchObject({
        ...fullBody.questions[index],
        order: index,
      });
      expect(block.id).toMatch(/^[a-f0-9]{24}$/);
      expect(block.id).toBe(String(saved[0].questions[index]._id));
    }
    expect(
      new Set(response.body.data.questions.map((block) => block.id)).size,
    ).toBe(3);
    expect(response.body.data.explanation).toBe(fullBody.explanation);
    expect(response.body.data.codeSnippet).toBe(fullBody.codeSnippet);
    expect(response.body.data.appliedCase).toEqual(fullBody.appliedCase);
    expect(response.body.data.status).toBe("draft");
    expect(JSON.stringify(response.body)).not.toContain('"_id"');
    expect(JSON.stringify(response.body)).not.toContain('"__v"');
  });

  it("allows unfinished type-only blocks and returns each format's empty answer", async () => {
    const response = await post().send({
      ...metadata,
      title: "Unfinished",
      questions: [
        { type: "predict-output" },
        { type: "locate-fault" },
        { type: "repair-order" },
      ],
      appliedCase: { prompt: "" },
      progressiveHints: ["", "Typed hint"],
    });
    expect(response.status).toBe(201);
    expect(
      response.body.data.questions.map((block) => block.acceptedAnswer),
    ).toEqual(["", { location: "", category: "" }, []]);
    expect(response.body.data.questions.map((block) => block.order)).toEqual([
      0, 1, 2,
    ]);
    expect(
      saved[0].questions.every((block) => block.acceptedAnswer === undefined),
    ).toBe(true);
  });

  it.each([
    ["empty predict answer", withBlock(0, { options: [], acceptedAnswer: "" })],
    [
      "one predict option",
      withBlock(0, {
        options: [{ id: "a", label: "One option so far" }],
        acceptedAnswer: "a",
      }),
    ],
    [
      "empty locate answer",
      withBlock(1, { acceptedAnswer: { location: "", category: "" } }),
    ],
    ["partial repair order", withBlock(2, { acceptedAnswer: ["s1"] })],
    ["empty repair order", withBlock(2, { acceptedAnswer: [] })],
  ])("keeps a correctly shaped %s valid in a draft", async (_label, body) => {
    expect((await post().send(body)).status).toBe(201);
    expect(saved).toHaveLength(1);
  });

  it("ignores supplied identities/status/order and strips unlisted Mixed metadata", async () => {
    const injectedId = String(new mongoose.Types.ObjectId());
    const body = {
      ...structuredClone(fullBody),
      status: "published",
      classroomId: String(missingId),
      createdBy: String(studentId),
      id: injectedId,
      _id: injectedId,
      createdAt: "1900-01-01",
      extra: "discard",
    };
    body.questions.forEach((block) => {
      block.id = injectedId;
      block._id = injectedId;
      block.order = 99;
      block.extra = "discard";
    });
    body.questions[0].options[0].acceptedAnswer = "discard";
    body.appliedCase.explanation = "discard";
    const response = await post().send(body);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: "draft",
      classroomId: String(classroomId),
      createdBy: String(ownerId),
    });
    expect(response.body.data.id).not.toBe(injectedId);
    expect(
      response.body.data.questions.every((block) => block.id !== injectedId),
    ).toBe(true);
    expect(
      new Set(response.body.data.questions.map((block) => block.id)).size,
    ).toBe(3);
    expect(response.body.data.questions.map((block) => block.order)).toEqual([
      0, 1, 2,
    ]);
    expect(create.mock.calls[0][0]).not.toHaveProperty("status");
    expect(create.mock.calls[0][0]).not.toHaveProperty("_id");
    expect(saved[0].questions[0].options[0]).toEqual(
      fullBody.questions[0].options[0],
    );
    expect(saved[0].appliedCase).toEqual(fullBody.appliedCase);
  });

  it("creates a fresh draft on each successful repeated POST", async () => {
    const first = await post().send({ title: "Repeat", ...metadata });
    const second = await post().send({ title: "Repeat", ...metadata });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.data.id).not.toBe(second.body.data.id);
    expect(saved).toHaveLength(2);
  });
});

describe("draft access checks", () => {
  it("rejects missing identity before querying the classroom", async () => {
    const response = await post(null).send({ title: "Draft" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(findClassroom).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    [studentId, "student"],
    [otherProfessorId, "other professor"],
  ])("rejects %s (%s) without a write", async (caller) => {
    const response = await post(caller).send({
      title: "Draft",
      createdBy: String(ownerId),
      role: "professor",
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(create).not.toHaveBeenCalled();
  });
  it("requires the professor role even if a student id matches the classroom owner", async () => {
    findClassroom.mockResolvedValueOnce({
      ...classroom,
      professorId: studentId,
    });
    expect((await post(studentId).send({ title: "Draft" })).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it.each(["example", "g".repeat(24), "a".repeat(23)])(
    "rejects malformed classroom id %s without a lookup",
    async (id) => {
      const response = await post(ownerId, id).send({ title: "Draft" });
      expect(response.status).toBe(400);
      expect(findClassroom).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
  it("returns 404 for an unknown classroom", async () => {
    const response = await post(ownerId, missingId).send({ title: "Draft" });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CLASSROOM_NOT_FOUND");
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    ["an unknown token", () => post(null).set(...badSessionHeader())],
    ["a session whose user is gone", () => post(missingId)],
  ])("refuses %s before any lookup", async (_label, send) => {
    const response = await send().send({ title: "Draft" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_SESSION");
    expect(findClassroom).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("draft validation: no rejected request writes", () => {
  it.each(["title", "language", "objective"])(
    "requires non-empty %s when creating a new draft",
    async (field) => {
      for (const value of [undefined, "", " \n "]) {
        const body = { title: "Draft", ...metadata };
        if (value === undefined) delete body[field];
        else body[field] = value;
        const response = await post().send(body);
        expect(response.status).toBe(400);
        expect(response.body.error.details).toEqual([
          expect.objectContaining({ field }),
        ]);
      }
      expect(create).not.toHaveBeenCalled();
    },
  );
  const invalidCases = [
    ["missing title", {}, "title"],
    ["blank title", { title: " \n " }, "title"],
    ["number title", { title: 1 }, "title"],
    ["null title", { title: null }, "title"],
    ...["language", "objective", "prompt", "codeSnippet", "explanation"].map(
      (field) => [
        field + " wrong type",
        { title: "Draft", [field]: 42 },
        field,
      ],
    ),
    ["null optional string", { title: "Draft", objective: null }, "objective"],
    ["array body", [], "body"],
    ["questions object", { title: "Draft", questions: {} }, "questions"],
    ["null questions", { title: "Draft", questions: null }, "questions"],
    ["null block", { title: "Draft", questions: [null] }, "questions.0"],
    ["missing type", { title: "Draft", questions: [{}] }, "questions.0.type"],
    [
      "unsupported type",
      withBlock(0, { type: "arbitrary" }),
      "questions.0.type",
    ],
    [
      "misplaced applied case",
      withBlock(0, { type: "applied-case" }),
      "questions.0.type",
    ],
    ["block prompt number", withBlock(0, { prompt: 42 }), "questions.0.prompt"],
    [
      "block explanation null",
      withBlock(0, { explanation: null }),
      "questions.0.explanation",
    ],
    ["options object", withBlock(0, { options: {} }), "questions.0.options"],
    ["null options", withBlock(0, { options: null }), "questions.0.options"],
    [
      "string option",
      withBlock(0, { options: ["legacy"] }),
      "questions.0.options.0",
    ],
    [
      "number option id",
      withBlock(0, { options: [{ id: 1, label: "One" }] }),
      "questions.0.options.0.id",
    ],
    [
      "padded option id",
      withBlock(0, { options: [{ id: " a ", label: "One" }] }),
      "questions.0.options.0.id",
    ],
    [
      "blank option label",
      withBlock(0, { options: [{ id: "a", label: " " }] }),
      "questions.0.options.0.label",
    ],
    [
      "duplicate option ids",
      withBlock(0, {
        options: [
          { id: "b", label: "One" },
          { id: "b", label: "Two" },
        ],
      }),
      "questions.0.options.1.id",
    ],
    [
      "predict label as answer",
      withBlock(0, { acceptedAnswer: "1, then 2" }),
      "questions.0.acceptedAnswer",
    ],
    [
      "predict number answer",
      withBlock(0, { acceptedAnswer: 1 }),
      "questions.0.acceptedAnswer",
    ],
    [
      "predict null answer",
      withBlock(0, { acceptedAnswer: null }),
      "questions.0.acceptedAnswer",
    ],
    [
      "locate option without a line- or category- id",
      withBlock(1, { options: [{ id: "2", label: "Line 2" }] }),
      "questions.0.options.0.id",
    ],
    [
      "locate answer naming a missing line",
      withBlock(1, { acceptedAnswer: { location: "line-9", category: "category-1" } }),
      "questions.0.acceptedAnswer.location",
    ],
    [
      "locate category id given as the line",
      withBlock(1, { acceptedAnswer: { location: "category-1", category: "category-1" } }),
      "questions.0.acceptedAnswer.location",
    ],
    [
      "locate line key",
      withBlock(1, { acceptedAnswer: { line: "2", category: "boundary" } }),
      "questions.0.acceptedAnswer",
    ],
    [
      "locate numeric location",
      withBlock(1, { acceptedAnswer: { location: 2, category: "boundary" } }),
      "questions.0.acceptedAnswer.location",
    ],
    [
      "locate partial object",
      withBlock(1, { acceptedAnswer: { location: "2" } }),
      "questions.0.acceptedAnswer.category",
    ],
    [
      "locate array answer",
      withBlock(1, { acceptedAnswer: [] }),
      "questions.0.acceptedAnswer",
    ],
    [
      "repair string answer",
      withBlock(2, { acceptedAnswer: "s1,s2,s3" }),
      "questions.0.acceptedAnswer",
    ],
    [
      "repair unknown step",
      withBlock(2, { acceptedAnswer: ["unknown"] }),
      "questions.0.acceptedAnswer.0",
    ],
    [
      "repair number step",
      withBlock(2, { acceptedAnswer: [1] }),
      "questions.0.acceptedAnswer.0",
    ],
    [
      "repair duplicate step",
      withBlock(2, { acceptedAnswer: ["s1", "s1"] }),
      "questions.0.acceptedAnswer.1",
    ],
    [
      "repair comma id",
      withBlock(2, { options: [{ id: "s,1", label: "Step" }] }),
      "questions.0.options.0.id",
    ],
    [
      "hints string",
      { title: "Draft", progressiveHints: "hint" },
      "progressiveHints",
    ],
    [
      "hint number",
      { title: "Draft", progressiveHints: [42] },
      "progressiveHints.0",
    ],
    [
      "hint null",
      { title: "Draft", progressiveHints: [null] },
      "progressiveHints.0",
    ],
    [
      "applied case string",
      { title: "Draft", appliedCase: "prompt" },
      "appliedCase",
    ],
    ["applied case null", { title: "Draft", appliedCase: null }, "appliedCase"],
    ["applied case array", { title: "Draft", appliedCase: [] }, "appliedCase"],
    [
      "missing applied prompt",
      { title: "Draft", appliedCase: {} },
      "appliedCase.prompt",
    ],
    [
      "numeric applied prompt",
      { title: "Draft", appliedCase: { prompt: 42 } },
      "appliedCase.prompt",
    ],
  ];
  it.each(invalidCases)("rejects %s", async (_label, body, field) => {
    const response = await post().send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    expect(create).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });
  it("rejects an absent body without crashing", async () => {
    expect((await post()).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it("collects errors across fields and blocks without echoing answer keys", async () => {
    const response = await post().send({
      title: "",
      progressiveHints: [42],
      appliedCase: "wrong",
      questions: [
        { type: "predict-output", acceptedAnswer: "private-answer" },
        { type: "locate-fault", acceptedAnswer: { line: "2" } },
      ],
    });
    expect(response.status).toBe(400);
    const fields = response.body.error.details.map((problem) => problem.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "title",
        "progressiveHints.0",
        "appliedCase",
        "questions.0.acceptedAnswer",
        "questions.1.acceptedAnswer.location",
        "questions.1.acceptedAnswer.category",
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain("private-answer");
    expect(create).not.toHaveBeenCalled();
  });
  it("leaves previously saved records unchanged after a rejected request", async () => {
    await post().send({ title: "Already saved", ...metadata });
    const previous = saved[0].toObject();
    expect(
      (
        await post().send({
          title: "Bad",
          questions: [{ type: "applied-case" }],
        })
      ).status,
    ).toBe(400);
    expect(saved).toHaveLength(1);
    expect(saved[0].toObject()).toEqual(previous);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("lets the existing parser reject malformed JSON before a write", async () => {
    const response = await post()
      .set("Content-Type", "application/json")
      .send('{"title":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("persistence failures", () => {
  it.each(["lookup", "create"])(
    "returns a safe 500 for a failed %s",
    async (operation) => {
      (operation === "lookup" ? findClassroom : create).mockRejectedValueOnce(
        new Error("private database failure"),
      );
      const response = await post().send({ title: "Draft", ...metadata });
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(response.body)).not.toContain(
        "private database failure",
      );
      expect(saved).toHaveLength(0);
    },
  );
  it("turns a Mongoose validation failure into a safe 400", async () => {
    const error = new mongoose.Error.ValidationError(new Challenge());
    error.addError(
      "title",
      new mongoose.Error.ValidatorError({
        path: "title",
        message: "private database detail",
      }),
    );
    create.mockRejectedValueOnce(error);
    const response = await post().send({ title: "Draft", ...metadata });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: "title", message: "Field failed validation." },
    ]);
    expect(JSON.stringify(response.body)).not.toContain(
      "private database detail",
    );
    expect(saved).toHaveLength(0);
  });
});

function storeChallenge(fields = {}) {
  const document = new Challenge({
    ...structuredClone(fullBody),
    classroomId,
    createdBy: ownerId,
    createdAt: date,
    updatedAt: date,
    questions: fullBody.questions.map((question, order) => ({
      ...structuredClone(question),
      order,
    })),
    ...fields,
  });
  saved.push(document);
  return document;
}
function getChallenge(caller = ownerId, id = saved[0]?._id ?? missingId) {
  const pending = request(createApp()).get(`/api/challenges/${id}`);
  return caller ? pending.set(...sessionHeader(caller)) : pending;
}
function expectNoPrivateFields(value) {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect(["acceptedAnswer", "explanation", "progressiveHints"]).not.toContain(
      key,
    );
    expectNoPrivateFields(child);
  }
}

describe("GET /api/challenges/:id: role-specific content", () => {
  it("reads a newly created draft back with the identical professor DTO", async () => {
    const created = await post().send(fullBody);
    expect(created.status).toBe(201);
    const before = JSON.stringify(saved[0].toObject());
    const response = await getChallenge(ownerId, created.body.data.id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
    expect(JSON.stringify(saved[0].toObject())).toBe(before);
    expect(create).toHaveBeenCalledTimes(1);
    expect(findMembership).not.toHaveBeenCalled();
  });

  it.each(["draft", "published"])(
    "lets the owning professor read %s content and answers",
    async (status) => {
      const stored = storeChallenge({ status });
      const response = await getChallenge();
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: String(stored._id),
        classroomId: String(classroomId),
        createdBy: String(ownerId),
        status,
        explanation: fullBody.explanation,
        progressiveHints: fullBody.progressiveHints,
        appliedCase: fullBody.appliedCase,
        createdAt: date.toISOString(),
        updatedAt: date.toISOString(),
      });
      response.body.data.questions.forEach((block, index) => {
        expect(block).toMatchObject({
          ...fullBody.questions[index],
          id: String(stored.questions[index]._id),
          order: index,
        });
      });
      expect(findMembership).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("reads a typed-answer locate-fault block as one choice in each list", async () => {
    const oldBlock = {
      ...fullBody.questions[1],
      options: [],
      acceptedAnswer: { location: "2", category: "boundary" },
    };
    storeChallenge({ status: "published", questions: [oldBlock] });
    const choices = [
      { id: "line-1", label: "2" },
      { id: "category-1", label: "boundary" },
    ];
    const professor = (await getChallenge(ownerId)).body.data.questions[0];
    expect(professor.options).toEqual(choices);
    expect(professor.acceptedAnswer).toEqual({
      location: "line-1",
      category: "category-1",
    });
    const learner = (await getChallenge(studentId)).body.data.questions[0];
    expect(learner.options).toEqual(choices);
    expect(learner).not.toHaveProperty("acceptedAnswer");
  });

  it("uses classroom ownership rather than the challenge's creator to authorize a professor", async () => {
    storeChallenge({ createdBy: otherProfessorId });
    expect((await getChallenge(ownerId)).status).toBe(200);
    expect((await getChallenge(otherProfessorId)).status).toBe(403);
  });

  it("returns exactly the allowed learner fields for all three formats", async () => {
    const stored = storeChallenge({ status: "published" });
    const response = await getChallenge(studentId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: String(stored._id),
        classroomId: String(classroomId),
        title: fullBody.title,
        language: fullBody.language,
        objective: fullBody.objective,
        prompt: fullBody.prompt,
        codeSnippet: fullBody.codeSnippet,
        questions: stored.questions.map((question, order) => ({
          id: String(question._id),
          type: fullBody.questions[order].type,
          prompt: fullBody.questions[order].prompt,
          options: fullBody.questions[order].options,
          order,
        })),
        appliedCase: { prompt: fullBody.appliedCase.prompt },
        // The count only; hints themselves arrive with the attempt as they unlock.
        hintCount: fullBody.progressiveHints.length,
        status: "published",
        createdBy: String(ownerId),
        createdAt: date.toISOString(),
        updatedAt: date.toISOString(),
        attempt: null,
      },
    });
    expect(findMembership).toHaveBeenCalledWith({
      classroomId,
      userId: studentId,
    });
    expectNoPrivateFields(response.body);
    expect(response.text).not.toContain('"acceptedAnswer"');
    expect(response.text).not.toContain('"explanation"');
    expect(response.text).not.toContain('"progressiveHints"');
    expect(response.body.data.attempt).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([ownerId, studentId])(
    "sorts blocks for caller %s without changing the stored array",
    async (caller) => {
      const stored = storeChallenge({
        status: "published",
        questions: fullBody.questions.map((question, index) => ({
          ...structuredClone(question),
          order: [2, 0, 1][index],
        })),
      });
      const before = JSON.stringify(stored.toObject());
      const response = await getChallenge(caller);
      expect(response.status).toBe(200);
      expect(response.body.data.questions.map((block) => block.order)).toEqual([
        0, 1, 2,
      ]);
      expect(response.body.data.questions.map((block) => block.id)).toEqual(
        [stored.questions[1], stored.questions[2], stored.questions[0]].map(
          (block) => String(block._id),
        ),
      );
      expect(JSON.stringify(stored.toObject())).toBe(before);
    },
  );

  it.each([undefined, ""])(
    "omits derived block snippets when the parent snippet is %s",
    async (codeSnippet) => {
      storeChallenge({ status: "published", codeSnippet });
      const response = await getChallenge(studentId);
      expect(response.status).toBe(200);
      expect(response.body.data.codeSnippet).toBe("");
      response.body.data.questions.forEach((block) =>
        expect(block).not.toHaveProperty("codeSnippet"),
      );
    },
  );

  it("projects Mixed options and the applied-case prompt without nested private metadata", async () => {
    const hidden = "PRIVATE_METADATA_DO_NOT_SEND";
    const stored = storeChallenge({
      status: "published",
      appliedCase: {
        prompt: "Visible applied prompt",
        acceptedAnswer: hidden,
        explanation: hidden,
        metadata: { progressiveHints: [hidden] },
      },
    });
    stored.questions[0].options[0] = {
      id: "a",
      label: "Visible label",
      acceptedAnswer: hidden,
      explanation: hidden,
    };
    stored.questions[2].options[0] = {
      id: { acceptedAnswer: hidden },
      label: { explanation: hidden },
    };
    const response = await getChallenge(studentId);
    expect(response.status).toBe(200);
    expect(response.body.data.appliedCase).toEqual({
      prompt: "Visible applied prompt",
    });
    expect(response.body.data.questions[0].options[0]).toEqual({
      id: "a",
      label: "Visible label",
    });
    expect(response.body.data.questions[2].options[0]).toEqual({
      id: "",
      label: "",
    });
    expectNoPrivateFields(response.body);
    expect(response.text).not.toContain(hidden);
  });

  it("does not forward malformed Mixed prompt or option values", async () => {
    const stored = storeChallenge({
      status: "published",
      appliedCase: { prompt: { acceptedAnswer: "private" } },
    });
    stored.questions[0].options = null;
    stored.questions[2].options = [null, "plain string"];
    const response = await getChallenge(studentId);
    expect(response.status).toBe(200);
    expect(response.body.data.appliedCase).toEqual({ prompt: "" });
    expect(response.body.data.questions[0].options).toEqual([]);
    expect(response.body.data.questions[2].options).toEqual([
      { id: "", label: "" },
      { id: "", label: "" },
    ]);
    expectNoPrivateFields(response.body);
    expect(response.text).not.toContain("private");
  });
});

describe("GET /api/challenges/:id: caller and visibility checks", () => {
  it("rejects an unresolved caller as 401 before querying the challenge", async () => {
    const response = await getChallenge(null);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(findChallenge).not.toHaveBeenCalled();
    expect(findClassroom).not.toHaveBeenCalled();
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("rejects a well-formed but unresolved header while disconnected without buffering queries", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
    const response = await getChallenge();
    expect(response.status).toBe(401);
    expect(User.findById).not.toHaveBeenCalled();
    expect(findChallenge).not.toHaveBeenCalled();
  });

  it.each(["abc", "a".repeat(23), "a".repeat(25), "z".repeat(24)])(
    "rejects a malformed id %s as 400 before lookup",
    async (id) => {
      const response = await getChallenge(ownerId, id);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: "VALIDATION_FAILED",
        details: [{ field: "id", message: expect.any(String) }],
      });
      expect(findChallenge).not.toHaveBeenCalled();
    },
  );

  it("accepts uppercase hexadecimal ObjectIds", async () => {
    const stored = storeChallenge();
    expect(
      (await getChallenge(ownerId, String(stored._id).toUpperCase())).status,
    ).toBe(200);
  });

  it("returns 404 for a nonexistent challenge without querying access", async () => {
    const response = await getChallenge();
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CHALLENGE_NOT_FOUND");
    expect(findClassroom).not.toHaveBeenCalled();
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("returns 404 when the challenge's classroom no longer exists", async () => {
    storeChallenge({ classroomId: missingId });
    const response = await getChallenge();
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CLASSROOM_NOT_FOUND");
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("hides a member student's draft with the same 404 envelope as a missing challenge", async () => {
    const stored = storeChallenge();
    const before = JSON.stringify(stored.toObject());
    const draft = await getChallenge(studentId);
    const missing = await getChallenge(studentId, missingId);
    expect(draft.status).toBe(404);
    expect(draft.body).toEqual(missing.body);
    expect(draft.text).not.toContain(stored.title);
    expectNoPrivateFields(draft.body);
    expect(JSON.stringify(stored.toObject())).toBe(before);
  });

  it.each(["draft", "published"])(
    "refuses a nonmember student for a %s challenge",
    async (status) => {
      storeChallenge({ status });
      const response = await getChallenge(outsiderId);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(findMembership).toHaveBeenCalledWith({
        classroomId,
        userId: outsiderId,
      });
      expectNoPrivateFields(response.body);
    },
  );

  it("looks for membership in this classroom rather than any classroom", async () => {
    storeChallenge({ status: "published" });
    findMembership.mockImplementation(async (filter) =>
      String(filter.classroomId) === String(missingId) &&
      String(filter.userId) === String(outsiderId)
        ? { classroomId: missingId, userId: outsiderId }
        : null,
    );
    expect((await getChallenge(outsiderId)).status).toBe(403);
    expect(findMembership).toHaveBeenCalledWith({
      classroomId,
      userId: outsiderId,
    });
  });

  it.each(["draft", "published"])(
    "refuses another professor for %s content even with a membership",
    async (status) => {
      storeChallenge({ status });
      findMembership.mockResolvedValue({
        classroomId,
        userId: otherProfessorId,
      });
      const response = await getChallenge(otherProfessorId);
      expect(response.status).toBe(403);
      expect(findMembership).not.toHaveBeenCalled();
      expectNoPrivateFields(response.body);
    },
  );

  it("does not grant professor access to a student with the owner's id", async () => {
    storeChallenge();
    vi.mocked(User.findById).mockResolvedValueOnce({
      _id: ownerId,
      role: "student",
    });
    expect((await getChallenge()).status).toBe(403);
  });

  it("rejects an unsupported role", async () => {
    storeChallenge({ status: "published" });
    vi.mocked(User.findById).mockResolvedValueOnce({
      _id: ownerId,
      role: "admin",
    });
    expect((await getChallenge()).status).toBe(403);
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("ignores query-supplied role and owner values", async () => {
    const stored = storeChallenge();
    const response = await getChallenge(
      otherProfessorId,
      `${stored._id}?role=professor&userId=${ownerId}`,
    );
    expect(response.status).toBe(403);
  });

  it("refuses an unknown token and a session whose user is gone", async () => {
    storeChallenge();
    const unknownToken = await getChallenge(null).set(...badSessionHeader());
    expect(unknownToken.status).toBe(401);
    expect(unknownToken.body.error.code).toBe("INVALID_SESSION");
    const goneUser = await getChallenge(missingId);
    expect(goneUser.status).toBe(401);
    expect(goneUser.body.error.code).toBe("INVALID_SESSION");
    expect(findChallenge).not.toHaveBeenCalled();
  });

  it.each(["challenge", "classroom", "membership"])(
    "returns a safe 500 for a failed %s lookup",
    async (lookup) => {
      storeChallenge({ status: "published" });
      const target = {
        challenge: findChallenge,
        classroom: findClassroom,
        membership: findMembership,
      }[lookup];
      target.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_FAILURE"));
      const response = await getChallenge(studentId);
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_ERROR");
      expect(response.text).not.toContain("PRIVATE_DATABASE_FAILURE");
      expectNoPrivateFields(response.body);
      expect(create).not.toHaveBeenCalled();
    },
  );
});
