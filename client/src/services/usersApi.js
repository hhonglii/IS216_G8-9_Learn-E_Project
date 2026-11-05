// ════════════════════════════════════════════════════════════════════
//  Learn-E — user wrappers
//  Each wrapper builds the URL and returns the envelope; do not add axios calls
//  in a view.
//    getProfile      nothing; the id in the URL is whose profile, and the
//                    caller comes from the login token, so the two stay separate
//    updateMe        { displayName }
//    changePassword  { currentPassword, newPassword }
// ════════════════════════════════════════════════════════════════════
import { api } from './api.js'

// Return the JSON success envelope; reject errors for the owning view to display.

export async function getProfile(userId) {
  const result = await api.get(`/users/${encodeURIComponent(userId)}/profile`)
  return result.data
}

export async function updateMe(displayName) {
  const result = await api.put('/users/me', { displayName })
  return result.data
}

export async function changePassword(currentPassword, newPassword) {
  const result = await api.put('/users/me/password', { currentPassword, newPassword })
  return result.data
}
