// Boss Battle input rules. A draft only has to be well formed, so autosave can
// store unfinished work; publishing then checks the stored draft is playable.
// BOSS_IDS must match client/src/components/classroom-games/bosses.js.
export const BOSS_IDS = [
  "null-slime",
  "infinite-wyrm",
  "off-by-one-golem",
  "memory-kraken",
  "race-ghost",
  "syntax-spider",
];

export const GAME_LIMITS = {
  title: 120,
  code: 4000,
  prompt: 1000,
  option: 500,
  explanation: 2000,
  maxQuestions: 50,
  minQuestions: 3,
  maxOptions: 4,
  minOptions: 2,
  minHearts: 1,
  maxHearts: 10,
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value) => typeof value === "string" && ID_PATTERN.test(value);

function checkText(value, limit, field, label, details) {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    details.push({ field, message: `${label} must be text.` });
    return "";
  }
  if (value.length > limit)
    details.push({
      field,
      message: `${label} must be ${limit} characters or fewer.`,
    });
  return value;
}

function checkOptions(options, path, details) {
  if (!Array.isArray(options)) {
    details.push({ field: `${path}.options`, message: "Answers must be a list." });
    return [];
  }
  if (options.length > GAME_LIMITS.maxOptions)
    details.push({
      field: `${path}.options`,
      message: `A question can have at most ${GAME_LIMITS.maxOptions} answers.`,
    });
  const seen = new Set();
  return options.map((option, index) => {
    const optionPath = `${path}.options.${index}`;
    if (!isObject(option) || !validId(option.id) || seen.has(option.id)) {
      details.push({
        field: optionPath,
        message: "Each answer needs its own valid id.",
      });
      return { id: "", label: "" };
    }
    seen.add(option.id);
    return {
      id: option.id,
      label: checkText(
        option.label,
        GAME_LIMITS.option,
        `${optionPath}.label`,
        "An answer",
        details,
      ),
    };
  });
}

function checkQuestion(question, index, seen, details) {
  const path = `questions.${index}`;
  if (!isObject(question) || !validId(question.id) || seen.has(question.id)) {
    details.push({ field: path, message: "Each question needs its own valid id." });
    return null;
  }
  seen.add(question.id);
  const options = checkOptions(question.options, path, details);
  const correctOptionId = question.correctOptionId ?? "";
  if (
    correctOptionId !== "" &&
    !options.some((option) => option.id === correctOptionId)
  )
    details.push({
      field: `${path}.correctOptionId`,
      message: "The correct answer must be one of this question's answers.",
    });
  for (const flag of ["keepOrder", "needsReview"]) {
    if (question[flag] !== undefined && typeof question[flag] !== "boolean")
      details.push({
        field: `${path}.${flag}`,
        message: "This setting must be true or false.",
      });
  }
  return {
    id: question.id,
    code: checkText(question.code, GAME_LIMITS.code, `${path}.code`, "Code", details),
    prompt: checkText(
      question.prompt,
      GAME_LIMITS.prompt,
      `${path}.prompt`,
      "The question",
      details,
    ),
    options,
    correctOptionId,
    explanation: checkText(
      question.explanation,
      GAME_LIMITS.explanation,
      `${path}.explanation`,
      "The explanation",
      details,
    ),
    keepOrder: question.keepOrder === true,
    needsReview: question.needsReview === true,
  };
}

// Returns only the known fields that were sent, so a body cannot set status,
// version, classroomId or createdBy.
export function validateGameDraft(body) {
  if (!isObject(body))
    return {
      details: [{ field: "body", message: "The game must be an object." }],
      fields: {},
    };
  const details = [];
  const fields = {};
  if (body.title !== undefined)
    fields.title = checkText(
      body.title,
      GAME_LIMITS.title,
      "title",
      "The title",
      details,
    );
  if (body.bossId !== undefined) {
    if (BOSS_IDS.includes(body.bossId)) fields.bossId = body.bossId;
    else details.push({ field: "bossId", message: "Choose one of the monsters." });
  }
  if (body.hearts !== undefined) {
    if (
      Number.isInteger(body.hearts) &&
      body.hearts >= GAME_LIMITS.minHearts &&
      body.hearts <= GAME_LIMITS.maxHearts
    )
      fields.hearts = body.hearts;
    else
      details.push({
        field: "hearts",
        message: `Hearts must be a whole number from ${GAME_LIMITS.minHearts} to ${GAME_LIMITS.maxHearts}.`,
      });
  }
  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions)) {
      details.push({ field: "questions", message: "Questions must be a list." });
    } else if (body.questions.length > GAME_LIMITS.maxQuestions) {
      details.push({
        field: "questions",
        message: `A game can have at most ${GAME_LIMITS.maxQuestions} questions.`,
      });
    } else {
      const seen = new Set();
      fields.questions = body.questions.map((question, index) =>
        checkQuestion(question, index, seen, details),
      );
    }
  }
  return { details, fields };
}

// An answer row left blank is simply not offered, so only filled rows count.
export const filledOptions = (question) =>
  question.options.filter((option) => option.label?.trim());

// Checks the stored draft and words each problem for the readiness checklist.
export function validateGamePublication(game) {
  const details = [];
  if (!game.title?.trim())
    details.push({ field: "title", message: "Give the battle a title." });
  if (!BOSS_IDS.includes(game.bossId))
    details.push({ field: "bossId", message: "Choose a monster." });
  if (game.questions.length < GAME_LIMITS.minQuestions)
    details.push({
      field: "questions",
      message: `Add at least ${GAME_LIMITS.minQuestions} questions.`,
    });
  game.questions.forEach((question, index) => {
    const path = `questions.${index}`;
    const name = `Question ${index + 1}`;
    if (!question.prompt?.trim())
      details.push({ field: `${path}.prompt`, message: `${name} needs its question text.` });
    const filled = filledOptions(question);
    if (filled.length < GAME_LIMITS.minOptions)
      details.push({
        field: `${path}.options`,
        message: `${name} needs at least ${GAME_LIMITS.minOptions} answers.`,
      });
    if (new Set(filled.map((option) => option.label.trim())).size !== filled.length)
      details.push({
        field: `${path}.options`,
        message: `${name} has two identical answers.`,
      });
    if (!filled.some((option) => option.id === question.correctOptionId))
      details.push({
        field: `${path}.correctOptionId`,
        message: `${name} needs a correct answer.`,
      });
    if (!question.explanation?.trim())
      details.push({
        field: `${path}.explanation`,
        message: `${name} needs a "Why?" explanation.`,
      });
    if (question.needsReview)
      details.push({
        field: `${path}.needsReview`,
        message: `${name} is a generated draft you have not approved yet.`,
      });
  });
  return details;
}

// Generation receives only what the professor typed for this request.
export function validateGameDraftRequest(body) {
  if (!isObject(body))
    return {
      details: [{ field: "body", message: "The request must be an object." }],
      request: null,
    };
  const details = [];
  const topic = checkText(body.topic, 500, "topic", "The topic", details).trim();
  const language = checkText(body.language, 100, "language", "The language", details).trim();
  const code = checkText(body.code, GAME_LIMITS.code, "code", "The code", details);
  if (!topic && !code.trim())
    details.push({ field: "topic", message: "Enter a topic or some code first." });
  const count = body.count ?? 5;
  if (!Number.isInteger(count) || count < 1 || count > 10)
    details.push({ field: "count", message: "Ask for 1 to 10 questions." });
  return { details, request: { topic, language, code, count } };
}
