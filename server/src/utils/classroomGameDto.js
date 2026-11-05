// Role-specific Boss Battle DTOs. Only the owning professor's DTO carries correct
// answers and explanations. A student receives one question at a time without
// them, and sees answers only for missed questions once the run has ended.
import { filledOptions } from "./classroomGameDraft.js";

export function toProfessorGameDto(game) {
  return {
    id: String(game._id),
    classroomId: String(game.classroomId),
    title: game.title ?? "",
    bossId: game.bossId,
    hearts: game.hearts,
    status: game.status,
    version: game.version,
    questions: game.questions.map((question) => ({
      id: question.id,
      code: question.code ?? "",
      prompt: question.prompt ?? "",
      options: question.options.map(({ id, label }) => ({ id, label })),
      correctOptionId: question.correctOptionId ?? "",
      explanation: question.explanation ?? "",
      keepOrder: question.keepOrder === true,
      needsReview: question.needsReview === true,
    })),
    updatedAt: game.updatedAt?.toISOString?.() ?? null,
  };
}

export function toStudentGameDto(game) {
  return {
    id: String(game._id),
    title: game.title,
    bossId: game.bossId,
    hearts: game.hearts,
    questionCount: game.questions.length,
  };
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toStudentQuestion(question) {
  const options = filledOptions(question).map(({ id, label }) => ({ id, label }));
  return {
    id: question.id,
    code: question.code ?? "",
    prompt: question.prompt,
    options: question.keepOrder ? options : shuffled(options),
  };
}

export function toPlayDto(play, game) {
  const byId = new Map(game.questions.map((question) => [question.id, question]));
  const inProgress = play.status === "in-progress";
  const current = inProgress ? byId.get(play.questionQueue[0]) : null;
  const dto = {
    id: String(play._id),
    status: play.status,
    heartsLeft: play.heartsLeft,
    maxHearts: play.maxHearts,
    totalQuestions: game.questions.length,
    remaining: play.questionQueue.length,
    answerCount: play.answers.length,
    currentQuestion: current ? toStudentQuestion(current) : null,
    missed: [],
  };
  if (!inProgress) {
    const missedIds = new Set(
      play.answers.filter((answer) => !answer.correct).map((answer) => answer.questionId),
    );
    dto.missed = game.questions
      .filter((question) => missedIds.has(question.id))
      .map((question) => ({
        id: question.id,
        code: question.code ?? "",
        prompt: question.prompt,
        explanation: question.explanation,
        correctAnswer:
          question.options.find((option) => option.id === question.correctOptionId)?.label ?? "",
      }));
  }
  return dto;
}
