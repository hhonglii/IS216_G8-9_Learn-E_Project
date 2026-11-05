import { test, expect } from '@playwright/test'
import { logInAs, user } from './helpers/session.js'

// The games page is for logged-in people since G16; scores stay in this browser.
const player = user('507f1f77bcf86cd799439011', 'Alice')

const appWindow = (page, id) =>
  page.locator(`[data-window-id="${id}"]:not(.rk-window-leave-active)`)
const commandInput = (page) => page.getByRole('textbox', { name: 'Terminal command', exact: true })
const dock = (page, app) => page.getByRole('button', { name: `Toggle ${app}`, exact: true })

async function openGame(page) {
  await page.addInitScript(() => localStorage.setItem('learn-e-rootkit-tutorial-v1', 'done'))
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await logInAs(page, player)
  await page.goto('/take-a-break')
  await expect(page.getByRole('link', { name: 'Play 2048', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show RootKit OS', exact: true }).click()
  await page.getByRole('link', { name: 'Play RootKit OS', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Boot RootKit OS', exact: true })).toBeVisible()
}

async function boot(page) {
  await openGame(page)
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await expect(page.locator('.mission-overlay')).toHaveCount(0)
  await expect(commandInput(page)).toBeFocused()
}

async function run(page, command) {
  await commandInput(page).fill(command)
  await commandInput(page).press('Enter')
}

async function solve(page) {
  await run(page, 'cat README.txt')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(
    'Espresso recovery mission',
  )
  await run(page, 'cat cipher.txt')
  await run(page, 'decrypt hvsuhvvr --shift 3')
  await expect(page.locator('.mission-progress li').first()).toHaveClass('complete')
  await dock(page, 'net_sniffer.app').click()
  await page.getByRole('button', { name: 'Inspect anomalous packet', exact: true }).click()
  await expect(appWindow(page, 'sniffer')).toContainText('coffee.local : 4040')
  await dock(page, 'sys_monitor.app').click()
  const frequency = page.getByRole('spinbutton', { name: 'Core frequency MHz', exact: true })
  // Real individual keystrokes must allow editing through temporarily out-of-range values.
  await frequency.fill('')
  await frequency.pressSequentially('404')
  await expect(appWindow(page, 'monitor')).toContainText('BEAN-404')
  await dock(page, 'bash_terminal.exe').click()
  await run(page, 'cat network.log')
  await run(page, 'ssh barista@coffee.local -p 4040')
  const password = page.getByRole('textbox', { name: 'SSH password', exact: true })
  await expect(password).toHaveAttribute('type', 'password')
  await password.fill('wrong-private-value')
  await password.press('Enter')
  await expect(password).toBeVisible()
  await expect(page.getByRole('log', { name: 'Terminal output' })).not.toContainText(
    'wrong-private-value',
  )
  await password.fill('BEAN-404')
  await password.press('Enter')
  await expect(page.locator('.mission-progress li').nth(1)).toHaveClass('complete')
  await run(page, 'cat brew.sh')
  await run(page, 'sudo brew --espresso')
  await expect(page.getByRole('heading', { name: 'Espresso unlocked.', exact: true })).toBeFocused()
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(3)
}

test('solves all three stages through the desktop and terminal, then restarts cleanly', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await boot(page)
  await run(page, 'not-a-command')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText(
    'command not found',
  )
  await expect(page.locator('.virtual-monitor')).toHaveClass(/is-glitching/)
  await commandInput(page).fill('cat ci')
  await commandInput(page).press('Tab')
  await expect(commandInput(page)).toHaveValue('cat cipher.txt ')
  await commandInput(page).press('Enter')
  await commandInput(page).fill('draft')
  await commandInput(page).press('ArrowUp')
  await expect(commandInput(page)).toHaveValue('cat cipher.txt')
  await commandInput(page).press('ArrowDown')
  await expect(commandInput(page)).toHaveValue('draft')
  await commandInput(page).press('Shift+Tab')
  await expect(commandInput(page)).not.toBeFocused()
  await solve(page)
  await page.getByRole('button', { name: 'Brew another', exact: true }).click()
  await expect(page.locator('.mission-overlay')).toHaveCount(0)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
  await expect(page.locator('.mission-progress li.complete')).toHaveCount(0)
  await expect(page.getByRole('log', { name: 'Terminal output' })).not.toContainText(
    'ESPRESSO ONLINE',
  )
  await expect(commandInput(page)).toBeFocused()
  expect(errors).toEqual([])
})

test('manages windows, notes, themes and sound with mouse and keyboard', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Minimize bash_terminal.exe', exact: true }).click()
  await expect(appWindow(page, 'terminal')).toHaveCount(0)
  await dock(page, 'bash_terminal.exe').click()
  await expect(commandInput(page)).toBeFocused()
  await page.getByRole('button', { name: 'Maximize bash_terminal.exe', exact: true }).click()
  await expect(appWindow(page, 'terminal')).toHaveClass(/is-maximized/)
  await page.getByRole('button', { name: 'Restore bash_terminal.exe', exact: true }).click()
  const header = page.getByRole('group', { name: 'Move bash_terminal.exe', exact: true })
  await header.focus()
  const x = await appWindow(page, 'terminal').evaluate((element) => parseFloat(element.style.left))
  await header.press('ArrowRight')
  await expect
    .poll(() => appWindow(page, 'terminal').evaluate((element) => parseFloat(element.style.left)))
    .toBe(x + 12)
  // Hover waits for the restore/move animation to settle before measuring the drag target.
  await header.hover()
  const box = await header.boundingBox()
  const oldY = await appWindow(page, 'terminal').evaluate((element) =>
    parseFloat(element.style.top),
  )
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2 + 30, { steps: 5 })
  await page.mouse.up()
  await expect
    .poll(() => appWindow(page, 'terminal').evaluate((element) => parseFloat(element.style.top)))
    .toBeCloseTo(oldY + 30, 3)
  await page.getByRole('button', { name: 'Close bash_terminal.exe', exact: true }).click()
  await expect(appWindow(page, 'terminal')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open bash_terminal.exe', exact: true }).click()
  await expect(commandInput(page)).toBeVisible()
  await dock(page, 'sticky_notes.app').click()
  const note = page.getByRole('button', { name: 'Move binary hint note', exact: true })
  const noteTransform = await page.locator('.note-binary').getAttribute('style')
  await note.focus()
  await note.press('ArrowDown')
  await expect(page.locator('.note-binary')).not.toHaveAttribute('style', noteTransform)
  await page.getByRole('button', { name: 'Switch to Amber CRT Retro', exact: true }).click()
  await expect(page.locator('.virtual-monitor')).toHaveClass(/rk-theme-crt/)
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.reload()
  await expect(page.locator('.virtual-monitor')).toHaveClass(/rk-theme-crt/)
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Take a break.', exact: true })).toBeFocused()
})

test('synthesizes real browser audio after input, honors mute, and closes on exit', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext || window.webkitAudioContext
    window.__rootkitAudio = { contexts: 0, oscillators: 0, noise: 0, closed: 0 }
    class TrackedContext extends NativeContext {
      constructor(...args) {
        super(...args)
        window.__rootkitAudio.contexts += 1
      }
      createOscillator(...args) {
        window.__rootkitAudio.oscillators += 1
        return super.createOscillator(...args)
      }
      createBufferSource(...args) {
        window.__rootkitAudio.noise += 1
        return super.createBufferSource(...args)
      }
      close(...args) {
        const result = super.close(...args)
        void Promise.resolve(result).then(() => {
          window.__rootkitAudio.closed += 1
        })
        return result
      }
    }
    window.AudioContext = TrackedContext
  })
  await openGame(page)
  expect(await page.evaluate(() => window.__rootkitAudio.contexts)).toBe(0)
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__rootkitAudio.oscillators)).toBeGreaterThan(0)
  await commandInput(page).pressSequentially('help', { delay: 30 })
  await expect.poll(() => page.evaluate(() => window.__rootkitAudio.noise)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click()
  const voices = await page.evaluate(() => window.__rootkitAudio.oscillators)
  await commandInput(page).pressSequentially('x', { delay: 30 })
  expect(await page.evaluate(() => window.__rootkitAudio.oscillators)).toBe(voices)
  await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__rootkitAudio.closed)).toBe(1)
})

test('starts elapsed time only after boot and keeps the mission playable after twenty minutes', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-04T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-04T00:01:00Z'))
  await openGame(page)
  await page.clock.fastForward(310_000)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await page.clock.runFor(500)
  await page.clock.fastForward(1_200_001)
  await expect(page.getByTestId('rootkit-timer')).toHaveText('20:00')
  await expect(page.getByLabel('Time elapsed', { exact: true })).toHaveText('20:00')
  await expect(commandInput(page)).toBeEnabled()
  await expect(page.locator('.mission-overlay')).toHaveCount(0)
  await run(page, 'help')
  await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('decrypt')
  await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
  await page.getByRole('link', { name: 'Play RootKit OS', exact: true }).click()
  await expect(page.getByTestId('rootkit-timer')).toHaveText('00:00')
  await expect(page.getByRole('button', { name: 'Boot RootKit OS', exact: true })).toBeVisible()
})

for (const width of [375, 320]) {
  test(`plays the full puzzle at ${width}px without horizontal page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await boot(page)
    await solve(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  })
}
