// Browser check for the dark game theme.
// A missed Bootstrap default shows as a light panel on a dark page, so this
// looks for any visible element whose own background is light. Every /api
// request is answered here, so no database is used.
import { test, expect } from '@playwright/test'
import {
  prepare,
  project,
  workspace,
  studentId,
  groupId,
  miniProjectId,
} from './helpers/miniProjectPage.js'

async function lightPanels(page) {
  return page.evaluate(() => {
    const luminance = (color) => {
      const parts = color.match(/[\d.]+/g)?.map(Number) ?? []
      if (parts.length < 3) return 0
      // color-mix() results come back as color(srgb r g b) with 0 to 1 channels.
      const scale = color.startsWith('color(') ? 1 : 255
      const [r, g, b, alpha = 1] = parts
      if (alpha < 0.5) return 0
      return [r, g, b]
        .map((value) => value / scale)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    }
    // Cyan fills are meant to be bright (primary buttons, checked inputs), and the
    // dev server's Vue DevTools overlay is not part of the site.
    const meantBright = '.btn-primary, .form-check-input:checked'
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => !el.matches(meantBright) && !el.closest('#__vue-devtools-container__'))
      .filter((el) => luminance(getComputedStyle(el).backgroundColor) > 0.4)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
  })
}

test('no visible panel is light on the login and mini-project pages', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Log in to Learn-E' })).toBeVisible()
  expect(await lightPanels(page)).toEqual([])

  await page.unrouteAll()
  const { pageErrors } = await prepare(page, studentId, {
    project: project({ myGroup: workspace(groupId, 'Team Rocket') }),
  })
  await page.goto(`/mini-projects/${miniProjectId}`)
  // The page title is the project's name once it loads (H3 Step 8).
  await expect(
    page.getByRole('heading', { level: 1, name: 'Repair the counter app' }),
  ).toBeVisible()
  expect(await lightPanels(page)).toEqual([])
  expect(pageErrors).toEqual([])
})
