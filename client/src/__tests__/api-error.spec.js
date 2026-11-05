// The shared reader for failed API calls (third-pass audit T).
import { describe, it, expect } from 'vitest'
import { apiErrorMessage, apiErrorDetails } from '../utils/apiError.js'

const refused = (error) => ({ response: { status: 400, data: { error } } })

describe('apiErrorMessage', () => {
  it("uses the server's message, else the page's fallback, else a generic one", () => {
    expect(apiErrorMessage(refused({ message: 'Enter a join code.' }), 'x')).toBe(
      'Enter a join code.',
    )
    expect(apiErrorMessage(refused({}), "Couldn't join.")).toBe("Couldn't join.")
    expect(apiErrorMessage(refused({}))).toBe('Something went wrong.')
  })

  it('says the server could not be reached when there was no response', () => {
    expect(apiErrorMessage(new Error('Network Error'), "Couldn't join.")).toBe(
      'Could not reach the server.',
    )
  })
})

describe('apiErrorDetails', () => {
  it('joins the per-field messages when the server listed them', () => {
    const err = refused({
      message: 'Check the highlighted fields.',
      details: [{ message: 'Give the task a title.' }, { message: 'Choose an owner.' }],
    })
    expect(apiErrorDetails(err, 'x')).toBe('Give the task a title. Choose an owner.')
  })

  it('falls back to the overall message without details', () => {
    expect(apiErrorDetails(refused({ message: 'Log in to continue.', details: [] }), 'x')).toBe(
      'Log in to continue.',
    )
    expect(apiErrorDetails(new Error('Network Error'), 'x')).toBe('Could not reach the server.')
  })
})
