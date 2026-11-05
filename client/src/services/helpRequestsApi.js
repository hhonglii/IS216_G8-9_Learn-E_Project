// ════════════════════════════════════════════════════════════════════
//  Learn-E — help request wrappers
//  What each call sends, which the handlers must agree with:
//    createHelpRequest    the whole form payload
//    listHelpRequests     nothing; classroom comes from the URL
//    claimHelpRequest     an EMPTY body, so the claim decision is server-only
//    respondToHelpRequest { response }
//    resolveHelpRequest   { resolution }  <- helpful vs unresolved rides here
//    unclaimHelpRequest   an EMPTY body; only the claiming mentor, before a hint
//    withdrawHelpRequest  nothing; only the asker, while the request is open
// ════════════════════════════════════════════════════════════════════
import { api } from './api.js'

// Return the JSON success envelope; reject errors for the owning view to display.

export async function createHelpRequest(payload) {
  const result = await api.post(`/help-requests`, payload)
  return result.data
}

export async function listHelpRequests(classroomId) {
  const result = await api.get(`/classrooms/${encodeURIComponent(classroomId)}/help-requests`)
  return result.data
}

export async function claimHelpRequest(requestId) {
  const result = await api.put(`/help-requests/${encodeURIComponent(requestId)}/claim`, {})
  return result.data
}

export async function respondToHelpRequest(requestId, response) {
  const result = await api.put(`/help-requests/${encodeURIComponent(requestId)}/respond`, {
    response,
  })
  return result.data
}

export async function unclaimHelpRequest(requestId) {
  const result = await api.put(`/help-requests/${encodeURIComponent(requestId)}/unclaim`, {})
  return result.data
}

export async function withdrawHelpRequest(requestId) {
  const result = await api.delete(`/help-requests/${encodeURIComponent(requestId)}`)
  return result.data
}

export async function resolveHelpRequest(requestId, resolution) {
  const result = await api.put(`/help-requests/${encodeURIComponent(requestId)}/resolve`, {
    resolution,
  })
  return result.data
}
