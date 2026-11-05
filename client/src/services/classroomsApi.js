// ════════════════════════════════════════════════════════════════════
//  Learn-E — classroom wrappers
//  What each call sends; the server decides what the caller may read:
//    createClassroom   the form payload
//    joinClassroom     { joinCode }  <- pass the bare code, not { joinCode },
//                      or the body nests the object twice
//    leaveClassroom    an EMPTY body; students only, once out of every group
//    deleteClassroom   nothing; the owning professor only, and it removes
//                      everything in the classroom
//    getClassroom, getLeaderboard, getInsights, getWaitingOnMe
//                      nothing; plain GETs. The leaderboard's tie order is
//                      the server's (decision G-6)
// ════════════════════════════════════════════════════════════════════
import { api } from './api.js'

// Return the JSON success envelope; reject errors for the owning view to display.

export async function createClassroom(payload) {
  const result = await api.post(`/classrooms`, payload)
  return result.data
}

export async function joinClassroom(joinCode) {
  const result = await api.post(`/classrooms/join`, { joinCode })
  return result.data
}

export async function leaveClassroom(classroomId) {
  const result = await api.put(`/classrooms/${encodeURIComponent(classroomId)}/leave`, {})
  return result.data
}

export async function deleteClassroom(classroomId) {
  await api.delete(`/classrooms/${encodeURIComponent(classroomId)}`)
}

export async function getClassroom(classroomId) {
  const result = await api.get(`/classrooms/${encodeURIComponent(classroomId)}`)
  return result.data
}

export async function getLeaderboard(classroomId) {
  const result = await api.get(`/classrooms/${encodeURIComponent(classroomId)}/leaderboard`)
  return result.data
}

export async function getInsights(classroomId) {
  const result = await api.get(`/classrooms/${encodeURIComponent(classroomId)}/insights`)
  return result.data
}

export async function getWaitingOnMe() {
  const result = await api.get(`/classrooms/waiting`)
  return result.data
}
