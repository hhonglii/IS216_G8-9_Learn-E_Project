// ════════════════════════════════════════════════════════════════════
//  Learn-E — challenge request wrappers
//  Every wrapper builds the URL and returns the envelope; api.js adds the
//  login token. Call these from components instead of adding axios calls.
//    authoring:  createChallenge · updateChallenge · publishChallenge
//                · getChallenge · draftHints · draftChallengeContent
//    attempts:   createAttempt · submitAppliedDiagnosis · reviewAttempt
// ════════════════════════════════════════════════════════════════════
import { api } from './api.js'

// Return the JSON success envelope; reject errors for the owning view to display.

export async function createChallenge(classroomId, payload) {
  const result = await api.post(
    `/classrooms/${encodeURIComponent(classroomId)}/challenges`,
    payload,
  )
  return result.data
}

export async function updateChallenge(challengeId, payload) {
  const result = await api.put(`/challenges/${encodeURIComponent(challengeId)}`, payload)
  return result.data
}

// This call sends an empty body on purpose. Every input to
// publication comes from stored server state, never from the browser, so the
// handler must re-read the draft and validate it itself.
// Removes a draft for good; the server refuses a published challenge.
export async function deleteChallenge(challengeId) {
  await api.delete(`/challenges/${encodeURIComponent(challengeId)}`)
}

export async function publishChallenge(challengeId) {
  const result = await api.post(`/challenges/${encodeURIComponent(challengeId)}/publish`, {})
  return result.data
}

// An empty body on purpose, like publishChallenge. The
// server reads the stored draft and returns suggestions only; saving the
// chosen hints is a normal updateChallenge call by the professor.
// Allow the server its 30-second Gemini limit plus time to return the result.
export async function draftHints(challengeId) {
  const result = await api.post(
    `/challenges/${encodeURIComponent(challengeId)}/hint-drafts`,
    {},
    { timeout: 35000 },
  )
  return result.data
}

// Generate from current Vue form values, including unsaved edits. Only the
// fields above the requested section are sent; saving remains a separate action.
export async function draftChallengeContent(classroomId, field, draft) {
  const fields = ['title', 'language', 'objective']
  if (['codeSnippet', 'explanation', 'appliedCasePrompt'].includes(field)) fields.push('prompt')
  if (['explanation', 'appliedCasePrompt'].includes(field)) fields.push('codeSnippet')
  const context = Object.fromEntries(fields.map((key) => [key, draft[key] ?? '']))
  const result = await api.post(
    `/classrooms/${encodeURIComponent(classroomId)}/challenge-content-drafts`,
    { field, draft: context },
    { timeout: 35000 },
  )
  return result.data
}

export async function getChallenge(challengeId) {
  const result = await api.get(`/challenges/${encodeURIComponent(challengeId)}`)
  return result.data
}

export async function createAttempt(challengeId, payload) {
  const result = await api.post(`/challenges/${encodeURIComponent(challengeId)}/attempts`, payload)
  return result.data
}

export async function submitAppliedDiagnosis(attemptId, payload) {
  const result = await api.put(`/attempts/${encodeURIComponent(attemptId)}/applied`, payload)
  return result.data
}

export async function reviewAttempt(attemptId, payload) {
  const result = await api.put(`/attempts/${encodeURIComponent(attemptId)}/review`, payload)
  return result.data
}
