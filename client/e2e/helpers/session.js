// Login setup shared by the browser checks (G16 Step 12).
// The page starts with a stored session token, and GET /api/auth/me answers with
// the given user for that token only, so the app boots logged in without a
// database. Pages then send the token as `Authorization: Bearer ...`.
import { expect } from '@playwright/test'

const TOKEN_KEY = 'learn-e.sessionToken'
export const tokenFor = (userId) => `test-token-${userId}`

export const user = (id, displayName, role = 'student') => ({
  id,
  username: displayName.toLowerCase().replace(/\s+/g, '.'),
  displayName,
  role,
})

// Register this after any catch-all `**/api/**` route: the route added last wins.
// The token is stored once per tab, so a test that logs out and reloads stays
// logged out, as a real browser would.
export async function logInAs(page, person) {
  await page.addInitScript(
    ([key, token]) => {
      if (sessionStorage.getItem('e2e-session-stored')) return
      sessionStorage.setItem('e2e-session-stored', 'yes')
      localStorage.setItem(key, token)
    },
    [TOKEN_KEY, tokenFor(person.id)],
  )
  await page.route('**/api/auth/me', (route) =>
    route.request().headers().authorization === `Bearer ${tokenFor(person.id)}`
      ? route.fulfill({ json: { data: person } })
      : route.fulfill({
          status: 401,
          json: {
            error: {
              code: 'INVALID_SESSION',
              message: 'Your session has ended. Please log in again.',
              details: null,
            },
          },
        }),
  )
}

// What the old X-Prototype-User-Id checks became: the request carries this user's token.
export function expectSentBy(route, userId) {
  expect(route.request().headers().authorization).toBe(`Bearer ${tokenFor(userId)}`)
}

// Logged-in pages against a server with no database end the session at once (every
// protected request answers 401), so pages that only need a failed load use this:
// health still reaches the real server, and every other request answers 500.
export async function failEveryLoad(page) {
  await page.route('**/api/**', (route) =>
    new URL(route.request().url()).pathname === '/api/health'
      ? route.continue()
      : route.fulfill({
          status: 500,
          json: {
            error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.', details: null },
          },
        }),
  )
}
