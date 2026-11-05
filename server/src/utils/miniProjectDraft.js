// Mini-project brief rules: what a draft save accepts (H-8), what publishing
// needs, and copying only the allowed fields out of a request body.
import { parsePublicGitHubRepositoryUrl } from "../services/githubService.js";
// has: true if the object has that key (even if its value is empty).
const has = (value, field) => Object.hasOwn(value, field);

// isObject: true only for a plain object like { a: 1 }.
// Rejects null, arrays and strings, which typeof alone would let through.
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// addProblem: adds one { field, message } entry to the problems list.
const addProblem = (details, field, message) =>
  details.push({ field, message });

// The three plain-text fields that share the same rule.
const textFields = ["title", "brief", "rubric"];
// The five stages. Spelling must match the schema and the client exactly.
const stages = ["Diagnose", "Repair", "Extend", "Verify", "Reflect"];
const objectIdPattern = /^[a-fA-F0-9]{24}$/;

// The optional fields follow the same rules for drafts and for publishing.
// A blank starter URL or qualifying challenge means "none" (H-8), so a draft
// can clear one it saved earlier.
function checkOptionalFields(body, details) {
  // starterRepoUrl must pass the shared GitHub URL parser (decision E-4).
  if (has(body, "starterRepoUrl")) {
    if (typeof body.starterRepoUrl !== "string") {
      addProblem(
        details,
        "starterRepoUrl",
        "Starter repository URL must be a string.",
      );
    } else if (body.starterRepoUrl.trim()) {
      try {
        parsePublicGitHubRepositoryUrl(body.starterRepoUrl);
      } catch {
        addProblem(
          details,
          "starterRepoUrl",
          "Starter repository must be a GitHub URL like https://github.com/owner/repo.",
        );
      }
    }
  }

  // qualifyingChallengeId must be a 24-character hex id. Whether that challenge
  // exists, is published and is in THIS classroom is checked in the controller,
  // because a utils file should not query the database.
  if (
    has(body, "qualifyingChallengeId") &&
    body.qualifyingChallengeId !== "" &&
    (typeof body.qualifyingChallengeId !== "string" ||
      !objectIdPattern.test(body.qualifyingChallengeId))
  ) {
    addProblem(
      details,
      "qualifyingChallengeId",
      "Qualifying challenge id must be a MongoDB ObjectId.",
    );
  }
}

// What a draft save accepts (H-8): a title, and every other field the
// professor has filled in so far, each of the right type. Blank text and an
// empty list are fine until publishing. An empty list means the body is valid.
export function validateMiniProjectDraft(body) {
  const details = [];
  if (!isObject(body))
    return [{ field: "body", message: "Mini-project body must be an object." }];

  if (typeof body.title !== "string" || !body.title.trim()) {
    addProblem(details, "title", "Title must be a non-empty string.");
  }
  for (const field of ["brief", "rubric"]) {
    if (has(body, field) && typeof body[field] !== "string") {
      addProblem(
        details,
        field,
        `${field[0].toUpperCase()}${field.slice(1)} must be a string.`,
      );
    }
  }
  if (has(body, "stageInstructions")) {
    if (!isObject(body.stageInstructions)) {
      addProblem(
        details,
        "stageInstructions",
        "Stage instructions must be an object.",
      );
    } else {
      for (const stage of stages) {
        const value = body.stageInstructions[stage];
        if (value !== undefined && typeof value !== "string") {
          addProblem(
            details,
            `stageInstructions.${stage}`,
            "Stage instruction must be a string.",
          );
        }
      }
    }
  }
  if (has(body, "acceptanceCriteria")) {
    if (
      !Array.isArray(body.acceptanceCriteria) ||
      body.acceptanceCriteria.some((item) => typeof item !== "string")
    ) {
      addProblem(
        details,
        "acceptanceCriteria",
        "Acceptance criteria must be an array of strings.",
      );
    }
  }
  if (
    has(body, "maxGroupSize") &&
    (!Number.isInteger(body.maxGroupSize) || body.maxGroupSize < 1)
  ) {
    addProblem(
      details,
      "maxGroupSize",
      "Maximum group size must be a whole number of at least 1.",
    );
  }
  checkOptionalFields(body, details);
  return details;
}

// What publishing needs: every required field complete. Run on the stored
// draft, so the rules are the ones creation used before drafts existed (E-1).
// An empty list means the brief can be published.
export function publicationProblems(brief) {
  const details = [];

  // title, brief, rubric: each must be a string that is not empty after trimming.
  // typeof comes first so .trim() never runs on a non-string.
  for (const field of textFields) {
    if (typeof brief[field] !== "string" || !brief[field].trim()) {
      addProblem(
        details,
        field,
        `${field[0].toUpperCase()}${field.slice(1)} must be a non-empty string.`,
      );
    }
  }

  // stageInstructions must be an object holding all five stages.
  if (!isObject(brief.stageInstructions)) {
    addProblem(
      details,
      "stageInstructions",
      "Stage instructions must be an object.",
    );
  } else {
    for (const stage of stages) {
      const value = brief.stageInstructions[stage];
      if (typeof value !== "string" || !value.trim()) {
        addProblem(
          details,
          `stageInstructions.${stage}`,
          "Stage instruction must be a non-empty string.",
        );
      }
    }
  }

  // acceptanceCriteria: a list with at least one non-empty text entry.
  if (!Array.isArray(brief.acceptanceCriteria)) {
    addProblem(
      details,
      "acceptanceCriteria",
      "Acceptance criteria must be an array of strings.",
    );
  } else if (brief.acceptanceCriteria.length === 0) {
    addProblem(
      details,
      "acceptanceCriteria",
      "At least one acceptance criterion is required.",
    );
  } else {
    brief.acceptanceCriteria.forEach((criterion, index) => {
      if (typeof criterion !== "string" || !criterion.trim()) {
        addProblem(
          details,
          `acceptanceCriteria.${index}`,
          "Acceptance criterion must be a non-empty string.",
        );
      }
    });
  }

  // maxGroupSize: a whole number of at least 1, with no upper limit (E-3).
  // Number.isInteger rejects 2.5 and also the text "3".
  if (!Number.isInteger(brief.maxGroupSize) || brief.maxGroupSize < 1) {
    addProblem(
      details,
      "maxGroupSize",
      "Maximum group size must be a whole number of at least 1.",
    );
  }

  checkOptionalFields(brief, details);
  return details;
}

// Call only after validateMiniProjectDraft passed, or .trim() could crash.
// Only the fields sent are returned, so an update keeps the rest. Copying named
// fields into a fresh object means the client can never set status, createdBy
// or classroomId through the request body. A blank optional field comes back
// as undefined, which clears it when set on the document.
export function draftMiniProjectFields(body) {
  const fields = { title: body.title.trim() };

  for (const field of ["brief", "rubric"])
    if (has(body, field)) fields[field] = body[field].trim();

  // Saving any stage saves all five, blank where nothing was typed yet.
  if (has(body, "stageInstructions")) {
    fields.stageInstructions = {};
    for (const stage of stages)
      fields.stageInstructions[stage] = (
        body.stageInstructions[stage] ?? ""
      ).trim();
  }

  // Blank criteria are dropped, so a half-typed list never stores empty entries.
  if (has(body, "acceptanceCriteria"))
    fields.acceptanceCriteria = body.acceptanceCriteria
      .map((item) => item.trim())
      .filter(Boolean);

  if (has(body, "maxGroupSize")) fields.maxGroupSize = body.maxGroupSize;

  // The starter URL is stored in the parser's canonical form.
  if (has(body, "starterRepoUrl")) {
    if (body.starterRepoUrl.trim()) {
      const { owner, repo } = parsePublicGitHubRepositoryUrl(
        body.starterRepoUrl,
      );
      fields.starterRepoUrl = `https://github.com/${owner}/${repo}`;
    } else fields.starterRepoUrl = undefined;
  }
  if (has(body, "qualifyingChallengeId"))
    fields.qualifyingChallengeId = body.qualifyingChallengeId || undefined;

  return fields;
}
