// Mocked Gemini and persistence: current editor data is never saved by generation.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import Challenge from "../src/models/Challenge.js";
import { requestContentDraft } from "../src/services/geminiService.js";
import { HttpError } from "../src/utils/httpError.js";
import {
  setupStore,
  ownerId,
  otherId,
  studentId,
  classroomId,
  missingId,
} from "./helpers/challengeStore.js";

vi.mock("../src/services/geminiService.js", () => ({
  requestContentDraft: vi.fn(),
  requestHintDrafts: vi.fn(),
}));
const draft = {
  title: "Boundary practice",
  language: "JavaScript",
  objective: "Trace a loop",
  prompt: "Predict this loop's output",
  codeSnippet: "for (let i = 0; i < 2; i++) console.log(i);",
};
let store, create;
const call = (
  body = { field: "prompt", draft },
  user = ownerId,
  id = classroomId,
) => {
  const req = request(createApp()).post(
    `/api/classrooms/${id}/challenge-content-drafts`,
  );
  if (user) req.set(...sessionHeader(user));
  return body === undefined ? req : req.send(body);
};
beforeEach(() => {
  store = setupStore();
  create = vi.spyOn(Challenge, "create");
  requestContentDraft.mockReset().mockResolvedValue("Generated content");
});
afterEach(() => vi.restoreAllMocks());

it.each([
  ["prompt", ["title", "language", "objective"]],
  ["codeSnippet", ["title", "language", "objective", "prompt"]],
  ["explanation", ["title", "language", "objective", "prompt", "codeSnippet"]],
  [
    "appliedCasePrompt",
    ["title", "language", "objective", "prompt", "codeSnippet"],
  ],
])(
  "generates %s from the live fields above it without saving",
  async (field, fields) => {
    const body = {
      field,
      draft: {
        ...draft,
        title: ` ${draft.title} `,
        explanation: "PRIVATE EXPLANATION",
        appliedCase: { prompt: "PRIVATE EXISTING APPLIED CASE" },
        appliedCasePrompt: "PRIVATE EXISTING TARGET",
        acceptedAnswer: "PRIVATE ANSWER",
        questions: [{ acceptedAnswer: "PRIVATE BLOCK" }],
        student: { email: "PRIVATE STUDENT" },
        status: "published",
        classroomId: String(missingId),
      },
      createdBy: String(otherId),
      role: "professor",
    };
    const before = structuredClone(body);
    const response = await call(body);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { field, content: "Generated content" },
    });
    expect(requestContentDraft).toHaveBeenCalledExactlyOnceWith(
      field,
      Object.fromEntries(fields.map((name) => [name, draft[name]])),
    );
    expect(body).toEqual(before);
    expect(create).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.findChallenge).not.toHaveBeenCalled();
    expect(store.records.size).toBe(0);
  },
);

it("ignores malformed fields below the target rather than using stale content", async () => {
  expect(
    (
      await call({
        field: "prompt",
        draft: { ...draft, prompt: {}, codeSnippet: null },
      })
    ).status,
  ).toBe(200);
  expect(requestContentDraft.mock.calls[0][1]).toEqual({
    title: draft.title,
    language: draft.language,
    objective: draft.objective,
  });
});

it.each([
  [[], "body"],
  [{}, "field"],
  [{ field: "questions", draft }, "field"],
  [{ field: "__proto__", draft }, "field"],
  [{ field: {}, draft }, "field"],
  [{ field: "prompt", draft: [] }, "draft"],
  [{ field: "prompt", draft: null }, "draft"],
  [{ field: "prompt" }, "draft"],
])("rejects an invalid request shape %j", async (body, field) => {
  const response = await call(body);
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe("CONTENT_DRAFT_INVALID");
  expect(response.body.error.details).toContainEqual(
    expect.objectContaining({ field }),
  );
  expect(requestContentDraft).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it.each([
  ["prompt", "title", 200],
  ["prompt", "language", 100],
  ["prompt", "objective", 2000],
  ["codeSnippet", "prompt", 12000],
  ["explanation", "codeSnippet", 20000],
  ["appliedCasePrompt", "title", 200],
  ["appliedCasePrompt", "language", 100],
  ["appliedCasePrompt", "objective", 2000],
  ["appliedCasePrompt", "prompt", 12000],
  ["appliedCasePrompt", "codeSnippet", 20000],
])(
  "checks required and bounded %s context field %s",
  async (target, field, limit) => {
    for (const value of [
      undefined,
      "",
      " \n ",
      7,
      null,
      "x".repeat(limit + 1),
    ]) {
      const current = { ...draft };
      if (value === undefined) delete current[field];
      else current[field] = value;
      const response = await call({ field: target, draft: current });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("CONTENT_DRAFT_INVALID");
      expect(response.body.error.details).toEqual([
        expect.objectContaining({ field }),
      ]);
    }
    expect(requestContentDraft).not.toHaveBeenCalled();
  },
);

it("reports all three missing metadata fields with UI field names", async () => {
  const response = await call({ field: "prompt", draft: {} });
  expect(response.body.error.details.map(({ field }) => field)).toEqual([
    "title",
    "language",
    "objective",
  ]);
  expect(response.body.error.details[2].message).toContain(
    "Learning objective",
  );
});

it("requires the full main challenge context for an applied-case prompt", async () => {
  const response = await call({ field: "appliedCasePrompt", draft: {} });
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe("CONTENT_DRAFT_INVALID");
  expect(response.body.error.details.map(({ field }) => field)).toEqual([
    "title",
    "language",
    "objective",
    "prompt",
    "codeSnippet",
  ]);
  expect(requestContentDraft).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(store.save).not.toHaveBeenCalled();
});

it.each([otherId, studentId])(
  "denies generation to non-owning user %s",
  async (user) => {
    expect((await call(undefined, user)).status).toBe(403);
    expect(requestContentDraft).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  },
);
it("requires a resolved caller before looking up a classroom", async () => {
  expect((await call(undefined, null)).status).toBe(401);
  expect(store.findClassroom).not.toHaveBeenCalled();
  expect(requestContentDraft).not.toHaveBeenCalled();
});
it("requires the professor role even when the owner id matches", async () => {
  store.findUser.mockResolvedValueOnce({ _id: ownerId, role: "student" });
  expect((await call()).status).toBe(403);
  expect(requestContentDraft).not.toHaveBeenCalled();
});
it("rejects a malformed classroom id before lookup", async () => {
  const response = await call(undefined, ownerId, "bad-id");
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe("CONTENT_DRAFT_INVALID");
  expect(store.findClassroom).not.toHaveBeenCalled();
  expect(requestContentDraft).not.toHaveBeenCalled();
});
it("returns 404 for a missing classroom", async () => {
  expect((await call(undefined, ownerId, missingId)).status).toBe(404);
  expect(requestContentDraft).not.toHaveBeenCalled();
});
it.each([
  [503, "CONTENT_DRAFTS_UNAVAILABLE"],
  [503, "CONTENT_DRAFTS_RATE_LIMITED"],
  [502, "CONTENT_DRAFTS_FAILED"],
])(
  "passes through safe generation failure %s %s without saving",
  async (status, code) => {
    requestContentDraft.mockRejectedValueOnce(
      new HttpError(status, code, "Try again later."),
    );
    const response = await call();
    expect(response.status).toBe(status);
    expect(response.body).toEqual({
      error: { code, message: "Try again later.", details: null },
    });
    expect(create).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  },
);
it("keeps unexpected failures generic", async () => {
  requestContentDraft.mockRejectedValueOnce(
    new Error("PRIVATE PROVIDER DETAIL"),
  );
  const response = await call();
  expect(response.status).toBe(500);
  expect(response.text).not.toContain("PRIVATE");
});
