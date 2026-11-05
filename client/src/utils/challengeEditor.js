// B3/B4 editor copies and request projection.
let nextBlockKey = 0

export function copyDraft(value) {
  return JSON.parse(JSON.stringify(value))
}

export function newQuestion(type) {
  return {
    id: `new-block-${++nextBlockKey}`,
    type,
    prompt: '',
    options: [],
    acceptedAnswer:
      type === 'locate-fault' ? { location: '', category: '' } : type === 'repair-order' ? [] : '',
    explanation: '',
  }
}

export function workingCopy(saved = {}) {
  return copyDraft({
    title: saved.title ?? '',
    language: saved.language ?? '',
    objective: saved.objective ?? '',
    prompt: saved.prompt ?? '',
    codeSnippet: saved.codeSnippet ?? '',
    questions: (saved.questions ?? []).map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt ?? '',
      options: question.options ?? [],
      acceptedAnswer:
        question.acceptedAnswer ??
        (question.type === 'locate-fault'
          ? { location: '', category: '' }
          : question.type === 'repair-order'
            ? []
            : ''),
      explanation: question.explanation ?? '',
    })),
    appliedCase: { prompt: saved.appliedCase?.prompt ?? '' },
    progressiveHints: saved.progressiveHints ?? [],
    explanation: saved.explanation ?? '',
  })
}

// UX audit item 7: a line choice for each line of the code snippet that has
// text, numbered the way students see the snippet (blank lines still count).
export function lineChoiceLabels(codeSnippet) {
  return (codeSnippet ?? '')
    .split('\n')
    .map((text, index) => ({ text: text.trim(), number: index + 1 }))
    .filter((line) => line.text)
    .map((line) => `Line ${line.number}: ${line.text}`)
}

// The mistakes the error-category help text names, offered as one-click choices.
export const commonErrorCategories = [
  'Off-by-one',
  'Wrong operator',
  'Wrong variable',
  'Missing return',
  'Wrong condition',
  'Syntax error',
]

// Adds choices to one group of a locate-fault block. Typed choices stay, blank
// rows go, and a label the group already has (in any case) is not added again.
export function withAddedChoices(groupOptions, prefix, labels) {
  const kept = groupOptions.filter((option) => option.label.trim())
  const seen = new Set(kept.map((option) => option.label.trim().toLowerCase()))
  const usedIds = new Set(kept.map((option) => option.id))
  let number = 1
  const added = []
  for (const label of labels) {
    if (seen.has(label.toLowerCase())) continue
    while (usedIds.has(`${prefix}${number}`)) number++
    usedIds.add(`${prefix}${number}`)
    seen.add(label.toLowerCase())
    added.push({ id: `${prefix}${number}`, label })
  }
  return [...kept, ...added]
}

// Clears any accepted answer that names a choice the block no longer has.
export function withoutMissingAnswers(block) {
  const ids = new Set(block.options.map((option) => option.id))
  const kept = (id) => (ids.has(id) ? id : '')
  const acceptedAnswer =
    block.type === 'repair-order'
      ? block.acceptedAnswer.filter((id) => ids.has(id))
      : block.type === 'locate-fault'
        ? {
            location: kept(block.acceptedAnswer.location),
            category: kept(block.acceptedAnswer.category),
          }
        : kept(block.acceptedAnswer)
  return { ...block, acceptedAnswer }
}

export function draftPayload(draft, updating = false) {
  // Send editable content only. The server owns parent references, status and order.
  // The list editors leave blank rows behind (UX audit item 5); they mean nothing,
  // and the server refuses a blank option, so they are dropped here.
  const payload = workingCopy(draft)
  payload.progressiveHints = payload.progressiveHints.filter((hint) => hint.trim())
  payload.questions = payload.questions.map(({ id, ...question }) => {
    const options = question.options
      .filter((option) => option.label.trim())
      .map((option) => ({ id: option.id, label: option.label }))
    return {
      ...withoutMissingAnswers({ ...question, options }),
      ...(updating && /^[a-f0-9]{24}$/i.test(id ?? '') ? { id } : {}),
    }
  })
  return payload
}

// UX audit item 2: what publishing needs, checked live as the professor types.
// The rules follow the server's publish check (challengePublication.js); blank
// choices and hints don't count, because saving drops them. Each item's field
// uses the server's names, so the page can jump to it the same way it jumps to
// a problem the server reported.
const filled = (text) => typeof text === 'string' && text.trim() !== ''

function blockReady(block) {
  if (!filled(block.prompt) || !filled(block.explanation)) return false
  const choices = (block.options ?? []).filter((option) => filled(option.label))
  const ids = choices.map((option) => option.id)
  if (block.type === 'locate-fault') {
    const count = (prefix) => ids.filter((id) => id.startsWith(prefix)).length
    const answer = block.acceptedAnswer ?? {}
    return (
      count('line-') >= 2 &&
      count('category-') >= 2 &&
      ids.includes(answer.location) &&
      ids.includes(answer.category)
    )
  }
  if (block.type === 'repair-order') {
    const answer = Array.isArray(block.acceptedAnswer) ? block.acceptedAnswer : []
    // Students start from the listed order, so it must differ from the answer.
    return (
      ids.length >= 2 &&
      answer.length === ids.length &&
      ids.every((id) => answer.includes(id)) &&
      answer.some((id, position) => id !== ids[position])
    )
  }
  return ids.length >= 2 && ids.includes(block.acceptedAnswer)
}

const blockNeeds = {
  'predict-output': 'prompt, two options, the accepted option and an explanation',
  'locate-fault':
    'prompt, two line choices, two error categories, both accepted answers and an explanation',
  'repair-order':
    'prompt, two steps listed out of order, all steps in the correct order and an explanation',
}

export function publishChecklist(draft) {
  const questions = draft.questions ?? []
  return [
    { field: 'title', label: 'Challenge title', done: filled(draft.title) },
    { field: 'language', label: 'Language', done: filled(draft.language) },
    { field: 'objective', label: 'Learning objective', done: filled(draft.objective) },
    { field: 'prompt', label: 'Challenge prompt', done: filled(draft.prompt) },
    { field: 'explanation', label: 'Official explanation', done: filled(draft.explanation) },
    ...(questions.length
      ? questions.map((block, index) => ({
          field: `questions.${index}`,
          label: `Question ${index + 1}: ${blockNeeds[block.type] ?? blockNeeds['predict-output']}`,
          done: blockReady(block),
        }))
      : [{ field: 'questions', label: 'At least one question', done: false }]),
    {
      field: 'appliedCase.prompt',
      label: 'Applied-case prompt',
      done: filled(draft.appliedCase?.prompt),
    },
    {
      field: 'progressiveHints',
      label: 'At least two progressive hints',
      done: (draft.progressiveHints ?? []).filter(filled).length >= 2,
    },
  ]
}
