// Phase B display messages; API validation and error codes stay unchanged.
const textFields = {
  title: 'Enter a Challenge title.',
  language: 'Enter a Language, such as JavaScript.',
  objective: 'Describe what students should learn in Learning objective.',
  prompt: 'Enter the problem statement in Challenge prompt.',
  codeSnippet: 'Enter the Code snippet as text, or leave it blank.',
  explanation: 'Add an Official explanation for the challenge.',
  appliedCase: 'Add an Applied-case prompt so students can apply what they learned.',
  'appliedCase.prompt': 'Add an Applied-case prompt so students can apply what they learned.',
}

// Name an option the way the builder labels it: locate-fault choices are numbered
// within their own list, so the server's index into options is converted.
function optionName(block, index) {
  if (block?.type === 'repair-order') return `Repair step ${index + 1}`
  if (block?.type !== 'locate-fault') return `Answer option ${index + 1}`
  const id = block.options?.[index]?.id ?? ''
  const prefix = ['line-', 'category-'].find((start) => id.startsWith(start))
  if (!prefix) return `Choice ${index + 1}`
  const position = block.options
    .slice(0, index + 1)
    .filter((option) => option.id?.startsWith(prefix)).length
  return `${prefix === 'line-' ? 'Line choice' : 'Error category'} ${position}`
}

function describeProblem(problem, draft) {
  const { field, message } = problem
  if (Object.hasOwn(textFields, field)) return textFields[field]
  if (field === 'progressiveHints') {
    return message.includes('At least two')
      ? 'Add at least two non-empty hints in Progressive hints.'
      : 'Check Progressive hints and enter each hint as text.'
  }
  const hint = /^progressiveHints\.(\d+)$/.exec(field)
  if (hint) return `Hint ${Number(hint[1]) + 1}: Enter some hint text, or remove this empty hint.`
  if (field === 'questions') {
    return message.includes('At least one')
      ? 'Add at least one question using Add question.'
      : 'The questions could not be read. Copy your edits, reopen the draft and try again.'
  }
  const question = /^questions\.(\d+)(?:\.(.*))?$/.exec(field)
  if (question) {
    const index = Number(question[1])
    const prefix = `Question ${index + 1}: `
    const part = question[2] ?? ''
    const type = draft?.questions?.[index]?.type
    const repair = type === 'repair-order'
    if (part === 'prompt') return prefix + 'Enter the question in Question prompt.'
    if (part === 'explanation') {
      return prefix + 'Add a Question explanation explaining why the accepted answer is correct.'
    }
    if (part === 'type') {
      return (
        prefix + 'Choose Predict output, Locate fault or Repair order when adding this question.'
      )
    }
    if (part === 'options') {
      if (type === 'locate-fault') {
        return (
          prefix +
          (message.includes('At least two')
            ? 'Add at least two line choices and two error categories.'
            : 'Check the line choices and error categories and add each one separately.')
        )
      }
      if (message.includes('At least two')) {
        return (
          prefix + (repair ? 'Add at least two repair steps.' : 'Add at least two answer options.')
        )
      }
      return (
        prefix +
        (repair
          ? 'Check the repair steps and add each step separately.'
          : 'Check the answer options and add each option separately.')
      )
    }
    const option = /^options\.(\d+)(?:\.(id|label))?$/.exec(part)
    if (option) {
      const label = optionName(draft?.questions?.[index], Number(option[1]))
      return (
        prefix +
        (option[2] === 'id'
          ? `${label} could not be identified. Remove it and add it again.`
          : `Enter text for ${label.toLowerCase()}, or remove it.`)
      )
    }
    if (part === 'acceptedAnswer.location')
      return prefix + 'Choose the right line in Accepted line.'
    if (part === 'acceptedAnswer.category')
      return prefix + 'Choose the right category in Accepted error category.'
    if (part === 'acceptedAnswer' || /^acceptedAnswer\.\d+$/.test(part)) {
      if (repair && message?.includes('different order')) {
        return (
          prefix +
          'Students start from the Repair steps as listed, so list them in a different order from Correct repair order.'
        )
      }
      if (repair) return prefix + 'In Correct repair order, include every repair step exactly once.'
      if (type === 'locate-fault')
        return prefix + 'Choose both Accepted line and Accepted error category.'
      return prefix + 'Choose the correct answer from Accepted option.'
    }
    if (part === 'order')
      return prefix + 'Reopen the draft, check the question order and save again.'
    return (
      prefix + 'This question could not be saved. Copy your edits, reopen the draft and try again.'
    )
  }
  if (field === 'id') return 'Open the classroom or draft from its list instead of using this link.'
  if (['status', 'classroomId', 'createdBy', 'body'].includes(field)) {
    return 'Copy your edits, reopen the draft from the classroom and try again.'
  }
  return 'Check the draft content and try again.'
}

const linkableField =
  /^(title|language|objective|prompt|codeSnippet|explanation|appliedCase(\.prompt)?|progressiveHints(\.\d+)?|questions(\.\d+(\.[\w.]+)?)?)$/

export function describeChallengeError(error, action, draft) {
  const reply = error?.response?.data?.error
  const code = reply?.code ?? error?.code
  const status = error?.response?.status
  const saving = action === 'create' || action === 'save'
  const saveButton = action === 'create' ? 'Save draft' : 'Save changes'
  const details = Array.isArray(reply?.details)
    ? reply.details
    : reply?.details && typeof reply.details === 'object'
      ? [reply.details]
      : []
  // items keep the field each message came from, so the page can link to it;
  // two fields with the same message are listed once, under the first. Only
  // fields the editor has are kept; the page never shows a field's name.
  const items = []
  for (const item of details) {
    if (!item || typeof item.field !== 'string' || typeof item.message !== 'string') continue
    const message = describeProblem(item, draft)
    if (items.some((known) => known.message === message)) continue
    items.push(linkableField.test(item.field) ? { message, field: item.field } : { message })
  }
  const problems = items.map((item) => item.message)
  let message
  if (code === 'UNAUTHENTICATED' || status === 401) {
    message = 'You are logged out. Log in again, then open the classroom.'
  } else if (code === 'FORBIDDEN' || status === 403) {
    message =
      action === 'classroom'
        ? 'You do not have access to this classroom. Students can join it with its join code on Dashboard.'
        : 'Only the professor who owns this classroom can manage its challenges.'
  } else if (code === 'CLASSROOM_NOT_FOUND' || (status === 404 && action === 'classroom')) {
    message =
      'This classroom is no longer available. Return to Dashboard and open a classroom from your list.'
  } else if (code === 'CHALLENGE_NOT_FOUND' || status === 404) {
    message =
      'This challenge is no longer available. Refresh the challenge list and choose another draft.'
  } else if (code === 'CHALLENGE_CONFLICT') {
    message =
      'This draft changed in another window. Copy any unsaved edits, reopen the draft and try again.'
  } else if (code === 'CHALLENGE_PUBLISHED') {
    message =
      'This challenge has already been published and is read-only. Create a new draft to make changes.'
  } else if (code === 'PAYLOAD_TOO_LARGE' || status === 413) {
    message =
      'The draft is too large to save. Shorten the code snippet or other long text, then try again. Your edits have been kept.'
  } else if (code === 'HINT_DRAFTS_UNAVAILABLE') {
    message = 'Hint suggestions are not set up.'
  } else if (code === 'HINT_DRAFTS_RATE_LIMITED') {
    message = 'Hint suggestions are busy. Wait a moment, then try again.'
  } else if (code === 'HINT_DRAFTS_FAILED') {
    message = 'Could not generate hint suggestions. Try again, or add hints manually.'
  } else if (code === 'CONTENT_DRAFTS_UNAVAILABLE') {
    message = 'Gemini content generation is not set up. You can still enter the content manually.'
  } else if (code === 'CONTENT_DRAFTS_RATE_LIMITED') {
    message =
      'Gemini is busy. Wait a moment, then click the create button again. Your existing text has been kept.'
  } else if (code === 'CONTENT_DRAFTS_FAILED') {
    message =
      'Could not generate this section. Click the create button to try again, or enter it manually. Your existing text has been kept.'
  } else if (code === 'CONTENT_DRAFT_INVALID' || (action === 'content' && status === 400)) {
    message =
      'Check the required fields above this create button, then try again. Your existing text has been kept.'
  } else if (code === 'VALIDATION_FAILED' || status === 400 || problems.length) {
    if (action === 'publish') {
      message = problems.length
        ? 'Before publishing, fix the items below, save your changes and publish again. Your challenge is still a draft.'
        : 'Check the challenge content, save your changes and publish again. Your challenge is still a draft.'
    } else if (saving) {
      message = problems.length
        ? `Fix the items below, then click ${saveButton} again. Your edits have been kept.`
        : `Check the draft content, then click ${saveButton} again. Your edits have been kept.`
    } else {
      message =
        action === 'classroom'
          ? 'This classroom link is invalid. Open the classroom from Dashboard.'
          : 'This challenge link is invalid. Open the draft from the classroom challenge list.'
    }
  } else if (!error?.response) {
    const timeout = ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)
    if (saving) {
      message = timeout
        ? 'The save request took too long to confirm. Your edits have been kept. Check your connection and try saving again.'
        : 'Could not reach the server to confirm the save. Your edits have been kept. Check your connection and try saving again.'
    } else if (action === 'publish') {
      message =
        'Could not confirm publication. Your edits have been kept. Check your connection and refresh the challenge list before trying again.'
    } else if (action === 'hints') {
      message = timeout
        ? 'Hint suggestions took too long. Try again, or add hints manually.'
        : 'Could not reach the server for hint suggestions. Check your connection and try again, or add hints manually.'
    } else if (action === 'content') {
      message = timeout
        ? 'Content generation took too long. Click the create button to try again. Your existing text has been kept.'
        : 'Could not reach the server to generate content. Check your connection and try again. Your existing text has been kept.'
    } else {
      message = `Could not reach the server to load this ${action === 'classroom' ? 'classroom' : 'draft'}. Check your connection and try again.`
    }
  } else if (saving) {
    message = `Could not save the draft. Your edits have been kept. Try ${saveButton} again in a moment.`
  } else if (action === 'publish') {
    message =
      'Could not confirm publication. Your edits have been kept. Refresh the challenge list before trying again.'
  } else if (action === 'hints') {
    message = 'Could not generate hint suggestions. Try again, or add hints manually.'
  } else if (action === 'content') {
    message =
      'Could not generate this section. Click the create button to try again, or enter it manually. Your existing text has been kept.'
  } else {
    message = `Could not load this ${action === 'classroom' ? 'classroom' : 'draft'}. Try again in a moment.`
  }
  return { message, problems, items }
}
