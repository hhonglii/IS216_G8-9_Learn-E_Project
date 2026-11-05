// ════════════════════════════════════════════════════════════════════
//  Learn-E — Boss Battle authoring helpers
//  Pure functions for the editor: new questions, generated drafts and the
//  readiness checklist. The checklist repeats the server's publish rules so
//  problems show while typing; the server still decides when publishing.
// ════════════════════════════════════════════════════════════════════
export const MAX_QUESTIONS = 50
const MIN_QUESTIONS = 3
const ANSWER_ROWS = 4

let counter = 0
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

const answerRows = (labels = []) =>
  Array.from({ length: ANSWER_ROWS }, (_, index) => ({
    id: newId('a'),
    label: labels[index] ?? '',
  }))

export function newQuestion() {
  return {
    id: newId('q'),
    code: '',
    prompt: '',
    options: answerRows(),
    correctOptionId: '',
    explanation: '',
    keepOrder: false,
    needsReview: false,
  }
}

// The copy gets new ids, including its answers, so the two never share results.
export function duplicateQuestion(question) {
  const options = answerRows(question.options.map((option) => option.label))
  const correctIndex = question.options.findIndex((o) => o.id === question.correctOptionId)
  return {
    ...question,
    id: newId('q'),
    options,
    correctOptionId: correctIndex >= 0 ? options[correctIndex].id : '',
  }
}

// A generated suggestion becomes a draft that must be approved before publishing.
export function questionFromDraft({ code = '', prompt, answers, correctIndex, explanation }) {
  const options = answerRows(answers)
  return {
    ...newQuestion(),
    code,
    prompt,
    options,
    correctOptionId: options[correctIndex].id,
    explanation,
    needsReview: true,
  }
}

export const filledOptions = (question) => question.options.filter((o) => o.label.trim())

export function questionProblems(question) {
  const problems = []
  const filled = filledOptions(question)
  if (!question.prompt.trim()) problems.push('needs its question text')
  if (filled.length < 2) problems.push('needs at least 2 answers')
  if (new Set(filled.map((o) => o.label.trim())).size !== filled.length)
    problems.push('has two identical answers')
  if (!filled.some((o) => o.id === question.correctOptionId))
    problems.push('needs a correct answer')
  if (!question.explanation.trim()) problems.push('needs a "Why?" explanation')
  if (question.needsReview) problems.push('is a generated draft you have not approved yet')
  return problems
}

// Each entry names the question it belongs to, so the page can jump straight there.
export function readinessChecklist(draft) {
  const items = []
  if (!draft.title.trim()) items.push({ message: 'Give the battle a title.', target: 'title' })
  if (draft.questions.length < MIN_QUESTIONS)
    items.push({
      message: `Add at least ${MIN_QUESTIONS} questions (you have ${draft.questions.length}).`,
      target: 'questions',
    })
  draft.questions.forEach((question, index) => {
    for (const problem of questionProblems(question))
      items.push({ message: `Question ${index + 1} ${problem}.`, target: question.id })
  })
  return items
}
