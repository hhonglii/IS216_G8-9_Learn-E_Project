// "Fight the boss" for a professor: the same answers and replies as the server's
// plays endpoints, run on the unsaved draft in this browser, so nothing is
// recorded and the professor can test before saving or publishing.
import { filledOptions, questionProblems } from './bossBattleEditor.js'

function shuffled(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// A preview can run before everything is finished, using only the complete questions.
export const playableQuestions = (draft) =>
  draft.questions.filter(
    (question) => questionProblems({ ...question, needsReview: false }).length === 0,
  )

export function createPreviewEngine(draft) {
  const questions = playableQuestions(draft)
  const byId = new Map(questions.map((question) => [question.id, question]))
  let queue = []
  let heartsLeft = 0
  let missedIds = new Set()

  function dto() {
    const inProgress = heartsLeft > 0 && queue.length > 0
    const current = inProgress ? byId.get(queue[0]) : null
    const options = current ? filledOptions(current).map(({ id, label }) => ({ id, label })) : []
    return {
      id: 'preview',
      status: inProgress ? 'in-progress' : heartsLeft > 0 ? 'won' : 'lost',
      heartsLeft,
      maxHearts: draft.hearts,
      totalQuestions: questions.length,
      remaining: queue.length,
      currentQuestion: current && {
        id: current.id,
        code: current.code,
        prompt: current.prompt,
        options: current.keepOrder ? options : shuffled(options),
      },
      missed: inProgress
        ? []
        : questions
            .filter((question) => missedIds.has(question.id))
            .map((question) => ({
              id: question.id,
              code: question.code,
              prompt: question.prompt,
              explanation: question.explanation,
              correctAnswer:
                question.options.find((option) => option.id === question.correctOptionId)?.label ??
                '',
            })),
    }
  }

  return {
    async start() {
      queue = questions.map((question) => question.id)
      heartsLeft = draft.hearts
      missedIds = new Set()
      return dto()
    },
    async answer(_playId, questionId, optionId) {
      const question = byId.get(questionId)
      const correct = optionId === question.correctOptionId
      const [current, ...rest] = queue
      queue = correct ? rest : [...rest, current]
      if (!correct) {
        heartsLeft -= 1
        missedIds.add(questionId)
      }
      // Like the server, no explanation after a wrong answer: the question comes back.
      return { correct, explanation: correct ? question.explanation : '', play: dto() }
    },
  }
}
