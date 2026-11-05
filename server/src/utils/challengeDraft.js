// B5a/B5b validation/projection.
// Draft updates reuse this validation with requireTitle: false for partial updates.
import { optionGroup } from "./locateFault.js";

const stringFields = [
  "title",
  "language",
  "objective",
  "prompt",
  "codeSnippet",
  "explanation",
];
const questionTypes = ["predict-output", "locate-fault", "repair-order"];
const has = (value, field) => Object.hasOwn(value, field);
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const addProblem = (details, field, message) =>
  details.push({ field, message });

function validateOptions(question, path, details) {
  if (!has(question, "options")) return [];
  if (!Array.isArray(question.options)) {
    addProblem(details, `${path}.options`, "Options must be an array.");
    return [];
  }
  const ids = [];
  question.options.forEach((option, index) => {
    const optionPath = `${path}.options.${index}`;
    if (!isObject(option)) {
      addProblem(
        details,
        optionPath,
        "Each option must be an id/label object.",
      );
      return;
    }
    if (
      typeof option.id !== "string" ||
      !option.id.trim() ||
      option.id !== option.id.trim() ||
      (question.type === "repair-order" && option.id.includes(","))
    ) {
      addProblem(
        details,
        `${optionPath}.id`,
        "Option id must be a non-empty string without surrounding whitespace; step ids cannot contain commas.",
      );
    } else if (question.type === "locate-fault" && !optionGroup(option.id)) {
      addProblem(
        details,
        `${optionPath}.id`,
        "Locate-fault option ids must start with line- or category-.",
      );
    } else if (ids.includes(option.id)) {
      addProblem(
        details,
        `${optionPath}.id`,
        "Option ids must be unique within a block.",
      );
    } else {
      ids.push(option.id);
    }
    if (typeof option.label !== "string" || !option.label.trim()) {
      addProblem(
        details,
        `${optionPath}.label`,
        "Option label must be a non-empty string.",
      );
    }
  });
  return ids;
}

function validatePredictAnswer(answer, ids, path, details) {
  if (typeof answer !== "string") {
    addProblem(details, path, "Accepted answer must be a string option id.");
  } else if (answer !== "" && !ids.includes(answer)) {
    addProblem(
      details,
      path,
      "Accepted answer must identify an existing option or be empty in a draft.",
    );
  }
}

function validateLocateAnswer(answer, ids, path, details) {
  if (!isObject(answer)) {
    addProblem(
      details,
      path,
      "Accepted answer must be a location/category object.",
    );
    return;
  }
  if (
    Object.keys(answer).some(
      (field) => !["location", "category"].includes(field),
    )
  ) {
    addProblem(
      details,
      path,
      "Accepted answer may contain only location and category.",
    );
  }
  for (const field of ["location", "category"]) {
    if (typeof answer[field] !== "string") {
      addProblem(
        details,
        `${path}.${field}`,
        "Accepted location and category must both be strings.",
      );
    } else if (
      answer[field] !== "" &&
      (!ids.includes(answer[field]) || optionGroup(answer[field]) !== field)
    ) {
      addProblem(
        details,
        `${path}.${field}`,
        field === "location"
          ? "Accepted line must identify an existing line option or be empty in a draft."
          : "Accepted category must identify an existing category option or be empty in a draft.",
      );
    }
  }
}

function validateRepairAnswer(answer, ids, path, details) {
  if (!Array.isArray(answer)) {
    addProblem(details, path, "Accepted answer must be an array of step ids.");
    return;
  }
  const seen = new Set();
  answer.forEach((id, index) => {
    if (typeof id !== "string" || !ids.includes(id) || seen.has(id)) {
      addProblem(
        details,
        `${path}.${index}`,
        "Each accepted step must be a unique supplied string id.",
      );
    }
    seen.add(id);
  });
}

function validateQuestion(question, index, details) {
  const path = `questions.${index}`;
  if (!isObject(question)) {
    addProblem(details, path, "Question must be an object.");
    return;
  }
  const supported = questionTypes.includes(question.type);
  if (!supported)
    addProblem(details, `${path}.type`, "Question type is not supported.");
  for (const field of ["prompt", "explanation"]) {
    if (has(question, field) && typeof question[field] !== "string") {
      addProblem(
        details,
        `${path}.${field}`,
        "Question text must be a string.",
      );
    }
  }
  if (!supported) return;
  const ids = validateOptions(question, path, details);
  if (!has(question, "acceptedAnswer")) return;
  const answerPath = `${path}.acceptedAnswer`;
  if (question.type === "predict-output") {
    validatePredictAnswer(question.acceptedAnswer, ids, answerPath, details);
  } else if (question.type === "locate-fault") {
    validateLocateAnswer(question.acceptedAnswer, ids, answerPath, details);
  } else {
    validateRepairAnswer(question.acceptedAnswer, ids, answerPath, details);
  }
}

export function validateChallengeDraft(
  body,
  { requireTitle = true, requireMetadata = false } = {},
) {
  const details = [];
  if (!isObject(body))
    return [{ field: "body", message: "Challenge body must be an object." }];
  for (const field of stringFields) {
    const required =
      (field === "title" && requireTitle) ||
      (requireMetadata && ["language", "objective"].includes(field));
    const label = {
      title: "Challenge title",
      language: "Language",
      objective: "Learning objective",
    }[field];
    if (!has(body, field)) {
      if (required)
        addProblem(details, field, `${label} must be a non-empty string.`);
    } else if (
      typeof body[field] !== "string" ||
      ((field === "title" || required) && !body[field].trim())
    ) {
      addProblem(
        details,
        field,
        field === "title" || required
          ? `${label} must be a non-empty string.`
          : "Challenge text must be a string.",
      );
    }
  }
  if (has(body, "questions")) {
    if (!Array.isArray(body.questions))
      addProblem(details, "questions", "Questions must be an array.");
    else
      body.questions.forEach((question, index) =>
        validateQuestion(question, index, details),
      );
  }
  if (has(body, "progressiveHints")) {
    if (!Array.isArray(body.progressiveHints)) {
      addProblem(
        details,
        "progressiveHints",
        "Progressive hints must be an array of strings.",
      );
    } else {
      body.progressiveHints.forEach((hint, index) => {
        if (typeof hint !== "string")
          addProblem(
            details,
            `progressiveHints.${index}`,
            "Hint must be a string.",
          );
      });
    }
  }
  if (has(body, "appliedCase")) {
    if (!isObject(body.appliedCase))
      addProblem(
        details,
        "appliedCase",
        "Applied case must be a prompt object.",
      );
    else if (typeof body.appliedCase.prompt !== "string")
      addProblem(
        details,
        "appliedCase.prompt",
        "Applied-case prompt must be a string.",
      );
  }
  return details;
}

// Call only after validation. Copy allowed content into fresh objects, with
// generated block order and no supplied resource ids, ownership or status.
export function createDraftFields(body) {
  const fields = {};
  for (const field of stringFields) {
    if (has(body, field))
      fields[field] = field === "title" ? body[field].trim() : body[field];
  }
  if (has(body, "questions")) {
    fields.questions = body.questions.map((question, order) => {
      const block = { type: question.type, order };
      for (const field of ["prompt", "explanation"]) {
        if (has(question, field)) block[field] = question[field];
      }
      if (has(question, "options"))
        block.options = question.options.map(({ id, label }) => ({
          id,
          label,
        }));
      if (has(question, "acceptedAnswer")) {
        const answer = question.acceptedAnswer;
        block.acceptedAnswer =
          question.type === "locate-fault"
            ? { location: answer.location, category: answer.category }
            : question.type === "repair-order"
              ? [...answer]
              : answer;
      }
      return block;
    });
  }
  if (has(body, "appliedCase"))
    fields.appliedCase = { prompt: body.appliedCase.prompt };
  if (has(body, "progressiveHints"))
    fields.progressiveHints = [...body.progressiveHints];
  return fields;
}
