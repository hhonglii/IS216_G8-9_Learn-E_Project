// ════════════════════════════════════════════════════════════════════
//  Learn-E — GitHub refresh wrapper
//  refreshGroupGitHub POSTs an EMPTY body to /groups/:id/github/refresh, so
//  every input comes from the URL and the login, and the server decides
//  everything. Attaching the URL is NOT here: that is
//  groupsApi.attachRepository, a PUT to /groups/:id/repository.
// ════════════════════════════════════════════════════════════════════
import { api } from './api.js'

// Return the JSON success envelope; reject errors for the owning view to display.

export async function refreshGroupGitHub(groupId) {
  const result = await api.post(`/groups/${encodeURIComponent(groupId)}/github/refresh`, {})
  return result.data
}
