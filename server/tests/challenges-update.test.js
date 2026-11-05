// B5b HTTP tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import Challenge from "../src/models/Challenge.js";
import {
  setupStore,
  ownerId,
  otherId,
  studentId,
  missingId,
  completeDraft,
} from "./helpers/challengeStore.js";

let store, id;
beforeEach(() => {
  store = setupStore();
  id = store.add();
});
afterEach(() => vi.restoreAllMocks());
function put(body, caller = ownerId, target = id) {
  const pending = request(createApp()).put(`/api/challenges/${target}`);
  return (
    caller ? pending.set(...sessionHeader(caller)) : pending
  ).send(body);
}
function stored() {
  return store.records.get(id);
}
async function refused(body, caller, target, status = 400) {
  const before = JSON.stringify([...store.records]);
  const response = await put(body, caller, target);
  expect(response.status).toBe(status);
  expect(store.save).not.toHaveBeenCalled();
  expect(JSON.stringify([...store.records])).toBe(before);
  return response;
}

describe("B5b draft updates", () => {
  it("updates present fields only and preserves references, content and block ids", async () => {
    const before = structuredClone(stored());
    const response = await put({
      title: "  New title  ",
      prompt: "\nKeep whitespace\n",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe("New title");
    expect(response.body.data.prompt).toBe("\nKeep whitespace\n");
    expect(stored()).toMatchObject({
      classroomId: before.classroomId,
      createdBy: before.createdBy,
      status: "draft",
      objective: before.objective,
      questions: before.questions,
    });
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(response.body.data.updatedAt).toBe("2026-10-07T12:00:00.000Z");
  });

  it("replaces/reorders blocks while retaining supplied ids and generating ids only for new blocks", async () => {
    const original = stored().questions;
    const response = await put({
      questions: [
        {
          ...completeDraft.questions[2],
          id: original[2]._id.toUpperCase(),
          order: 42,
        },
        {
          type: "predict-output",
          prompt: "New incomplete block",
          idIgnored: "client-key",
        },
        { ...completeDraft.questions[0], id: original[0]._id, order: -9 },
      ],
    });
    expect(response.status).toBe(200);
    const blocks = response.body.data.questions;
    expect(blocks.map((block) => block.order)).toEqual([0, 1, 2]);
    expect(blocks[0].id).toBe(original[2]._id);
    expect(blocks[2].id).toBe(original[0]._id);
    expect(blocks[1].id).toMatch(/^[a-f0-9]{24}$/);
    expect(original.some((block) => block._id === blocks[1].id)).toBe(false);
    expect(blocks[0].acceptedAnswer).toEqual(["s1", "s2"]);
    expect(
      stored().questions.some((block) => block._id === original[1]._id),
    ).toBe(false);
  });

  it("accepts incomplete optional content and empty replacement lists", async () => {
    const response = await put({
      questions: [],
      language: "",
      appliedCase: { prompt: "" },
      progressiveHints: [],
      explanation: "",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.questions).toEqual([]);
    expect(response.body.data.appliedCase).toEqual({ prompt: "" });
  });

  it.each([{}, { unrelated: "ignored" }])(
    "treats an empty editable payload as an unchanged read: %j",
    async (body) => {
      const before = JSON.stringify(stored());
      expect((await put(body)).status).toBe(200);
      expect(store.save).not.toHaveBeenCalled();
      expect(JSON.stringify(stored())).toBe(before);
    },
  );

  it.each(["status", "classroomId", "createdBy"])(
    "rejects forbidden field %s before mutation",
    async (field) => {
      const response = await refused({
        [field]: "anything",
        title: "Must not save",
      });
      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({ field }),
      );
    },
  );

  it.each([
    ["empty title", { title: " " }],
    ["wrong text type", { objective: 7 }],
    ["array body", []],
    ["wrong question list", { questions: {} }],
    ["unsupported type", { questions: [{ type: "applied-case" }] }],
    [
      "invalid option",
      {
        questions: [
          { ...completeDraft.questions[0], options: [{ id: "a", label: "" }] },
        ],
      },
    ],
    [
      "unknown answer",
      {
        questions: [
          { ...completeDraft.questions[0], acceptedAnswer: "missing" },
        ],
      },
    ],
    [
      "wrong location shape",
      {
        questions: [
          { ...completeDraft.questions[1], acceptedAnswer: { line: 2 } },
        ],
      },
    ],
    [
      "duplicate repair answer",
      {
        questions: [
          { ...completeDraft.questions[2], acceptedAnswer: ["s1", "s1"] },
        ],
      },
    ],
    ["bad applied case", { appliedCase: "text" }],
    ["bad hint", { progressiveHints: [null] }],
    [
      "temporary id",
      { questions: [{ type: "predict-output", id: "new-block-1" }] },
    ],
    [
      "foreign id",
      { questions: [{ type: "predict-output", id: String(missingId) }] },
    ],
    ["null id", { questions: [{ type: "predict-output", id: null }] }],
  ])("rejects %s and leaves storage unchanged", async (_label, body) => {
    await refused(body);
  });

  it("rejects duplicate ids including uppercase variants without saving", async () => {
    const blockId = stored().questions[0]._id;
    await refused({
      questions: [
        { ...completeDraft.questions[0], id: blockId },
        { ...completeDraft.questions[0], id: blockId.toUpperCase() },
      ],
    });
  });

  it.each([otherId, studentId])("denies non-owner %s", async (caller) => {
    await refused({ title: "Unauthorized" }, caller, id, 403);
  });
  it("requires a resolved caller before lookups", async () => {
    await refused({ title: "Unauthorized" }, null, id, 401);
    expect(store.findChallenge).not.toHaveBeenCalled();
  });
  it("rejects malformed challenge ids before lookup", async () => {
    await refused({}, ownerId, "example", 400);
    expect(store.findChallenge).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing challenge", async () => {
    await refused({}, ownerId, missingId, 404);
  });
  it("returns 404 for a missing classroom", async () => {
    store.findClassroom.mockResolvedValueOnce(null);
    await refused({}, ownerId, id, 404);
  });
  it("uses classroom ownership rather than createdBy", async () => {
    id = store.add({ createdBy: otherId });
    expect((await put({ title: "Owner edit" })).status).toBe(200);
    expect(stored().createdBy).toBe(String(otherId));
  });
  it("refuses any edit to published content without changing it", async () => {
    id = store.add({ status: "published" });
    await refused({ title: "Locked" }, ownerId, id, 409);
  });
  it("checks ownership before the published lock", async () => {
    id = store.add({ status: "published" });
    await refused({}, otherId, id, 403);
  });
  it("uses a safe conflict envelope for a stale save", async () => {
    const doc = Challenge.hydrate(stored());
    store.save.mockRejectedValueOnce(
      new mongoose.Error.VersionError(doc, 0, ["title"]),
    );
    const before = JSON.stringify(stored());
    const response = await put({ title: "Stale" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CHALLENGE_CONFLICT");
    expect(JSON.stringify(stored())).toBe(before);
  });
  it("maps schema validation to safe field errors", async () => {
    const error = new mongoose.Error.ValidationError();
    error.addError(
      "title",
      new mongoose.Error.ValidatorError({
        path: "title",
        message: "PRIVATE_VALIDATION",
      }),
    );
    store.save.mockRejectedValueOnce(error);
    const response = await put({ title: "Valid input" });
    expect(response.status).toBe(400);
    expect(response.text).not.toContain("PRIVATE_VALIDATION");
  });
  it("uses the generic 500 envelope on database failure", async () => {
    store.save.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_FAILURE"));
    const before = JSON.stringify(stored());
    const response = await put({ title: "Valid input" });
    expect(response.status).toBe(500);
    expect(response.text).not.toContain("PRIVATE_DATABASE_FAILURE");
    expect(JSON.stringify(stored())).toBe(before);
  });
  it("enables version checks for edits racing with publication", () => {
    expect(Challenge.schema.options.optimisticConcurrency).toBe(true);
  });
});
