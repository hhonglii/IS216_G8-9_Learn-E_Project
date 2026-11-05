// Account wrappers: register, log in, log out and "who am I" (getMe). Each
// returns the server's JSON envelope; useCurrentUser keeps the session token.
import { api } from './api.js'

export async function register(fields) {
  const result = await api.post('/auth/register', fields)
  return result.data
}

export async function login(username, password) {
  const result = await api.post('/auth/login', { username, password })
  return result.data
}

export async function logout() {
  const result = await api.post('/auth/logout')
  return result.data
}

export async function getMe() {
  const result = await api.get('/auth/me')
  return result.data
}
