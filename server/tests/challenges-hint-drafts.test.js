// B9b endpoint tests: mocked Gemini, real Mongoose DTO fixtures.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { badSessionHeader, sessionHeader } from "./helpers/session.js";
import { HttpError } from "../src/utils/httpError.js";
import { requestHintDrafts } from "../src/services/geminiService.js";
import {
  setupStore,
  ownerId,
  otherId,
  studentId,
  missingId,
} from "./helpers/challengeStore.js";

vi.mock("../src/services/geminiService.js", () => ({
  requestHintDrafts: vi.fn(),
}));
let store;
let id;
const hints = ["Trace the loop", "Compare the bound"];
const call = (user = ownerId, challengeId = id, body = {}) => {
  const req = request(createApp())
    .post(`/api/challenges/${challengeId}/hint-drafts`)
    .send(body);
  return user ? req.set(...sessionHeader(user)) : req;
};
beforeEach(() => {
  store = setupStore();
  id = store.add();
  requestHintDrafts.mockReset().mockResolvedValue(hints);
});
afterEach(() => vi.restoreAllMocks());

it("returns suggestions from stored allowed text without saving or changing any record", async () => {
  const before = structuredClone(store.records.get(id));
  const response = await call(ownerId, id, {
    title: "FORGED TITLE",
    questions: [{ acceptedAnswer: "FORGED ANSWER" }],
    progressiveHints: ["FORGED HINT"],
    status: "published",
  });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ data: { hints } });
  expect(requestHintDrafts).toHaveBeenCalledTimes(1);
  const text = requestHintDrafts.mock.calls[0][0];
  expect(JSON.parse(text)).toEqual({
    title: before.title,
    language: before.language,
    objective: before.objective,
    prompt: before.prompt,
    codeSnippet: before.codeSnippet,
    questions: before.questions.map(({ type, prompt }) => ({ type, prompt })),
    appliedCase: { prompt: before.appliedCase.prompt },
  });
  expect(text).not.toMatch(
    /acceptedAnswer|explanation|progressiveHints|classroomId|createdBy|FORGED/,
  );
  expect(store.records.get(id)).toEqual(before);
  expect(store.save).not.toHaveBeenCalled();
});

it("does not send Mixed-field metadata, answers, explanations, existing hints or students", async () => {
  const record = store.records.get(id);
  record.explanation = "SECRET PARENT";
  record.progressiveHints = ["PRIVATE HINT"];
  record.appliedCase.explanation = "SECRET APPLIED";
  record.appliedCase.student = { email: "PRIVATE STUDENT" };
  record.questions[0].explanation = "SECRET BLOCK";
  record.questions[0].acceptedAnswer = "SECRET ANSWER";
  record.questions[0].options[0].label = "SECRET OPTION";
  record.questions[0].student = "PRIVATE USER";
  const before = structuredClone(record);
  expect((await call()).status).toBe(200);
  const text = requestHintDrafts.mock.calls[0][0];
  expect(text).not.toMatch(/SECRET|PRIVATE|options|student|email/);
  expect(store.records.get(id)).toEqual(before);
});

it("allows incomplete stored drafts", async () => {
  id = store.add({
    language: "",
    objective: "",
    questions: [],
    appliedCase: {},
  });
  expect((await call()).status).toBe(200);
  expect(JSON.parse(requestHintDrafts.mock.calls[0][0]).questions).toEqual([]);
});
it("uses classroom ownership even when the draft creator differs", async () => {
  id = store.add({ createdBy: otherId });
  expect((await call()).status).toBe(200);
});
it("accepts uppercase ObjectIds", async () => {
  expect((await call(ownerId, id.toUpperCase())).status).toBe(200);
});
it.each([studentId, otherId])(
  "refuses non-owner %s without calling Gemini",
  async (user) => {
    expect((await call(user)).status).toBe(403);
    expect(requestHintDrafts).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  },
);
it("refuses a student who has the owner's id", async () => {
  store.findUser.mockResolvedValue({ _id: ownerId, role: "student" });
  expect((await call()).status).toBe(403);
  expect(requestHintDrafts).not.toHaveBeenCalled();
});
it("requires a resolved user", async () => {
  expect((await call(null)).status).toBe(401);
  expect(requestHintDrafts).not.toHaveBeenCalled();
});
it("refuses an unknown session before calling Gemini", async () => {
  expect((await call(null).set(...badSessionHeader())).status).toBe(401);
  expect(requestHintDrafts).not.toHaveBeenCalled();
});
it.each(["bad-id", "abc", "g".repeat(24)])(
  "refuses malformed id %s",
  async (badId) => {
    expect((await call(ownerId, badId)).status).toBe(400);
    expect(requestHintDrafts).not.toHaveBeenCalled();
  },
);
it("returns 404 for a missing challenge", async () => {
  expect((await call(ownerId, missingId)).status).toBe(404);
  expect(requestHintDrafts).not.toHaveBeenCalled();
});
it("returns 404 for a missing classroom", async () => {
  store.findClassroom.mockResolvedValue(null);
  expect((await call()).status).toBe(404);
  expect(requestHintDrafts).not.toHaveBeenCalled();
});
it("locks published challenges before calling Gemini", async () => {
  id = store.add({ status: "published" });
  const before = structuredClone(store.records.get(id));
  const response = await call();
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe("CHALLENGE_PUBLISHED");
  expect(requestHintDrafts).not.toHaveBeenCalled();
  expect(store.records.get(id)).toEqual(before);
  expect(store.save).not.toHaveBeenCalled();
});
it.each([
  [503, "HINT_DRAFTS_UNAVAILABLE", "Hint suggestions are not set up."],
  [
    503,
    "HINT_DRAFTS_RATE_LIMITED",
    "Hint suggestions are busy. Try again later.",
  ],
  [502, "HINT_DRAFTS_FAILED", "Hint suggestions failed. Try again."],
])(
  "passes through safe B9a error %i %s without saving",
  async (status, code, message) => {
    const before = structuredClone(store.records.get(id));
    requestHintDrafts.mockRejectedValue(new HttpError(status, code, message));
    const response = await call();
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: { code, message, details: null } });
    expect(store.records.get(id)).toEqual(before);
    expect(store.save).not.toHaveBeenCalled();
  },
);
it("keeps unexpected service errors generic", async () => {
  requestHintDrafts.mockRejectedValue(new Error("secret internal error"));
  const response = await call();
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toContain("secret");
  expect(store.save).not.toHaveBeenCalled();
});
