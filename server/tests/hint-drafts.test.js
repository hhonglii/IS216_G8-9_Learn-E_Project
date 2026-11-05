// B9a service contract tests. No real Gemini quota is used.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "../src/config/environment.js";
import { requestHintDrafts } from "../src/services/geminiService.js";

const key = "test-key-do-not-expose";
const model = "gemini-test-flash";
const original = {
  key: environment.geminiApiKey,
  model: environment.geminiModel,
};
let fakeFetch;
const responseWith = (value) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
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

describe("B9a checked hint generation", () => {
  it.each([
    [
      [" Trace the loop ", "Check the bound\n"],
      ["Trace the loop", "Check the bound"],
    ],
    [
      ["Trace", "Compare", "Inspect the final iteration"],
      ["Trace", "Compare", "Inspect the final iteration"],
    ],
  ])("returns trimmed two-or-three hints %j", async (input, expected) => {
    fakeFetch.mockResolvedValue(responseWith(input));
    expect(await requestHintDrafts("safe draft text")).toEqual(expected);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, options] = fakeFetch.mock.calls[0];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    );
    expect(url).not.toContain(key);
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body);
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "safe draft text" }] },
    ]);
    expect(body.systemInstruction.parts[0].text).toMatch(
      /Do not reveal the correct answer/,
    );
    expect(body.generationConfig).toEqual({
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: { type: "STRING" },
        minItems: 2,
        maxItems: 3,
      },
    });
    expect(options.body).not.toContain(key);
  });

  it.each([
    ["geminiApiKey", ""],
    ["geminiApiKey", "   "],
    ["geminiModel", ""],
    ["geminiModel", " \n "],
    ["geminiModel", "https://other.test/model"],
    ["geminiModel", "../model"],
    ["geminiModel", "model?key=secret"],
    ["geminiModel", "model/name"],
  ])(
    "refuses unavailable/invalid configuration %s %j before fetching",
    async (field, value) => {
      environment[field] = value;
      await expect(requestHintDrafts("draft")).rejects.toMatchObject({
        status: 503,
        code: "HINT_DRAFTS_UNAVAILABLE",
        message: "Hint suggestions are not set up.",
      });
      expect(fakeFetch).not.toHaveBeenCalled();
    },
  );

  it("trims configuration", async () => {
    environment.geminiApiKey = ` ${key} `;
    environment.geminiModel = ` ${model} `;
    fakeFetch.mockResolvedValue(responseWith(["Trace", "Compare"]));
    await requestHintDrafts("draft");
    expect(fakeFetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe(key);
    expect(fakeFetch.mock.calls[0][0]).toContain(`/${model}:generateContent`);
  });

  it("joins text parts and ignores model thinking", async () => {
    fakeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "private model reasoning" },
                { text: '["Trace",' },
                { text: '"Compare"]' },
              ],
            },
          },
        ],
      }),
    });
    expect(await requestHintDrafts("draft")).toEqual(["Trace", "Compare"]);
  });

  it.each([429, 400, 401, 403, 404, 500, 503])(
    "maps upstream %i without reading/logging its error",
    async (status) => {
      const json = vi.fn(() => {
        throw new Error(key);
      });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      fakeFetch.mockResolvedValue({ ok: false, status, json });
      await expect(requestHintDrafts("draft")).rejects.toMatchObject({
        status: status === 429 ? 503 : 502,
        code:
          status === 429 ? "HINT_DRAFTS_RATE_LIMITED" : "HINT_DRAFTS_FAILED",
        details: null,
      });
      expect(json).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each([
    new TypeError(key),
    new DOMException(key, "TimeoutError"),
    new DOMException(key, "AbortError"),
  ])("sanitizes network/timeout failures", async (error) => {
    fakeFetch.mockRejectedValue(error);
    await expect(requestHintDrafts("draft")).rejects.toMatchObject({
      status: 502,
      code: "HINT_DRAFTS_FAILED",
      message: "Hint suggestions failed. Try again.",
      details: null,
    });
  });

  it("supplies a bounded abort signal and handles an aborted request", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    fakeFetch.mockImplementation(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          queueMicrotask(() =>
            controller.abort(new DOMException(key, "TimeoutError")),
          );
        }),
    );
    await expect(requestHintDrafts("draft")).rejects.toMatchObject({
      status: 502,
      code: "HINT_DRAFTS_FAILED",
    });
    expect(timeout).toHaveBeenCalledWith(30000);
  });

  it.each([
    [],
    ["only one"],
    ["a", "b", "c", "d"],
    ["a", ""],
    ["a", " \n "],
    ["a", null],
    ["a", 12],
    ["a", {}],
    { hints: ["a", "b"] },
    null,
    "a, b",
  ])("rejects malformed hint arrays %j", async (hints) => {
    fakeFetch.mockResolvedValue(responseWith(hints));
    await expect(requestHintDrafts("draft")).rejects.toMatchObject({
      status: 502,
      code: "HINT_DRAFTS_FAILED",
    });
  });

  it.each([
    {},
    { candidates: [] },
    { candidates: [{ content: { parts: [] } }] },
    { candidates: [{ content: { parts: [{ text: "not JSON" }] } }] },
    {
      candidates: [
        { content: { parts: [{ text: '```json\n["a","b"]\n```' }] } },
      ],
    },
    {
      candidates: [
        {
          content: { parts: [{ text: '["a","b"]' }] },
          finishReason: "MAX_TOKENS",
        },
      ],
    },
    {
      candidates: [
        { content: { parts: [{ text: '["a","b"]' }] }, finishReason: "SAFETY" },
      ],
    },
  ])("rejects invalid candidate payload %j", async (payload) => {
    fakeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });
    await expect(requestHintDrafts("draft")).rejects.toMatchObject({
      status: 502,
      code: "HINT_DRAFTS_FAILED",
    });
  });

  it("sanitizes invalid response JSON", async () => {
    fakeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error(key);
      },
    });
    await expect(requestHintDrafts("draft")).rejects.toMatchObject({
      status: 502,
      code: "HINT_DRAFTS_FAILED",
      message: "Hint suggestions failed. Try again.",
    });
  });
});
