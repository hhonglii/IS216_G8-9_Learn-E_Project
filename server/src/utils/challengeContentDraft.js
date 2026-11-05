// Generation receives only editable draft context, never an entire challenge DTO.
const fields = {
  title: { label: "Challenge title", limit: 200 },
  language: { label: "Language", limit: 100 },
  objective: { label: "Learning objective", limit: 2000 },
  prompt: { label: "Challenge prompt", limit: 12000 },
  codeSnippet: { label: "Code snippet", limit: 20000 },
};
const targets = ["prompt", "codeSnippet", "explanation", "appliedCasePrompt"];
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function validateContentDraftRequest(body) {
  if (!isObject(body))
    return {
      details: [
        { field: "body", message: "Generation request must be an object." },
      ],
    };
  const details = [];
  if (!targets.includes(body.field))
    details.push({
      field: "field",
      message: "Choose a supported generation field.",
    });
  if (!isObject(body.draft)) {
    details.push({
      field: "draft",
      message: "Challenge draft must be an object.",
    });
    return { details };
  }
  const required = new Set(["title", "language", "objective"]);
  if (["codeSnippet", "explanation", "appliedCasePrompt"].includes(body.field))
    required.add("prompt");
  if (["explanation", "appliedCasePrompt"].includes(body.field))
    required.add("codeSnippet");
  const context = {};
  for (const [field, { label, limit }] of Object.entries(fields)) {
    if (!required.has(field)) continue;
    const value = body.draft[field];
    if (typeof value !== "string") {
      details.push({ field, message: `${label} must be text.` });
    } else if (required.has(field) && !value.trim()) {
      details.push({
        field,
        message: `${label} is required before generating.`,
      });
    } else if (value.length > limit) {
      details.push({
        field,
        message: `${label} must be ${limit} characters or fewer.`,
      });
    } else {
      context[field] = ["title", "language", "objective"].includes(field)
        ? value.trim()
        : value;
    }
  }
  return { details, field: body.field, context };
}
