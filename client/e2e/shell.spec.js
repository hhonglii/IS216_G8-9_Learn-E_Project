import { test, expect } from '@playwright/test'
import { failEveryLoad, logInAs, user } from './helpers/session.js'

const pages = [
  ['/classrooms/demo-classroom/review', 'Retry', 'Professor review'],
  ['/classrooms/demo-classroom/help', 'Try again', 'Help queue'],
  ['/mini-projects/demo-project', 'Try again', 'Mini-project'],
  ['/challenges/demo-challenge', 'Retry'],
  ['/profiles/demo-user', 'Try again'],
  ['/classrooms/demo-classroom', 'Try again'],
]

test('against the real server with no database, every page asks for a login', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveURL('/login?redirect=/')
  await expect(page.getByRole('heading', { name: 'Learn-E', exact: true })).toBeVisible()
  // The top bar has no server status since H3 Step 7. Scoped to the header, because
  // page loaders and progress panels also use role="status".
  await expect(page.getByRole('banner').getByRole('status')).toHaveCount(0)
  for (const [url] of [...pages, ['/take-a-break'], ['/deliberately-unknown-route']]) {
    await page.goto(url)
    await expect(page).toHaveURL(`/login?redirect=${url}`)
    await expect(page.getByRole('heading', { name: 'Log in to Learn-E' })).toBeVisible()
  }

  // A token this server cannot look up (G16): GET /api/auth/me is faked, so the app
  // starts logged in, but the server answers the dashboard's first request with
  // 401 UNAUTHENTICATED, which ends the session.
  await logInAs(page, user('demo-user', 'Demo Student'))
  await page.goto('/take-a-break')
  await page.goto('/')
  await expect(page).toHaveURL('/login?redirect=/')
  expect(await page.evaluate(() => localStorage.getItem('learn-e.sessionToken'))).toBeNull()
  expect(pageErrors).toEqual([])
})

test('logged in, each page offers a retry when its data cannot load', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await failEveryLoad(page)
  await logInAs(page, user('demo-user', 'Demo Student'))
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Demo Student' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your classrooms' })).toBeVisible()
  // Dashboard and Take a break are global links. At this desktop width they sit
  // in the sidebar (G11), which replaces the top menu; the top menu is hidden, so
  // only one "Primary navigation" is visible. Professor Review and Profile are
  // reached from pages that know real ids.
  await page.goto('/profiles/demo-user')
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Dashboard', exact: true })
    .click()
  await expect(page).toHaveURL('/')
  await page.goto('/deliberately-unknown-route')
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
  await expect(page.getByText('There is no page at this address.')).toBeVisible()
  // Each load fails here, so the page must offer a retry, not crash.
  for (const [url, retry] of pages) {
    await page.goto(url)
    await expect(page.getByRole('button', { name: retry, exact: true })).toBeVisible()
  }
  // Only these pages show a fixed heading before their data arrives.
  for (const [url, , heading] of pages.filter((entry) => entry[2])) {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  expect(pageErrors).toEqual([])
})
