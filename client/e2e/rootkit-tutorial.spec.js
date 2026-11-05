import { test, expect } from '@playwright/test'
import { logInAs, user } from './helpers/session.js'

// The games page is for logged-in people since G16; scores stay in this browser.
const player = user('507f1f77bcf86cd799439011', 'Alice')

const tutorial = (page) => page.getByRole('dialog', { name: 'RootKit OS tutorial', exact: true })
const next = (page) => tutorial(page).getByRole('button', { name: 'Next', exact: true })
const terminal = (page) => page.getByRole('textbox', { name: 'Terminal command', exact: true })
const output = (page) => page.getByRole('log', { name: 'Terminal output', exact: true })

async function openRootkit(page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await logInAs(page, player)
  await page.goto('/take-a-break?game=rootkit')
  await expect(tutorial(page)).toBeVisible()
}

async function pausedClock(page) {
  await page.clock.install({ time: new Date('2026-10-19T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-19T12:01:00Z'))
}

async function practiceCommand(page, command) {
  await tutorial(page)
    .getByRole('textbox', { name: 'Practice terminal command', exact: true })
    .fill(command)
  await tutorial(page).getByRole('button', { name: 'Run practice command', exact: true }).click()
}

async function skipAndBoot(page) {
  await tutorial(page).getByRole('button', { name: 'Skip tutorial', exact: true }).click()
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await expect(terminal(page)).toBeFocused()
}

async function focusIsInTutorial(page) {
  return page.evaluate(() =>
    document
      .querySelector('[role="dialog"][aria-label="RootKit OS tutorial"]')
      ?.contains(document.activeElement),
  )
}

test('first visit teaches a real practice command sequence before starting a fresh mission', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await pausedClock(page)
  await openRootkit(page)
  await expect(tutorial(page)).toHaveAttribute('aria-modal', 'true')
  await expect(
    tutorial(page).getByRole('heading', { name: 'Your mission: rescue the coffee', exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(45_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')

  await next(page).click()
  await expect(
    tutorial(page).getByRole('heading', { name: 'Try the terminal', exact: true }),
  ).toBeVisible()
  await expect(next(page)).toBeDisabled()
  await practiceCommand(page, 'help')
  await expect(next(page)).toBeDisabled()
  await practiceCommand(page, 'ls')
  await expect(tutorial(page)).toContainText('briefing.txt')
  await expect(next(page)).toBeDisabled()
  await practiceCommand(page, 'cat briefing.txt')
  await expect(tutorial(page)).toContainText('Practice file opened')
  await expect(next(page)).toBeEnabled()

  await next(page).click()
  await expect(
    tutorial(page).getByRole('heading', { name: 'Read the clues', exact: true }),
  ).toBeVisible()
  await next(page).click()
  await expect(
    tutorial(page).getByRole('heading', { name: 'Trace the coffee service', exact: true }),
  ).toBeVisible()
  await next(page).click()
  await expect(
    tutorial(page).getByRole('heading', { name: 'You’re ready to boot', exact: true }),
  ).toBeVisible()
  await tutorial(page).getByRole('button', { name: 'Back', exact: true }).click()
  await expect(
    tutorial(page).getByRole('heading', { name: 'Trace the coffee service', exact: true }),
  ).toBeVisible()
  await next(page).click()
  await tutorial(page).getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()

  await expect(tutorial(page)).toHaveCount(0)
  await expect(terminal(page)).toBeFocused()
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(0)
  await expect(output(page)).not.toContainText('Practice file opened')
  await page.clock.fastForward(1_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:01')
  expect(errors).toEqual([])
})

test('skip is remembered on reload and How to play can replay the tutorial from its first step', async ({
  page,
}) => {
  await openRootkit(page)
  await next(page).click()
  await tutorial(page).getByRole('button', { name: 'Skip tutorial', exact: true }).click()
  await expect(tutorial(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Boot RootKit OS', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('learn-e-rootkit-tutorial-v1'))).toBe(
    'done',
  )

  await page.reload()
  await expect(page.getByRole('button', { name: 'Boot RootKit OS', exact: true })).toBeVisible()
  await expect(tutorial(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'How to play', exact: true }).click()
  await expect(
    tutorial(page).getByRole('heading', { name: 'Your mission: rescue the coffee', exact: true }),
  ).toBeVisible()
  await next(page).click()
  await expect(next(page)).toBeDisabled()
})

test('replaying the tutorial pauses elapsed time and preserves the real terminal session', async ({
  page,
}) => {
  await pausedClock(page)
  await openRootkit(page)
  await skipAndBoot(page)
  await terminal(page).fill('cat README.txt')
  await terminal(page).press('Enter')
  await expect(output(page)).toContainText('Espresso recovery mission')
  const existingOutput = await output(page).textContent()
  await terminal(page).fill('cat cipher')
  await page.clock.fastForward(30_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:30')

  await page.getByRole('button', { name: 'How to play', exact: true }).click()
  await expect(tutorial(page)).toBeVisible()
  await next(page).click()
  await tutorial(page).getByRole('button', { name: 'Try ls', exact: true }).click()
  await tutorial(page).getByRole('button', { name: 'Try cat briefing.txt', exact: true }).click()
  await expect(next(page)).toBeEnabled()
  await page.clock.fastForward(120_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:30')
  await tutorial(page).getByRole('button', { name: 'Return to game', exact: true }).click()

  await expect(tutorial(page)).toHaveCount(0)
  await expect(output(page)).toHaveText(existingOutput)
  await expect(terminal(page)).toHaveValue('cat cipher')
  await expect(output(page)).not.toContainText('Practice file opened')
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(0)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:30')
  await page.clock.fastForward(2_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:32')
})

test('keyboard focus stays in the dialog and Escape dismisses without starting or resetting a mission', async ({
  page,
}) => {
  await pausedClock(page)
  await openRootkit(page)
  await expect(
    tutorial(page).getByRole('heading', { name: 'Your mission: rescue the coffee', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(await focusIsInTutorial(page)).toBe(true)
  const count = await tutorial(page)
    .locator('button:enabled, input:enabled, a[href], [tabindex="0"]')
    .count()
  for (let index = 0; index < count + 2; index += 1) {
    await page.keyboard.press('Tab')
    expect(await focusIsInTutorial(page)).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(tutorial(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Boot RootKit OS', exact: true })).toBeVisible()
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
  expect(await page.evaluate(() => localStorage.getItem('learn-e-rootkit-tutorial-v1'))).toBe(
    'done',
  )

  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await page.clock.fastForward(10_000)
  await page.getByRole('button', { name: 'How to play', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(tutorial(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'How to play', exact: true })).toBeFocused()
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:10')
})

test.describe('touch tutorial', () => {
  test.use({ hasTouch: true })

  test('320px tutorial remains inside the viewport and can be completed with touch alternatives', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await openRootkit(page)
    const bounds = await tutorial(page).boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
    await next(page).tap()
    await tutorial(page).getByRole('button', { name: 'Try ls', exact: true }).tap()
    await tutorial(page).getByRole('button', { name: 'Try cat briefing.txt', exact: true }).tap()
    await expect(next(page)).toBeEnabled()
    await next(page).tap()
    await next(page).tap()
    await next(page).tap()
    await tutorial(page).getByRole('button', { name: 'Boot RootKit OS', exact: true }).tap()
    await expect(tutorial(page)).toHaveCount(0)
    await expect(terminal(page)).toBeVisible()
    await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  })
})
