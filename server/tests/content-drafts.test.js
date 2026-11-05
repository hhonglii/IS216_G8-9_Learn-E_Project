// Provider contracts use mocked fetch only; no API key or live quota is needed.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { environment } from "../src/config/environment.js";
import { requestContentDraft } from "../src/services/geminiService.js";

const key = "private-test-key";
const model = "gemini-test-flash";
const original = {
  key: environment.geminiApiKey,
  model: environment.geminiModel,
};
const context = {
  title: "Trace loops",
  language: "JavaScript",
  objective: "Understand iteration",
  prompt: "Predict the output",
  codeSnippet: "console.log(1);",
  explanation: "PRIVATE OLD EXPLANATION",
  appliedCase: { prompt: "PRIVATE EXISTING APPLIED CASE" },
  appliedCasePrompt: "PRIVATE EXISTING TARGET",
  questions: [{ acceptedAnswer: "PRIVATE BLOCK ANSWER" }],
  student: { email: "PRIVATE STUDENT" },
  acceptedAnswer: "PRIVATE ANSWER",
};
let fakeFetch;
const responseWith = (value, finishReason = "STOP") => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [
      { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
    ],
  }),
});
beforeEach(() => {
  environment.geminiApiKey = key;
  environment.geminiModel = model;
  fakeFetch = vi.fn();
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => {
  environment.geminiApiKey = original.key;
  environment.geminiModel = original.model;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  [
    "prompt",
    ["title", "language", "objective"],
    /programming challenge prompt/,
  ],
  [
    "codeSnippet",
    ["title", "language", "objective", "prompt"],
    /raw code without Markdown fences/,
  ],
  [
    "explanation",
    ["title", "language", "objective", "prompt", "codeSnippet"],
    /official explanation/,
  ],
  [
    "appliedCasePrompt",
    ["title", "language", "objective", "prompt", "codeSnippet"],
    /distinct real-world transfer\/application scenario/,
  ],
])(
  "requests checked %s content using only preceding fields",
  async (field, fields, instruction) => {
    fakeFetch.mockResolvedValue(responseWith({ content: " Generated text\n" }));
    expect(await requestContentDraft(field, context)).toBe("Generated text");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, options] = fakeFetch.mock.calls[0];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    );
    expect(url).not.toContain(key);
    expect(options.redirect).toBe("error");
    expect(options.headers["x-goog-api-key"]).toBe(key);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body);
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(
      Object.fromEntries(fields.map((name) => [name, context[name]])),
    );
    expect(options.body).not.toMatch(
      /PRIVATE|acceptedAnswer|explanation.*PRIVATE/,
    );
    expect(body.systemInstruction.parts[0].text).toMatch(instruction);
    expect(body.generationConfig).toEqual({
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { content: { type: "STRING" } },
        required: ["content"],
      },
    });
  },
);

it("asks for a plain-text transfer scenario without giving the solution", async () => {
  fakeFetch.mockResolvedValue(
    responseWith({
      content: "Apply this loop to a shopping cart. Explain your reasoning.",
    }),
  );
  await requestContentDraft("appliedCasePrompt", context);
  const body = JSON.parse(fakeFetch.mock.calls[0][1].body);
  const instruction = body.systemInstruction.parts[0].text;
  expect(instruction).toContain("new situation");
  expect(instruction).toContain("debug a related problem");
  expect(instruction).toContain("explain their reasoning");
  expect(instruction).toContain("Do not repeat the main prompt");
  expect(instruction).toContain("reveal an answer, or provide a full solution");
  expect(instruction).toContain("raw plain text without Markdown fences");
});

it.each([
  ["geminiApiKey", ""],
  ["geminiApiKey", "  "],
  ["geminiModel", ""],
  ["geminiModel", "../model"],
  ["geminiModel", "https://other.test/model"],
])("sanitizes unavailable configuration %s", async (field, value) => {
  environment[field] = value;
  await expect(requestContentDraft("prompt", context)).rejects.toMatchObject({
    status: 503,
    code: "CONTENT_DRAFTS_UNAVAILABLE",
    details: null,
  });
  expect(fakeFetch).not.toHaveBeenCalled();
});

it.each([429, 400, 401, 403, 500, 503])(
  "sanitizes upstream %s without reading its error body",
  async (status) => {
    const json = vi.fn(() => {
      throw new Error(key);
    });
    fakeFetch.mockResolvedValue({ ok: false, status, json });
    await expect(requestContentDraft("prompt", context)).rejects.toMatchObject({
      status: status === 429 ? 503 : 502,
      code:
        status === 429
          ? "CONTENT_DRAFTS_RATE_LIMITED"
          : "CONTENT_DRAFTS_FAILED",
      details: null,
    });
    expect(json).not.toHaveBeenCalled();
  },
);

it.each([
  null,
  [],
  "text",
  {},
  { content: "" },
  { content: " \n " },
  { content: 7 },
  { content: null },
  { content: "x", extra: "PRIVATE" },
])("rejects malformed generated content %#", async (content) => {
  fakeFetch.mockResolvedValue(responseWith(content));
  await expect(requestContentDraft("prompt", context)).rejects.toMatchObject({
    status: 502,
    code: "CONTENT_DRAFTS_FAILED",
  });
});
it.each([
  ["prompt", 12000],
  ["codeSnippet", 20000],
  ["explanation", 30000],
  ["appliedCasePrompt", 12000],
])(
  "bounds generated %s so it can feed the next action",
  async (field, limit) => {
    fakeFetch.mockResolvedValue(
      responseWith({ content: "x".repeat(limit + 1) }),
    );
    await expect(requestContentDraft(field, context)).rejects.toMatchObject({
      status: 502,
      code: "CONTENT_DRAFTS_FAILED",
    });
    fakeFetch.mockResolvedValue(responseWith({ content: "x".repeat(limit) }));
    expect((await requestContentDraft(field, context)).length).toBe(limit);
  },
);

it.each(["MAX_TOKENS", "SAFETY", "", null])(
  "rejects incomplete finish reason %j",
  async (reason) => {
    fakeFetch.mockResolvedValue(
      responseWith({ content: "Partial output" }, reason),
    );
    await expect(requestContentDraft("prompt", context)).rejects.toMatchObject({
      status: 502,
      code: "CONTENT_DRAFTS_FAILED",
    });
  },
);
it.each([
  {},
  { candidates: [] },
  { candidates: [{ finishReason: "STOP", content: { parts: [] } }] },
  {
    candidates: [
      { finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } },
    ],
  },
])("rejects malformed candidate payload %#", async (payload) => {
  fakeFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  });
  await expect(requestContentDraft("prompt", context)).rejects.toMatchObject({
    status: 502,
    code: "CONTENT_DRAFTS_FAILED",
  });
});
it("requires an explicit STOP and joins non-thinking text parts", async () => {
  fakeFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { thought: true, text: "private model thought" },
              { text: '{"content":' },
              { text: '"Result"}' },
            ],
          },
        },
      ],
    }),
  });
  expect(await requestContentDraft("prompt", context)).toBe("Result");
  fakeFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '{"content":"Result"}' }] } }],
    }),
  });
  await expect(requestContentDraft("prompt", context)).rejects.toMatchObject({
    code: "CONTENT_DRAFTS_FAILED",
  });
});
it.each([new TypeError(key), new DOMException(key, "TimeoutError")])(
  "sanitizes network and timeout errors",
  async (error) => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fakeFetch.mockRejectedValue(error);
    await expect(requestContentDraft("prompt", context)).rejects.toMatchObject({
      status: 502,
      code: "CONTENT_DRAFTS_FAILED",
      details: null,
    });
    expect(timeout).toHaveBeenCalledWith(30000);
  },
);
it.each(["questions", "__proto__", "constructor", null])(
  "rejects unsupported target %j before fetching",
  async (field) => {
    await expect(requestContentDraft(field, context)).rejects.toMatchObject({
      status: 400,
      code: "CONTENT_DRAFT_INVALID",
    });
    expect(fakeFetch).not.toHaveBeenCalled();
  },
);
