// Helpers for the product browser tests (H1 Step 4).
// Each test makes the users and records it needs through the real API, so no test
// depends on another or on data typed in by hand. The database starts empty every
// run (decision H-5); names still get a counter so one run never repeats one.
import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'
import { PROFESSOR_CODE } from '../professor-code.js'

export const API = 'http://localhost:8001/api'
const TOKEN_KEY = 'learn-e.sessionToken'
let made = 0

// Usernames must match /^[a-z0-9._-]{3,30}$/ on the server.
export const uniqueName = (prefix) => `${prefix}-${Date.now().toString(36)}-${made++}`

// Registers a user and returns it with its session token. The password is random
// and never logged; tests that type it into the login page read it from here.
export async function register(request, role, displayName) {
  const username = uniqueName(role === 'professor' ? 'prof' : 'stud')
  const password = `pw-${randomUUID()}`
  const response = await request.post(`${API}/auth/register`, {
    data: { username, displayName, role, password, professorCode: PROFESSOR_CODE },
  })
  expect(response.status(), 'register').toBe(201)
  const { data } = await response.json()
  return { ...data.user, password, token: data.token }
}

// Calls the API as `person` and returns the reply's data, failing on any error status.
export async function apiAs(request, person, method, path, data) {
  const response = await request.fetch(`${API}${path}`, {
    method,
    data,
    headers: { authorization: `Bearer ${person.token}` },
  })
  expect(response.ok(), `${method} ${path} answered ${response.status()}`).toBe(true)
  return (await response.json()).data
}

// Starts the tab logged in as `person`. The token is stored once per tab, so a
// test that logs out and reloads stays logged out, as a real browser would.
export async function logInAs(page, person) {
  await page.addInitScript(
    ([key, token]) => {
      if (sessionStorage.getItem('e2e-session-stored')) return
      sessionStorage.setItem('e2e-session-stored', 'yes')
      localStorage.setItem(key, token)
    },
    [TOKEN_KEY, person.token],
  )
}
