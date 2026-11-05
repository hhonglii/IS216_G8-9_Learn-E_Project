// B7 HTTP tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import Challenge from "../src/models/Challenge.js";
import Membership from "../src/models/Membership.js";
import Attempt from "../src/models/Attempt.js";
import {
  setupStore,
  ownerId,
  otherId,
  studentId,
  classroomId,
  missingId,
  completeDraft,
} from "./helpers/challengeStore.js";

let store, id;

beforeEach(() => {
  store = setupStore();
  id = store.add();

  // Phase C: Students may have an existing Attempt.
  // These Phase B tests assume no Attempt has been created yet.
  vi.spyOn(Attempt, "findOne").mockResolvedValue(null);
});

afterEach(() => vi.restoreAllMocks());
function publish(caller = ownerId, target = id, body = {}) {
  const pending = request(createApp()).post(
    `/api/challenges/${target}/publish`,
  );
  return (
    caller ? pending.set(...sessionHeader(caller)) : pending
  ).send(body);
}
async function rejected(fields, status = 400, caller = ownerId) {
  if (fields) id = store.add(fields);
  const before = JSON.stringify([...store.records]);
  const response = await publish(caller);
  expect(response.status).toBe(status);
  expect(store.save).not.toHaveBeenCalled();
  expect(JSON.stringify([...store.records])).toBe(before);
  return response;
}

describe("B7 publication", () => {
  it("publishes complete stored content and ignores arbitrary request content", async () => {
    const before = structuredClone(store.records.get(id));
    const response = await publish(ownerId, id, {
      title: "Injected",
      questions: [],
      status: "draft",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("published");
    expect(response.body.data.title).toBe(completeDraft.title);
    expect(response.body.data.questions.map((block) => block.id)).toEqual(
      before.questions.map((block) => block._id),
    );
    expect(store.records.get(id).questions).toEqual(before.questions);
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.records.get(id).status).toBe("published");
  });
  it.each([0, 1, 2])(
    "allows one complete block of format %s and an absent snippet",
    async (index) => {
      id = store.add({
        questions: [{ ...completeDraft.questions[index], order: 0 }],
        codeSnippet: undefined,
      });
      expect((await publish()).status).toBe(200);
    },
  );
  it("returns an already published challenge unchanged without saving", async () => {
    id = store.add({ status: "published" });
    const before = JSON.stringify(store.records.get(id));
    expect((await publish()).status).toBe(200);
    expect((await publish()).status).toBe(200);
    expect(store.save).not.toHaveBeenCalled();
    expect(JSON.stringify(store.records.get(id))).toBe(before);
  });
  it("collects missing fields from an incomplete draft without changing status", async () => {
    const response = await rejected({
      language: "",
      objective: " ",
      prompt: "",
      explanation: "",
      questions: [],
      progressiveHints: [],
      appliedCase: { prompt: "" },
    });
    const fields = response.body.error.details.map((item) => item.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "language",
        "objective",
        "prompt",
        "explanation",
        "questions",
        "progressiveHints",
        "appliedCase.prompt",
      ]),
    );
    expect(store.records.get(id).status).toBe("draft");
  });
  it.each(["title", "language", "objective", "prompt", "explanation"])(
    "requires non-empty parent %s",
    async (field) => {
      await rejected({ [field]: " " });
    },
  );
  it.each([
    ["no blocks", { questions: [] }],
    ["null block", { questions: [null] }],
    [
      "unsupported format",
      { questions: [{ ...completeDraft.questions[0], type: "applied-case" }] },
    ],
    [
      "blank block prompt",
      { questions: [{ ...completeDraft.questions[0], prompt: " " }] },
    ],
    [
      "blank block explanation",
      { questions: [{ ...completeDraft.questions[0], explanation: "" }] },
    ],
    [
      "one predict option",
      {
        questions: [
          {
            ...completeDraft.questions[0],
            options: [{ id: "a", label: "Only" }],
          },
        ],
      },
    ],
    [
      "blank option label",
      {
        questions: [
          {
            ...completeDraft.questions[0],
            options: [
              { id: "a", label: " " },
              { id: "b", label: "Other" },
            ],
          },
        ],
      },
    ],
    [
      "duplicate option id",
      {
        questions: [
          {
            ...completeDraft.questions[0],
            options: [
              { id: "a", label: "A" },
              { id: "a", label: "B" },
            ],
          },
        ],
      },
    ],
    [
      "unknown accepted option",
      {
        questions: [
          { ...completeDraft.questions[0], acceptedAnswer: "missing" },
        ],
      },
    ],
    [
      "empty accepted option",
      { questions: [{ ...completeDraft.questions[0], acceptedAnswer: "" }] },
    ],
    [
      "missing accepted option",
      {
        questions: [
          { ...completeDraft.questions[0], acceptedAnswer: undefined },
        ],
      },
    ],
    [
      "empty location",
      {
        questions: [
          {
            ...completeDraft.questions[1],
            order: 0,
            acceptedAnswer: { location: "", category: "category-1" },
          },
        ],
      },
    ],
    [
      "empty category",
      {
        questions: [
          {
            ...completeDraft.questions[1],
            order: 0,
            acceptedAnswer: { location: "line-2", category: "" },
          },
        ],
      },
    ],
    [
      "wrong locate shape",
      {
        questions: [
          {
            ...completeDraft.questions[1],
            order: 0,
            acceptedAnswer: { line: "2" },
          },
        ],
      },
    ],
    [
      "locate option without a line- or category- id",
      {
        questions: [
          {
            ...completeDraft.questions[1],
            order: 0,
            options: [{ id: "a", label: "A" }],
          },
        ],
      },
    ],
    [
      "one line choice",
      {
        questions: [
          {
            ...completeDraft.questions[1],
            order: 0,
            options: completeDraft.questions[1].options.filter(
              (option) => option.id !== "line-1",
            ),
          },
        ],
      },
    ],
    [
      "one error category",
      {
        questions: [
          {
            ...completeDraft.questions[1],
            order: 0,
            options: completeDraft.questions[1].options.filter(
              (option) => option.id !== "category-2",
            ),
          },
        ],
      },
    ],
    [
      "typed-answer locate block from before options",
      {
        questions: [
          {
            ...completeDraft.questions[1],
            order: 0,
            options: [],
            acceptedAnswer: { location: "2", category: "boundary" },
          },
        ],
      },
    ],
    [
      "one repair step",
      {
        questions: [
          {
            ...completeDraft.questions[2],
            order: 0,
            options: [{ id: "s1", label: "Trace" }],
            acceptedAnswer: ["s1"],
          },
        ],
      },
    ],
    [
      "partial repair answer",
      {
        questions: [
          { ...completeDraft.questions[2], order: 0, acceptedAnswer: ["s1"] },
        ],
      },
    ],
    [
      "repair steps already listed in the correct order",
      {
        questions: [
          { ...completeDraft.questions[2], order: 0, acceptedAnswer: ["s2", "s1"] },
        ],
      },
    ],
    [
      "duplicate repair answer",
      {
        questions: [
          {
            ...completeDraft.questions[2],
            order: 0,
            acceptedAnswer: ["s1", "s1"],
          },
        ],
      },
    ],
    [
      "unknown repair answer",
      {
        questions: [
          {
            ...completeDraft.questions[2],
            order: 0,
            acceptedAnswer: ["s1", "other"],
          },
        ],
      },
    ],
    [
      "wrong repair answer type",
      {
        questions: [
          { ...completeDraft.questions[2], order: 0, acceptedAnswer: "s1,s2" },
        ],
      },
    ],
    ["blank applied case", { appliedCase: { prompt: " " } }],
    ["wrong applied case", { appliedCase: "text" }],
    ["one hint", { progressiveHints: ["Only"] }],
    ["blank third hint", { progressiveHints: ["First", "Second", " "] }],
    [
      "wrong stored order",
      { questions: [{ ...completeDraft.questions[0], order: 4 }] },
    ],
  ])("refuses %s and preserves the stored draft", async (_label, fields) => {
    await rejected(fields);
  });
  it("asks for more choices on a typed-answer locate block from before options", async () => {
    const response = await rejected({
      questions: [
        {
          ...completeDraft.questions[1],
          order: 0,
          options: [],
          acceptedAnswer: { location: "2", category: "boundary" },
        },
      ],
    });
    expect(response.body.error.details).toEqual([
      {
        field: "questions.0.options",
        message:
          "At least two line choices and two error categories are required to publish.",
      },
    ]);
  });
  it("refuses duplicated stored block ids", async () => {
    const blockId = new mongoose.Types.ObjectId();
    await rejected({
      questions: [
        { ...completeDraft.questions[0], _id: blockId, order: 0 },
        { ...completeDraft.questions[1], _id: blockId, order: 1 },
      ],
    });
  });
  it("does not echo accepted answers or raw content in validation errors", async () => {
    const response = await rejected({
      questions: [
        { ...completeDraft.questions[0], acceptedAnswer: "PRIVATE_ANSWER" },
      ],
    });
    expect(response.text).not.toContain("PRIVATE_ANSWER");
    expect(response.body.error.details[0]).toEqual(
      expect.objectContaining({
        field: expect.any(String),
        message: expect.any(String),
      }),
    );
  });
  it.each([otherId, studentId])("denies caller %s", async (caller) => {
    await rejected(null, 403, caller);
  });
  it("requires a resolved caller before lookups", async () => {
    expect((await publish(null)).status).toBe(401);
    expect(store.findChallenge).not.toHaveBeenCalled();
  });
  it("rejects malformed ids before lookups", async () => {
    expect((await publish(ownerId, "example")).status).toBe(400);
    expect(store.findChallenge).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing challenge", async () => {
    expect((await publish(ownerId, missingId)).status).toBe(404);
  });
  it("returns 404 for an orphaned challenge", async () => {
    store.findClassroom.mockResolvedValueOnce(null);
    await rejected(null, 404);
  });
  it("keeps repeat publication restricted to the owning professor", async () => {
    await rejected({ status: "published" }, 403, otherId);
  });
  it("does not let request fields complete a stored incomplete draft", async () => {
    id = store.add({ language: "" });
    expect((await publish(ownerId, id, completeDraft)).status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("returns the latest published DTO if a simultaneous publish won", async () => {
    store.save.mockImplementationOnce(async function () {
      const latest = structuredClone(store.records.get(id));
      latest.status = "published";
      latest.__v++;
      store.records.set(id, latest);
      throw new mongoose.Error.VersionError(this, 0, ["status"]);
    });
    const response = await publish();
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("published");
    expect(store.save).toHaveBeenCalledTimes(1);
  });
  it("refuses a stale publish after a draft edit won, without publishing unvalidated changes", async () => {
    store.save.mockRejectedValueOnce(
      new mongoose.Error.VersionError(
        Challenge.hydrate(store.records.get(id)),
        0,
        ["status"],
      ),
    );
    const before = JSON.stringify(store.records.get(id));
    expect((await publish()).status).toBe(409);
    expect(JSON.stringify(store.records.get(id))).toBe(before);
  });
  it("uses the safe 500 envelope for a failed save", async () => {
    store.save.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_FAILURE"));
    const before = JSON.stringify(store.records.get(id));
    const response = await publish();
    expect(response.status).toBe(500);
    expect(response.text).not.toContain("PRIVATE_DATABASE_FAILURE");
    expect(JSON.stringify(store.records.get(id))).toBe(before);
  });
  it("makes the published learner read available without answers, explanations or hints", async () => {
    expect((await publish()).status).toBe(200);
    vi.spyOn(Membership, "findOne").mockResolvedValue({
      classroomId,
      userId: studentId,
    });
    const response = await request(createApp())
      .get(`/api/challenges/${id}`)
      .set(...sessionHeader(studentId));
    expect(response.status).toBe(200);
    for (const field of ["acceptedAnswer", "explanation", "progressiveHints"])
      expect(response.text).not.toContain(field);
  });
});
