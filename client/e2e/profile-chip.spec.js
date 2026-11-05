// Browser checks for G12 (decision G-12), moved to login in G16 Step 12: the chip
// in App.vue and the profile forms. Every /api request is answered here, so no
// database is used.
import { test, expect } from '@playwright/test'
import { logInAs, expectSentBy, user } from './helpers/session.js'

const aliceId = '507f1f77bcf86cd799439101'
const alice = user(aliceId, 'Alice Tan')
const avatarSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>'

// Every field ProfileView reads, so the chip's link can open the page.
const profileOf = (person) => ({
  id: person.id,
  displayName: person.displayName,
  role: person.role,
  classrooms: [],
  helpfulCount: 0,
  milestones: [],
  nextMilestone: { label: 'First Assist', threshold: 1 },
  completedChallenges: [],
  projects: [],
})

async function prepare(page, { as = null } = {}) {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // Registered first, so the specific routes below take priority over it.
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: [] } }))
  await page.route('**/api/users/*/profile', (route) =>
    route.fulfill({ json: { data: profileOf(alice) } }),
  )
  await page.route('https://api.dicebear.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: avatarSvg }),
  )
  if (as) await logInAs(page, as)
  return pageErrors
}

const bar = (page) => page.getByRole('banner')
const noSidewaysScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('the chip shows the logged-in name and follows a rename without a reload', async ({
  page,
}, testInfo) => {
  const pageErrors = await prepare(page, { as: alice })
  const renames = []
  await page.route('**/api/users/me', (route) => {
    expectSentBy(route, aliceId)
    renames.push(route.request().postDataJSON())
    return route.fulfill({ json: { data: { ...alice, displayName: 'Alice Ng' } } })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  const chip = bar(page).getByRole('link', { name: 'Alice Tan', exact: true })
  await expect(chip).toHaveAttribute('href', `/profiles/${aliceId}`)
  // From 768px the name is shown, not only kept for screen readers.
  expect((await chip.locator('.app-chip-name').boundingBox()).width).toBeGreaterThan(40)
  await expect(chip.locator('img')).toHaveAttribute(
    'src',
    `https://api.dicebear.com/10.x/thumbs/svg?seed=${aliceId}`,
  )
  await page.screenshot({ path: testInfo.outputPath('chip-1280.png') })

  await chip.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Alice Tan' })).toBeVisible()
  // A marker on the window survives only if the page is not reloaded.
  await page.evaluate(() => {
    window.sameDocument = true
  })
  await page.getByLabel('Display name').fill('  Alice Ng ')
  await page.getByRole('button', { name: 'Save name' }).click()

  await expect(page.getByText('Name saved.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Alice Ng' })).toBeVisible()
  await expect(bar(page).getByRole('link', { name: 'Alice Ng', exact: true })).toBeVisible()
  expect(renames).toEqual([{ displayName: 'Alice Ng' }])
  expect(await page.evaluate(() => window.sameDocument)).toBe(true)
  expect(pageErrors).toEqual([])
})

test('at 375px "Alice Tan" is a 44px circle with its name kept for screen readers, and nothing scrolls sideways', async ({
  page,
}, testInfo) => {
  const pageErrors = await prepare(page, { as: alice })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/take-a-break')

  const chip = bar(page).getByRole('link', { name: 'Alice Tan', exact: true })
  await expect(chip).toBeVisible()
  const box = await chip.boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeLessThan(50)
  // The name is still in the page for screen readers, but takes no space.
  expect((await chip.locator('.app-chip-name').boundingBox()).width).toBeLessThanOrEqual(1)
  // Below 768px Log out is in the menu, not the bar (G16 Step 10).
  await expect(bar(page).locator('.app-logout')).toBeHidden()
  const toggle = bar(page).getByRole('button', { name: 'Toggle primary navigation' })
  await expect(toggle).toBeVisible()
  // Inside the bar's 12px side padding, not merely inside the screen.
  const toggleBox = await toggle.boundingBox()
  expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(375 - 12)
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('chip-375.png') })
  expect(pageErrors).toEqual([])
})

// UI refresh 3: the narrowest phone the game pages are checked at.
test('at 320px "Alice Tan" and the menu button still fit', async ({ page }) => {
  const pageErrors = await prepare(page, { as: alice })
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/take-a-break')
  await expect(bar(page).getByRole('link', { name: 'Alice Tan', exact: true })).toBeVisible()
  // The bar is full at 320px. Until Source Sans 3 arrives the fallback font is about
  // 9px wider, so under load the button was measured at 317px and the check flaked.
  await page.evaluate(() => document.fonts.ready)
  const toggle = bar(page).getByRole('button', { name: 'Toggle primary navigation' })
  const toggleBox = await toggle.boundingBox()
  expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(320 - 12)
  expect(await noSidewaysScroll(page)).toBe(true)
  expect(pageErrors).toEqual([])
})

// Logged out, login is the only page, so the bar holds just the wordmark: no chip,
// no menu button (2026-10-29) and no server status (H3 Step 7).
test('at 320px the login bar shows only the wordmark, and fits', async ({ page }) => {
  const pageErrors = await prepare(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/login')
  await expect(bar(page).getByRole('heading', { name: 'Learn-E' })).toBeVisible()
  await expect(bar(page).getByRole('status')).toHaveCount(0)
  await expect(bar(page).getByRole('link')).toHaveCount(0)
  await expect(bar(page).getByRole('button')).toHaveCount(0)
  expect(await noSidewaysScroll(page)).toBe(true)
  expect(pageErrors).toEqual([])
})
