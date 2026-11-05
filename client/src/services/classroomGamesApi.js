// ════════════════════════════════════════════════════════════════════
//  Learn-E — Classroom Games request wrappers
//    both roles:  getClassroomGame
//    professor:   saveClassroomGame · publishClassroomGame · unpublishClassroomGame
//                 · getClassroomGameResults · draftGameQuestions
//    student:     startGamePlay · answerGamePlay
// ════════════════════════════════════════════════════════════════════
import { api } from './api.js'

const gamePath = (classroomId) => `/classrooms/${encodeURIComponent(classroomId)}/game`

export async function getClassroomGame(classroomId) {
  const result = await api.get(gamePath(classroomId))
  return result.data
}

export async function saveClassroomGame(classroomId, draft) {
  const result = await api.put(gamePath(classroomId), draft)
  return result.data
}

// Empty bodies on purpose: the server reads the stored draft itself.
export async function publishClassroomGame(classroomId) {
  const result = await api.post(`${gamePath(classroomId)}/publish`, {})
  return result.data
}

export async function unpublishClassroomGame(classroomId) {
  const result = await api.post(`${gamePath(classroomId)}/unpublish`, {})
  return result.data
}

export async function getClassroomGameResults(classroomId) {
  const result = await api.get(`${gamePath(classroomId)}/results`)
  return result.data
}

// Allow the server its 30-second Gemini limit plus time to return the result.
export async function draftGameQuestions(classroomId, request) {
  const result = await api.post(`${gamePath(classroomId)}/question-drafts`, request, {
    timeout: 35000,
  })
  return result.data
}

export async function startGamePlay(classroomId) {
  const result = await api.post(`${gamePath(classroomId)}/plays`, {})
  return result.data
}

export async function answerGamePlay(playId, questionId, optionId, answerCount) {
  const result = await api.post(`/game-plays/${encodeURIComponent(playId)}/answers`, {
    questionId,
    optionId,
    answerCount,
  })
  return result.data
}
