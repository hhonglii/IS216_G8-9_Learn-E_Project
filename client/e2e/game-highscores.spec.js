import { test, expect } from '@playwright/test'
import { logInAs, user as person } from './helpers/session.js'

// Each game keeps only the logged-in player's own best in this browser. There is
// no shared leaderboard any more (decision H-16).
const ALICE = '507f1f77bcf86cd799439011'
const BOB = '507f1f77bcf86cd799439012'
const NAMES = { [ALICE]: 'Alice', [BOB]: 'Bob' }
const value = (page, game) => page.getByTestId(`${game}-score`)
const command = (page) => page.getByRole('textbox', { name: 'Terminal command', exact: true })

// Seed this browser's score records and log the player in: all game input,
// scoring, timers and save hooks run in the real bundle.
async function scoreServer(page, { user = ALICE, initial = {} } = {}) {
  await page.addInitScript(
    ({ initial }) => {
      const KEY = 'learn-e.gameScores'
      localStorage.setItem('learn-e-rootkit-tutorial-v1', 'done')
      // Seed once per tab, so a reload keeps what the game saved.
      if (!sessionStorage.getItem('scores-seeded')) {
        const records = {}
        for (const [key, value] of Object.entries(initial)) {
          const [gameId, userId] = key.split(':')
          records[gameId] ??= {}
          records[gameId][userId] = { value, achievedAt: '2026-10-20T00:00:00Z' }
        }
        localStorage.setItem(KEY, JSON.stringify(records))
        sessionStorage.setItem('scores-seeded', '1')
      }
      const { getItem, setItem } = Storage.prototype
      window.__readScores = () => JSON.parse(getItem.call(localStorage, KEY) || '{}')
      window.__scoreWrites = 0
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === KEY) window.__scoreWrites += 1
        return setItem.call(this, key, value)
      }
    },
    { initial },
  )
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  if (user) await logInAs(page, person(user, NAMES[user]))
}

async function storedScores(page) {
  const records = await page.evaluate(() => window.__readScores())
  return Object.fromEntries(
    Object.entries(records).flatMap(([gameId, players]) =>
      Object.entries(players).map(([userId, record]) => [`${gameId}:${userId}`, record.value]),
    ),
  )
}

const storedScore = async (page, key) => (await storedScores(page))[key]
const scoreWrites = (page) => page.evaluate(() => window.__scoreWrites)

async function merge2048(page) {
  // Cycling directions on the actual random board reaches a first merge quickly.
  for (let turn = 0; turn < 40; turn += 1) {
    const score = Number((await value(page, '2048').textContent()).replace(/\D/g, ''))
    if (score > 0) return score
    await page
      .getByRole('button', {
        name: `Slide ${['left', 'down', 'right', 'up'][turn % 4]}`,
        exact: true,
      })
      .click()
  }
  throw new Error('No merge reached after forty real slides')
}

async function run(page, text) {
  await command(page).fill(text)
  await command(page).press('Enter')
}

async function solveRootkit(page) {
  await run(page, 'cat cipher.txt')
  await run(page, 'decrypt hvsuhvvr --shift 3')
  await page.getByRole('button', { name: 'Toggle net_sniffer.app', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect anomalous packet', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle sys_monitor.app', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Core frequency MHz', exact: true }).fill('404')
  await page.getByRole('button', { name: 'Toggle bash_terminal.exe', exact: true }).click()
  await run(page, 'cat network.log')
  await run(page, 'ssh barista@coffee.local -p 4040')
  const password = page.getByRole('textbox', { name: 'SSH password', exact: true })
  await password.fill('BEAN-404')
  await password.press('Enter')
  await run(page, 'sudo brew --espresso')
  await expect(page.getByRole('heading', { name: 'Espresso unlocked.', exact: true })).toBeVisible()
}

test("no leaderboard on the library or in a game, and no one else's scores", async ({ page }) => {
  await scoreServer(page, { initial: { [`2048:${ALICE}`]: 1024, [`2048:${BOB}`]: 2048 } })
  await page.goto('/take-a-break')
  await expect(page.locator('.game-card')).toHaveCount(3)
  await expect(page.getByText('Leaderboard')).toHaveCount(0)
  await page.goto('/take-a-break?game=2048')
  await expect(page.getByTestId('2048-best')).toHaveText('1024')
  await expect(page.getByText('Leaderboard')).toHaveCount(0)
  await expect(page.getByText('Bob')).toHaveCount(0)
})

test('2048 saves actual merge points for the player and reloads the personal best', async ({
  page,
}) => {
  await scoreServer(page)
  await page.goto('/take-a-break?game=2048')
  const score = await merge2048(page)
  await expect.poll(() => storedScore(page, `2048:${ALICE}`)).toBe(score)
  await expect(page.getByTestId('2048-best')).toHaveText(String(score))
  expect(Object.keys(await storedScores(page))).toEqual([`2048:${ALICE}`])
  await page.reload()
  await expect(value(page, '2048')).toHaveText('0')
  await expect(page.getByTestId('2048-best')).toHaveText(String(score))
})

// Since G16 a guest can reach the games only with a stored token the app could not
// check, for example when the server was down at start-up.
test('a player whose login could not be checked plays as a guest and saves nothing', async ({
  page,
}) => {
  await scoreServer(page, { user: null })
  await page.addInitScript(() => localStorage.setItem('learn-e.sessionToken', 'unchecked-token'))
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 500, json: {} }))
  await page.goto('/take-a-break?game=2048')
  await merge2048(page)
  expect(await scoreWrites(page)).toBe(0)
})

test('Tetris saves hard-drop points and preserves the record on reload', async ({ page }) => {
  await scoreServer(page)
  await page.clock.install()
  await page.goto('/take-a-break?game=tetris')
  await page.getByRole('button', { name: 'Start game', exact: true }).click()
  const board = page.getByRole('group', { name: 'Tetris game board', exact: true })
  await board.focus()
  await board.press('Space')
  await expect(value(page, 'tetris')).not.toHaveText('0')
  await page.clock.runFor(600)
  const score = Number(await value(page, 'tetris').textContent())
  await expect.poll(() => storedScore(page, `tetris:${ALICE}`)).toBe(score)
  await page.reload()
  await expect(page.getByTestId('tetris-best')).toHaveText(score.toLocaleString('en-US'))
})

test('RootKit saves a finish beyond twenty minutes and excludes paused reference time', async ({
  page,
}) => {
  await scoreServer(page, { initial: { [`rootkit:${BOB}`]: 1300000 } })
  await page.clock.install({ time: new Date('2026-10-20T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-20T12:00:01Z'))
  await page.goto('/take-a-break?game=rootkit')
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await page.clock.fastForward(1234567)
  await page.getByRole('button', { name: 'Commands', exact: true }).click()
  await page.clock.fastForward(60000)
  await page.getByRole('button', { name: 'Return to game', exact: true }).click()
  expect(await scoreWrites(page)).toBe(0)
  await solveRootkit(page)
  await expect.poll(() => storedScore(page, `rootkit:${ALICE}`)).toBe(1234567)
  await expect(page.getByTestId('rootkit-best-time')).toHaveText('Your best: 20:34.567')
})

test('RootKit keeps long unfinished play active without submitting a score', async ({ page }) => {
  await scoreServer(page)
  await page.clock.install()
  await page.goto('/take-a-break?game=rootkit')
  await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
  await page.clock.fastForward(1200001)
  await expect(page.getByLabel('Time elapsed', { exact: true })).toHaveText('20:00')
  await expect(command(page)).toBeEnabled()
  await expect(page.getByTestId('rootkit-finish-time')).toHaveCount(0)
  expect(await scoreWrites(page)).toBe(0)
  await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
  expect(await scoreWrites(page)).toBe(0)
  expect(await storedScore(page, `rootkit:${ALICE}`)).toBeUndefined()
})
