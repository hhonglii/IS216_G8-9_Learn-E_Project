// Browser check for G12 (decision G-12), moved to login in G16 Step 12.
// Runs on the production build (playwright.games.config.js):
// in development, the Vue DevTools plugin reads localStorage itself and blanks the
// page when storage is blocked, which says nothing about the app. Every /api
// request is answered here, so no database is used.
import { test, expect } from '@playwright/test'

test('with storage blocked the page still renders and offers the login page', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // What a browser with site data blocked does: reading localStorage throws.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is blocked', 'SecurityError')
      },
    })
  })
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: [] } }))
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  // No stored token can be read, so the guard sends the person to log in.
  await expect(page).toHaveURL('/login?redirect=/')
  await expect(page.getByRole('heading', { name: 'Log in to Learn-E' })).toBeVisible()
  const bar = page.getByRole('banner')
  await expect(bar.getByRole('heading', { name: 'Learn-E' })).toBeVisible()
  await expect(bar.getByRole('status')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
