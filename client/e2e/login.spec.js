// Browser checks for G16 Step 12 (log in, stay logged in, log out) of LoginView, the
// router guard, useCurrentUser and the Log out button. Every /api request is answered
// here, so no database is used.
import { test, expect } from '@playwright/test'
import { user } from './helpers/session.js'

const alice = user('507f1f77bcf86cd799439101', 'Alice Tan')
const token = 'token-from-login'
const sessionEnded = {
  status: 401,
  json: {
    error: {
      code: 'INVALID_SESSION',
      message: 'Your session has ended. Please log in again.',
      details: null,
    },
  },
}

async function prepare(page) {
  const pageErrors = []
  const calls = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: [] } }))
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await page.route('**/api/auth/login', (route) => {
    const body = route.request().postDataJSON()
    calls.push(['login', body])
    return body.password === 'right-pass-1'
      ? route.fulfill({ json: { data: { token, user: alice } } })
      : route.fulfill({
          status: 401,
          json: {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Username or password is incorrect.',
              details: null,
            },
          },
        })
  })
  await page.route('**/api/auth/me', (route) => {
    calls.push(['me', route.request().headers().authorization])
    return route.request().headers().authorization === `Bearer ${token}`
      ? route.fulfill({ json: { data: alice } })
      : route.fulfill(sessionEnded)
  })
  await page.route('**/api/auth/logout', (route) => {
    calls.push(['logout', route.request().headers().authorization])
    return route.fulfill({ status: 204 })
  })
  return { pageErrors, calls }
}

const bar = (page) => page.getByRole('banner')
const sidebar = (page) => page.locator('.app-sidebar')
const storedToken = (page) => page.evaluate(() => localStorage.getItem('learn-e.sessionToken'))

test('logs in, returns to the page asked for, stays logged in on reload, then logs out to /login', async ({
  page,
}) => {
  const { pageErrors, calls } = await prepare(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/take-a-break')
  await expect(page).toHaveURL('/login?redirect=/take-a-break')
  // Logged out, the bar has no chip and no menu: login is the only page there is.
  await expect(bar(page).getByRole('link')).toHaveCount(0)
  await expect(sidebar(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)

  await page.locator('#login-username').fill('alice.tan')
  await page.locator('#login-password').fill('right-pass-1')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  await expect(page).toHaveURL('/take-a-break')
  const chip = bar(page).getByRole('link', { name: 'Alice Tan', exact: true })
  await expect(chip).toHaveAttribute('href', `/profiles/${alice.id}`)
  expect(await storedToken(page)).toBe(token)
  expect(calls).toEqual([['login', { username: 'alice.tan', password: 'right-pass-1' }]])

  await page.reload()
  await expect(page).toHaveURL('/take-a-break')
  await expect(chip).toBeVisible()
  expect(calls.at(-1)).toEqual(['me', `Bearer ${token}`])

  await sidebar(page).getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')
  await expect(bar(page).getByRole('link')).toHaveCount(0)
  expect(calls.at(-1)).toEqual(['logout', `Bearer ${token}`])
  expect(await storedToken(page)).toBeNull()

  // The token is gone, so a logged-in page sends the person back to login.
  await page.goto('/take-a-break')
  await expect(page).toHaveURL('/login?redirect=/take-a-break')
  expect(pageErrors).toEqual([])
})

test('logs out from the phone menu below 768px', async ({ page }) => {
  const { pageErrors } = await prepare(page)
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('e2e-session-stored')) return
    sessionStorage.setItem('e2e-session-stored', 'yes')
    localStorage.setItem('learn-e.sessionToken', value)
  }, token)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/take-a-break')
  await expect(bar(page).getByRole('link', { name: 'Alice Tan', exact: true })).toBeVisible()

  await bar(page).getByRole('button', { name: 'Toggle primary navigation' }).click()
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Log out' })
    .click()
  await expect(page).toHaveURL('/login')
  expect(await storedToken(page)).toBeNull()
  expect(pageErrors).toEqual([])
})

// Pages that reload when the logged-in user changes (Classroom here) must not
// reload with no token on the way out: the server would answer 401 UNAUTHENTICATED
// and the session-end handler would send the next person to /login?redirect=<this page>.
const classroomId = '507f1f77bcf86cd799439102'
// The login page's code is fetched on first use, so this holds it back past the logout reply.
async function holdBackLoginPage(page) {
  await page.route('**/src/views/LoginView.vue*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.continue()
  })
}
for (const [when, slowDown] of [
  ['', async () => {}],
  [' even when the login page is slow to load', holdBackLoginPage],
]) {
  test(`logging out of a classroom page lands on plain /login${when}`, async ({ page }) => {
    const { pageErrors, calls } = await prepare(page)
    const tokenless = []
    // Registered after prepare, so it answers every classroom request.
    await page.route('**/api/classrooms/**', (route) => {
      if (route.request().headers().authorization !== `Bearer ${token}`) {
        tokenless.push(new URL(route.request().url()).pathname)
        return route.fulfill({
          status: 401,
          json: {
            error: { code: 'UNAUTHENTICATED', message: 'Log in first.', details: null },
          },
        })
      }
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: {
          data: path.endsWith(classroomId)
            ? {
                id: classroomId,
                name: 'Click-through Class',
                professorId: 'someone-else',
                challenges: [],
                miniProjects: [],
              }
            : [],
        },
      })
    })
    await slowDown(page)
    await page.addInitScript((value) => {
      if (sessionStorage.getItem('e2e-session-stored')) return
      sessionStorage.setItem('e2e-session-stored', 'yes')
      localStorage.setItem('learn-e.sessionToken', value)
    }, token)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`/classrooms/${classroomId}`)
    await expect(page.getByRole('heading', { name: 'Click-through Class' })).toBeVisible()
    await expect(bar(page).getByRole('link', { name: 'Alice Tan', exact: true })).toBeVisible()

    await sidebar(page).getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('heading', { name: 'Log in to Learn-E' })).toBeVisible()
    await expect(page).toHaveURL('/login')
    expect(calls.at(-1)).toEqual(['logout', `Bearer ${token}`])
    expect(await storedToken(page)).toBeNull()
    expect(tokenless).toEqual([])
    expect(pageErrors).toEqual([])
  })
}

test('a wrong password shows the message, keeps the username and stays on login', async ({
  page,
}) => {
  const { pageErrors } = await prepare(page)
  await page.goto('/login')
  await page.locator('#login-username').fill('alice.tan')
  await page.locator('#login-password').fill('wrong-pass')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  await expect(page.getByRole('alert')).toContainText('Username or password is incorrect.')
  await expect(page.locator('#login-username')).toHaveValue('alice.tan')
  await expect(page.locator('#login-password')).toHaveValue('')
  await expect(page).toHaveURL('/login')
  expect(await storedToken(page)).toBeNull()
  expect(pageErrors).toEqual([])
})

test('a made-up stored token lands on login, not an error page', async ({ page }) => {
  const { pageErrors, calls } = await prepare(page)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-session-stored')) return
    sessionStorage.setItem('e2e-session-stored', 'yes')
    localStorage.setItem('learn-e.sessionToken', 'made-up-token')
  })
  await page.goto('/take-a-break')
  await expect(page).toHaveURL('/login?redirect=/take-a-break')
  await expect(page.getByRole('heading', { name: 'Log in to Learn-E' })).toBeVisible()
  expect(calls).toEqual([['me', 'Bearer made-up-token']])
  expect(await storedToken(page)).toBeNull()
  expect(pageErrors).toEqual([])
})
