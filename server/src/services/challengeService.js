// Marking rules for challenge answers, kept apart from Express so they can be
// tested on their own: checking each question type, working out progress from
// each question's latest answer, and which hints a student has unlocked.
import { optionGroup, upgradeLocateFault } from "../utils/locateFault.js";

function getLatestAnswers(answers = []) {
  const latestAnswers = new Map();

  for (const answer of answers) {
    latestAnswers.set(String(answer.questionId), answer);
  }

  return latestAnswers;
}

// Calculate progress using each question's latest submitted answer.
export function calculateStructuredProgress(questions, answers = []) {
  const latestAnswers = getLatestAnswers(answers);

  let structuredScore = 0;

  for (const question of questions) {
    const questionId = String(question.id ?? question._id);
    const latest = latestAnswers.get(questionId);

    if (latest?.correct === true) {
      structuredScore++;
    }
  }

  const structuredComplete =
    questions.length > 0 && structuredScore === questions.length;

  return {
    structuredScore,
    structuredComplete,
  };
}

// C-5: Reveal explanations only for correctly answered questions.
export function buildQuestionResults(questions, answers = []) {
  const latestAnswers = getLatestAnswers(answers);

  return questions.map((question) => {
    const questionId = String(question.id ?? question._id);
    const latest = latestAnswers.get(questionId);

    return {
      questionId,
      correct: latest?.correct ?? null,
      ...(latest?.correct === true
        ? { explanation: question.explanation ?? "" }
        : {}),
    };
  });
}

// Each wrong submission unlocks the next progressive hint (H-7), so a learner
// sees them one at a time and only the unlocked ones ever leave the server.
export function unlockedHints(hints = [], answers = []) {
  const wrong = answers.filter((answer) => answer.correct === false).length;
  return hints.slice(0, Math.min(wrong, hints.length)).map(String);
}

function checkPredictOutput(value, question) {
  const validIds = question.options.map((option) => option.id);

  if (
    typeof value !== "string" ||
    !validIds.includes(value)
  ) {
    return { valid: false, correct: false };
  }

  return {
    valid: true,
    correct: value === question.acceptedAnswer,
  };
}

// The answer is a chosen line option id and a chosen category option id.
function checkLocateFault(value, question) {
  const { options, acceptedAnswer } = upgradeLocateFault(question);
  const inGroup = (id, group) =>
    optionGroup(id) === group && options.some((option) => option.id === id);

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !inGroup(value.location, "location") ||
    !inGroup(value.category, "category")
  ) {
    return { valid: false, correct: false };
  }

  return {
    valid: true,
    correct:
      value.location === acceptedAnswer.location &&
      value.category === acceptedAnswer.category,
  };
}

function checkRepairOrder(value, question) {
  const validIds = question.options.map((option) => option.id);

  if (
    !Array.isArray(value) ||
    value.length !== validIds.length ||
    !value.every((id) => typeof id === "string") ||
    new Set(value).size !== value.length ||
    !value.every((id) => validIds.includes(id))
  ) {
    return { valid: false, correct: false };
  }

  const accepted = question.acceptedAnswer;

  return {
    valid: true,
    correct:
      Array.isArray(accepted) &&
      value.length === accepted.length &&
      value.every((id, index) => id === accepted[index]),
  };
}

export function checkAnswer(value, question) {
  switch (question.type) {
    case "predict-output":
      return checkPredictOutput(value, question);

    case "locate-fault":
      return checkLocateFault(value, question);

    case "repair-order":
      return checkRepairOrder(value, question);

    default:
      return { valid: false, correct: false };
  }
}
