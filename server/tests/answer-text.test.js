// UX audit item 17: a stored answer as the words the student picked.
import { describe, expect, it } from "vitest";
import { answerText } from "../src/utils/answerText.js";

const options = [
  { id: "line-1", label: "Line 1: let total = 0" },
  { id: "line-2", label: "Line 2: for (...)" },
  { id: "category-1", label: "Off-by-one" },
];

describe("answerText", () => {
  it("gives a predict-output answer's label", () => {
    const question = { type: "predict-output", options: [{ id: "a", label: " 4 " }] };
    expect(answerText(question, "a")).toBe("4");
  });

  it("gives a locate-fault answer as line, then category", () => {
    const question = { type: "locate-fault", options };
    expect(answerText(question, { location: "line-2", category: "category-1" })).toBe(
      "Line 2: for (...), Off-by-one",
    );
  });

  it("numbers a repair order's steps", () => {
    const question = {
      type: "repair-order",
      options: [
        { id: "s1", label: "Read the error" },
        { id: "s2", label: "Fix the bound" },
      ],
    };
    expect(answerText(question, ["s2", "s1"])).toBe("1. Fix the bound\n2. Read the error");
  });

  it("gives an empty string for unknown ids and odd shapes", () => {
    expect(answerText({ type: "predict-output", options }, "zzz")).toBe("");
    expect(answerText({ type: "predict-output", options }, { id: "a" })).toBe("");
    expect(answerText({ type: "repair-order", options }, "s1")).toBe("");
    expect(answerText({ type: "locate-fault", options }, null)).toBe("");
    expect(answerText(undefined, "a")).toBe("");
  });
});
