import { test, expect } from '@playwright/test'
import { logInAs, user } from './helpers/session.js'

// The games page is for logged-in people since G16; scores stay in this browser.
const player = user('507f1f77bcf86cd799439011', 'Alice')

const COMMANDS = [
  'help',
  'ls',
  'pwd',
  'cd',
  'cat',
  'grep',
  'clear',
  'decrypt',
  'ssh',
  'sudo',
  'exit',
  'disconnect',
]
const reference = (page) => page.getByRole('dialog', { name: 'Command reference', exact: true })
const commandsButton = (page) => page.getByRole('button', { name: 'Commands', exact: true })
const terminal = (page) => page.getByRole('textbox', { name: 'Terminal command', exact: true })
const output = (page) => page.getByRole('log', { name: 'Terminal output', exact: true })
const tutorial = (page) => page.getByRole('dialog', { name: 'RootKit OS tutorial', exact: true })

async function openRootkit(page, { firstVisit = false } = {}) {
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await logInAs(page, player)
  if (!firstVisit) {
    await page.addInitScript(() => localStorage.setItem('learn-e-rootkit-tutorial-v1', 'done'))
  }
  await page.goto('/take-a-break?game=rootkit')
}

async function pausedClock(page) {
  await page.clock.install({ time: new Date('2026-10-19T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-19T12:01:00Z'))
}

async function run(page, command) {
  await terminal(page).fill(command)
  await terminal(page).press('Enter')
}

async function assertCatalog(container) {
  await expect(container.locator('[data-command]')).toHaveCount(COMMANDS.length)
  for (const name of COMMANDS) {
    await expect(container.locator(`[data-command="${name}"]`)).toBeAttached()
    await expect(container.locator(`[data-command="${name}"]`)).toContainText(name)
  }
  await expect(container.locator('[data-command="grep"]')).toContainText(/grep\s+\[-i\]/)
  await expect(container.locator('[data-command="decrypt"]')).toContainText(
    /decrypt\s+<cipher>\s+--shift/,
  )
  await expect(container.locator('[data-command="ssh"]')).toContainText(
    /ssh\s+<user>@<host>\s+-p\s+<port>/,
  )
  await expect(container.locator('[data-command="sudo"]')).toContainText('sudo brew --espresso')
  await expect(container).toContainText(/quot(?:e|es|ed|ing)/i)
  await expect(container).toContainText(/spaces/i)
}

async function focusIsInReference(page) {
  return reference(page).evaluate((element) => element.contains(document.activeElement))
}

test('catalog is available before boot, traps focus, and pauses a running mission without changing its state', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await pausedClock(page)
  await openRootkit(page)
  await expect(page.getByRole('button', { name: 'Boot RootKit OS', exact: true })).toBeVisible()
  await commandsButton(page).click()
  await expect(reference(page)).toBeVisible()
  await expect(reference(page)).toHaveAttribute('aria-modal', 'true')
  await assertCatalog(reference(page))
  await page.keyboard.press('Shift+Tab')
  expect(await focusIsInReference(page)).toBe(true)
  const count = await reference(page).locator('button:enabled, a[href], [tabindex="0"]').count()
  for (let index = 0; index < count + 2; index += 1) {
    await page.keyboard.press('Tab')
    expect(await focusIsInReference(page)).toBe(true)
  }
  await page.clock.fastForward(60_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
  await page.keyboard.press('Escape')
  await expect(reference(page)).toHaveCount(0)
  await expect(commandsButton(page)).toBeFocused()

  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await run(page, 'cat README.txt')
  await expect(output(page)).toContainText('Espresso recovery mission')
  const existingOutput = await output(page).textContent()
  await terminal(page).fill('grep -i "coffee service" network.log')
  await page.clock.fastForward(30_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:30')
  await commandsButton(page).click()
  await expect(reference(page)).toBeVisible()
  await page.clock.fastForward(60_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:30')
  await reference(page)
    .getByRole('button', { name: 'Close command reference', exact: true })
    .click()
  await expect(reference(page)).toHaveCount(0)
  await expect(commandsButton(page)).toBeFocused()
  await expect(terminal(page)).toHaveValue('grep -i "coffee service" network.log')
  await expect(output(page)).toHaveText(existingOutput)
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(0)
  await page.clock.fastForward(2_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:32')
  expect(errors).toEqual([])
})

test('reading commands preserves the SSH password prompt, its private draft, and completed progress', async ({
  page,
}) => {
  await pausedClock(page)
  await openRootkit(page)
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  // Vue's leave transition needs a few animation frames to finish.
  await page.clock.runFor(50)
  await expect(page.locator('.mission-overlay')).toHaveCount(0)
  await run(page, 'decrypt hvsuhvvr --shift 3')
  await page.getByRole('button', { name: 'Toggle net_sniffer.app', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect anomalous packet', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle sys_monitor.app', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Core frequency MHz', exact: true }).fill('404')
  await page.getByRole('button', { name: 'Toggle bash_terminal.exe', exact: true }).click()
  await run(page, 'ssh barista@coffee.local -p 4040')
  const password = page.getByRole('textbox', { name: 'SSH password', exact: true })
  await expect(password).toHaveAttribute('type', 'password')
  await password.fill('private-unsubmitted-draft')
  const existingOutput = await output(page).textContent()
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(1)

  await commandsButton(page).click()
  await expect(reference(page)).toBeVisible()
  await page.clock.fastForward(60_000)
  await reference(page).getByRole('button', { name: 'Return to game', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('private-unsubmitted-draft')
  await expect(output(page)).toHaveText(existingOutput)
  await expect(output(page)).not.toContainText('private-unsubmitted-draft')
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(1)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
  await password.fill('BEAN-404')
  await password.press('Enter')
  await expect(terminal(page)).toBeVisible()
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(2)
})

test.describe('touch command reference', () => {
  test.use({ hasTouch: true })

  test('320px tutorial reveals the same catalog and the command dialog can be read and closed by touch', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await openRootkit(page, { firstVisit: true })
    await expect(tutorial(page)).toBeVisible()
    await tutorial(page).getByRole('button', { name: 'Next', exact: true }).tap()
    await tutorial(page).getByRole('button', { name: 'Try ls', exact: true }).tap()
    await tutorial(page).getByRole('button', { name: 'Try cat briefing.txt', exact: true }).tap()
    await tutorial(page).getByRole('button', { name: 'Next', exact: true }).tap()
    await tutorial(page).getByRole('button', { name: 'Next', exact: true }).tap()
    await tutorial(page).getByRole('button', { name: 'Next', exact: true }).tap()
    await expect(
      tutorial(page).getByRole('heading', { name: 'You’re ready to boot', exact: true }),
    ).toBeVisible()
    const summary = tutorial(page).locator('summary').filter({ hasText: 'All terminal commands' })
    await summary.tap()
    await assertCatalog(tutorial(page))
    await summary.tap()
    await expect(
      tutorial(page).getByRole('heading', { name: 'You’re ready to boot', exact: true }),
    ).toBeVisible()
    await tutorial(page).getByRole('button', { name: 'Boot RootKit OS', exact: true }).tap()

    await commandsButton(page).tap()
    await expect(reference(page)).toBeVisible()
    await reference(page).locator('[data-command="disconnect"]').scrollIntoViewIfNeeded()
    await expect(reference(page).locator('[data-command="disconnect"]')).toBeVisible()
    const returnButton = reference(page).getByRole('button', {
      name: 'Return to game',
      exact: true,
    })
    await returnButton.scrollIntoViewIfNeeded()
    await returnButton.tap()
    await expect(reference(page)).toHaveCount(0)
    await expect(commandsButton(page)).toBeFocused()
    await expect(terminal(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  })
})
