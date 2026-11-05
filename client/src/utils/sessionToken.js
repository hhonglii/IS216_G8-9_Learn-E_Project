// The session token in localStorage, the one thing the browser keeps between
// visits (decision G-15). Storage can be blocked, so every call is wrapped in
// try/catch and a blocked read counts as logged out.
const key = 'learn-e.sessionToken'

export function getSessionToken() {
  try {
    return window.localStorage.getItem(key)?.trim() || null
  } catch {
    return null
  }
}
export function setSessionToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new TypeError('Session token must be a non-empty string')
  }
  try {
    window.localStorage.setItem(key, token.trim())
  } catch {
    // Blocked storage: the token is not kept, so the person stays logged out.
  }
}
export function clearSessionToken() {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Blocked storage: there is no stored token to remove.
  }
}
