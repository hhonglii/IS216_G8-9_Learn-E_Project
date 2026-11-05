// B5a/B8 role-specific DTOs.
// Return the answer-bearing professor DTO only after ownership checks.
import { upgradeLocateFault } from "./locateFault.js";

// Sort a copy so reading never changes the stored block array.
export const orderedQuestions = (challenge) =>
  [...challenge.questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

function professorAnswer(question) {
  if (question.type === "locate-fault")
    return upgradeLocateFault(question).acceptedAnswer;
  if (question.type === "repair-order")
    return [...(question.acceptedAnswer ?? [])];
  return question.acceptedAnswer ?? "";
}

export function toProfessorChallengeDto(challenge) {
  return {
    id: String(challenge._id),
    classroomId: String(challenge.classroomId),
    title: challenge.title,
    language: challenge.language ?? "",
    objective: challenge.objective ?? "",
    prompt: challenge.prompt ?? "",
    codeSnippet: challenge.codeSnippet ?? "",
    questions: orderedQuestions(challenge).map((question) => ({
      id: String(question._id),
      type: question.type,
      prompt: question.prompt ?? "",
      options:
        question.type === "locate-fault"
          ? upgradeLocateFault(question).options
          : question.options.map(({ id, label }) => ({ id, label })),
      acceptedAnswer: professorAnswer(question),
      explanation: question.explanation ?? "",
      order: question.order,
    })),
    appliedCase: { prompt: challenge.appliedCase?.prompt ?? "" },
    progressiveHints: [...challenge.progressiveHints],
    explanation: challenge.explanation ?? "",
    status: challenge.status,
    createdBy: String(challenge.createdBy),
    createdAt: challenge.createdAt.toISOString(),
    updatedAt: challenge.updatedAt.toISOString(),
  };
}

// Mixed values must not forward nested metadata through an allowed field.
const publicText = (value) => (typeof value === "string" ? value : "");

export function toLearnerChallengeDto(challenge) {
  return {
    id: String(challenge._id),
    classroomId: String(challenge.classroomId),
    title: challenge.title,
    language: challenge.language ?? "",
    objective: challenge.objective ?? "",
    prompt: challenge.prompt ?? "",
    codeSnippet: challenge.codeSnippet ?? "",
    questions: orderedQuestions(challenge).map((question) => ({
      id: String(question._id),
      type: question.type,
      prompt: question.prompt ?? "",
      options: Array.isArray(question.options)
        ? (question.type === "locate-fault"
            ? upgradeLocateFault(question).options
            : question.options
          ).map((option) => ({
            id: publicText(option?.id),
            label: publicText(option?.label),
          }))
        : [],
      order: question.order,
    })),
    appliedCase: { prompt: publicText(challenge.appliedCase?.prompt) },
    // How many hints exist; the hints themselves come with the attempt as they unlock.
    hintCount: Array.isArray(challenge.progressiveHints)
      ? challenge.progressiveHints.length
      : 0,
    status: challenge.status,
    createdBy: String(challenge.createdBy),
    createdAt: challenge.createdAt.toISOString(),
    updatedAt: challenge.updatedAt.toISOString(),
  };
}
