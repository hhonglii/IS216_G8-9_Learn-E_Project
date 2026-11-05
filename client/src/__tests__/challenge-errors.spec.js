// Phase B message checks.
import { describe, expect, it } from 'vitest'
import { describeChallengeError } from '../utils/challengeErrors.js'

const failure = (code, details, status = 400) => ({
  response: { status, data: { error: { code, message: 'Technical server wording', details } } },
})
const detail = (field, message = 'Non-empty text is required to publish.') => ({ field, message })
const draft = {
  questions: [
    { type: 'predict-output' },
    {
      type: 'locate-fault',
      options: [{ id: 'line-1' }, { id: 'category-1' }, { id: 'line-2' }],
    },
    { type: 'repair-order' },
  ],
}

describe('Phase B user-facing errors', () => {
  it('turns the reported first-question explanation error into a clear field instruction', () => {
    const result = describeChallengeError(
      failure('VALIDATION_FAILED', [detail('questions.0.explanation'), detail('explanation')]),
      'publish',
      draft,
    )
    expect(result.message).toContain('Your challenge is still a draft.')
    expect(result.message).toContain('save your changes and publish again')
    expect(result.problems).toEqual([
      'Question 1: Add a Question explanation explaining why the accepted answer is correct.',
      'Add an Official explanation for the challenge.',
    ])
    // What the professor reads never names a stored field; the field only
    // travels with each item so the page can link to it.
    expect(JSON.stringify([result.message, result.problems])).not.toMatch(
      /questions\.0|Non-empty text|Technical server/,
    )
    expect(result.items.map((item) => item.field)).toEqual([
      'questions.0.explanation',
      'explanation',
    ])
  })

  it.each([
    ['title', 'Challenge title'],
    ['language', 'Language'],
    ['objective', 'Learning objective'],
    ['prompt', 'Challenge prompt'],
    ['codeSnippet', 'Code snippet'],
    ['appliedCase.prompt', 'Applied-case prompt'],
  ])('names the visible %s field', (field, label) => {
    const result = describeChallengeError(
      failure('VALIDATION_FAILED', [detail(field)]),
      'save',
      draft,
    )
    expect(result.message).toContain('Save changes')
    expect(result.problems[0]).toContain(label)
    expect(result.problems[0]).not.toContain('string')
  })

  it('explains the question/hint minimums and uses one-based hint numbers', () => {
    const result = describeChallengeError(
      failure('VALIDATION_FAILED', [
        detail('questions', 'At least one structured block is required to publish.'),
        detail('progressiveHints', 'At least two non-empty hints are required to publish.'),
        detail('progressiveHints.1'),
      ]),
      'publish',
      draft,
    )
    expect(result.problems).toEqual([
      'Add at least one question using Add question.',
      'Add at least two non-empty hints in Progressive hints.',
      'Hint 2: Enter some hint text, or remove this empty hint.',
    ])
  })

  it.each([
    [
      'questions.0.options',
      'At least two valid choices or steps are required to publish.',
      'Question 1: Add at least two answer options.',
    ],
    [
      'questions.2.options',
      'At least two valid choices or steps are required to publish.',
      'Question 3: Add at least two repair steps.',
    ],
    [
      'questions.0.options.1.label',
      'Option label must be a non-empty string.',
      'Question 1: Enter text for answer option 2, or remove it.',
    ],
    [
      'questions.1.options',
      'At least two line choices and two error categories are required to publish.',
      'Question 2: Add at least two line choices and two error categories.',
    ],
    [
      'questions.1.options.2.label',
      'Option label must be a non-empty string.',
      'Question 2: Enter text for line choice 2, or remove it.',
    ],
    [
      'questions.1.options.1.label',
      'Option label must be a non-empty string.',
      'Question 2: Enter text for error category 1, or remove it.',
    ],
    [
      'questions.2.options.0.label',
      'Option label must be a non-empty string.',
      'Question 3: Enter text for repair step 1, or remove it.',
    ],
    [
      'questions.0.acceptedAnswer',
      'Accepted answer must identify an existing option or be empty in a draft.',
      'Question 1: Choose the correct answer from Accepted option.',
    ],
    [
      'questions.1.acceptedAnswer.location',
      'Non-empty text is required to publish.',
      'Question 2: Choose the right line in Accepted line.',
    ],
    [
      'questions.1.acceptedAnswer.category',
      'Non-empty text is required to publish.',
      'Question 2: Choose the right category in Accepted error category.',
    ],
    [
      'questions.2.acceptedAnswer.0',
      'Each accepted step must be a unique supplied string id.',
      'Question 3: In Correct repair order, include every repair step exactly once.',
    ],
    [
      'questions.2.acceptedAnswer',
      'Repair steps must be listed in a different order from the correct order.',
      'Question 3: Students start from the Repair steps as listed, so list them in a different order from Correct repair order.',
    ],
  ])('gives an actionable correction for %s', (field, message, expected) => {
    expect(
      describeChallengeError(
        failure('VALIDATION_FAILED', [detail(field, message)]),
        'publish',
        draft,
      ).problems,
    ).toEqual([expected])
  })

  it.each([
    ['UNAUTHENTICATED', 401, 'Log in again'],
    ['FORBIDDEN', 403, 'Only the professor who owns this classroom'],
    ['CHALLENGE_NOT_FOUND', 404, 'Refresh the challenge list'],
    ['CLASSROOM_NOT_FOUND', 404, 'Return to Dashboard'],
    ['CHALLENGE_CONFLICT', 409, 'Copy any unsaved edits, reopen the draft'],
    ['CHALLENGE_PUBLISHED', 409, 'read-only'],
    ['PAYLOAD_TOO_LARGE', 413, 'Shorten the code snippet'],
  ])('explains %s without showing raw server wording', (code, status, expected) => {
    const result = describeChallengeError(failure(code, null, status), 'save', draft)
    expect(result.message).toContain(expected)
    expect(result.message).not.toContain('Technical server')
  })

  // G16 replaced the user switcher with login, so no message may ask to select a user.
  it.each([
    ['UNAUTHENTICATED', 401, 'save', 'You are logged out. Log in again, then open the classroom.'],
    [
      'FORBIDDEN',
      403,
      'classroom',
      'You do not have access to this classroom. Students can join it with its join code on Dashboard.',
    ],
    [
      'FORBIDDEN',
      403,
      'save',
      'Only the professor who owns this classroom can manage its challenges.',
    ],
  ])('words %s for logged-in people (%s, %s)', (code, status, action, expected) => {
    const result = describeChallengeError(failure(code, null, status), action, draft)
    expect(result.message).toBe(expected)
    expect(result.message).not.toMatch(/select/i)
  })

  it.each([
    ['HINT_DRAFTS_UNAVAILABLE', 'Hint suggestions are not set up.'],
    ['HINT_DRAFTS_RATE_LIMITED', 'Hint suggestions are busy. Wait a moment, then try again.'],
    [
      'HINT_DRAFTS_FAILED',
      'Could not generate hint suggestions. Try again, or add hints manually.',
    ],
  ])('gives clear hint guidance for %s', (code, expected) => {
    expect(describeChallengeError(failure(code, null, 503), 'hints').message).toBe(expected)
  })

  it('distinguishes an unknown save outcome from a confirmed validation rejection', () => {
    const offline = describeChallengeError(new Error('raw socket error'), 'create')
    const timeout = describeChallengeError({ code: 'ECONNABORTED' }, 'save')
    const invalid = describeChallengeError(
      failure('VALIDATION_FAILED', [detail('title')]),
      'create',
    )
    expect(offline.message).toContain('confirm the save')
    expect(timeout.message).toContain('took too long to confirm')
    expect(offline.message).toContain('Your edits have been kept.')
    expect(invalid.message).toContain('Save draft again')
    expect(invalid.problems).toContain('Enter a Challenge title.')
  })

  it('deduplicates details, ignores malformed entries and hides unexpected fields/messages', () => {
    const details = [
      null,
      {},
      { field: 2, message: 'bad' },
      detail('questions.0.explanation'),
      detail('questions.0.explanation'),
      detail('private.internalPath', 'Do not show raw server content'),
    ]
    const result = describeChallengeError(failure('VALIDATION_FAILED', details), 'publish', draft)
    expect(result.problems).toHaveLength(2)
    expect(JSON.stringify(result)).not.toMatch(/private|internalPath|raw server content/)
    expect(() =>
      describeChallengeError(failure('VALIDATION_FAILED', 'bad'), 'publish'),
    ).not.toThrow()
  })

  it('supports a single detail object and safe fallback messages', () => {
    const single = describeChallengeError(failure('VALIDATION_FAILED', detail('title')), 'save')
    expect(single.problems).toEqual(['Enter a Challenge title.'])
    const server = describeChallengeError(failure('INTERNAL_ERROR', null, 500), 'save')
    expect(server.message).toContain('Your edits have been kept.')
    expect(server.message).not.toContain('Technical server')
  })
})
