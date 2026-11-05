import { test, expect } from '@playwright/test'
import { logInAs, user } from './helpers/session.js'

// The games page is for logged-in people since G16; scores stay in this browser.
const player = user('507f1f77bcf86cd799439011', 'Alice')

const DIRECTIONS = ['left', 'up', 'right', 'down']
const KEYS = { left: 'ArrowLeft', up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown' }
const board = (page) => page.getByRole('group', { name: '2048 game board', exact: true })
const moves = (page) => page.getByTestId('2048-moves')
const slideButton = (page, direction) =>
  page.getByRole('button', { name: `Slide ${direction}`, exact: true })

async function mockHealth(page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await logInAs(page, player)
}

async function openGame(page) {
  await mockHealth(page)
  await page.goto('/take-a-break')
  await page.getByRole('link', { name: 'Play 2048', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toBeVisible()
  await expect(page.locator('.number-tile')).toHaveCount(2)
}

async function readBoard(page) {
  return page.locator('.number-tile:not(.tile-leave-active)').evaluateAll((elements) => {
    const matrix = Array.from({ length: 4 }, () => Array(4).fill(0))
    for (const element of elements) {
      matrix[Number(element.dataset.row)][Number(element.dataset.col)] = Number(
        element.dataset.tileValue,
      )
    }
    return matrix
  })
}

// Derive legal inputs from the real random board; no seed or game-state hooks are used.
function previewSlide(matrix, direction) {
  const result = Array.from({ length: 4 }, () => Array(4).fill(0))
  let score = 0
  for (let lane = 0; lane < 4; lane += 1) {
    const positions = Array.from({ length: 4 }, (_, offset) => {
      if (direction === 'left') return [lane, offset]
      if (direction === 'right') return [lane, 3 - offset]
      if (direction === 'up') return [offset, lane]
      return [3 - offset, lane]
    })
    const values = positions.map(([row, col]) => matrix[row][col]).filter(Boolean)
    const collapsed = []
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] === values[index + 1]) {
        collapsed.push(values[index] * 2)
        score += values[index] * 2
        index += 1
      } else collapsed.push(values[index])
    }
    for (const [offset, [row, col]] of positions.entries()) {
      result[row][col] = collapsed[offset] || 0
    }
  }
  return { changed: JSON.stringify(result) !== JSON.stringify(matrix), score }
}

async function legalDirection(page) {
  const matrix = await readBoard(page)
  const direction = DIRECTIONS.find((candidate) => previewSlide(matrix, candidate).changed)
  if (!direction) throw new Error(`No legal slide on board ${JSON.stringify(matrix)}`)
  return direction
}

async function moveWithButton(page, direction) {
  const previous = Number(await moves(page).textContent())
  await slideButton(page, direction).click()
  await expect(moves(page)).toHaveText(String(previous + 1))
}

async function findBlockedDirection(page) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const matrix = await readBoard(page)
    const blocked = DIRECTIONS.find((direction) => !previewSlide(matrix, direction).changed)
    if (blocked) return blocked
    await moveWithButton(page, DIRECTIONS[attempt % DIRECTIONS.length])
  }
  throw new Error('No blocked direction found after 64 real game moves')
}

async function playUntilMerge(page) {
  let score = 0
  for (let attempt = 0; attempt < 64 && score === 0; attempt += 1) {
    const matrix = await readBoard(page)
    const choices = DIRECTIONS.map((direction) => ({
      direction,
      ...previewSlide(matrix, direction),
    }))
      .filter((choice) => choice.changed)
      .sort((first, second) => second.score - first.score)
    if (!choices.length) throw new Error('The random game ended before its first merge')
    await moveWithButton(page, choices[0].direction)
    score = Number(await page.getByTestId('2048-score').textContent())
  }
  return score
}

async function swipeBoard(page, direction) {
  await board(page).scrollIntoViewIfNeeded()
  const bounds = await board(page).boundingBox()
  if (!bounds) throw new Error('2048 board has no touch bounds')
  const offsets = { left: [-1, 0], up: [0, -1], right: [1, 0], down: [0, 1] }
  const [dx, dy] = offsets[direction]
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const span = bounds.width * 0.4
  const client = await page.context().newCDPSession(page)
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: centerX - (dx * span) / 2, y: centerY - (dy * span) / 2 }],
    })
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: centerX + (dx * span) / 2, y: centerY + (dy * span) / 2 }],
    })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await client.detach()
  }
}

async function instrumentAudio(page) {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext
    window.__audio2048 = {
      supported: Boolean(NativeAudioContext),
      contexts: 0,
      oscillators: 0,
      closed: 0,
      instances: [],
    }
    if (!NativeAudioContext) return
    class TrackedAudioContext extends NativeAudioContext {
      constructor(...args) {
        super(...args)
        window.__audio2048.contexts += 1
        window.__audio2048.instances.push(this)
      }
      createOscillator(...args) {
        window.__audio2048.oscillators += 1
        return super.createOscillator(...args)
      }
      close(...args) {
        const result = super.close(...args)
        void Promise.resolve(result).then(() => {
          window.__audio2048.closed += 1
        })
        return result
      }
    }
    window.AudioContext = TrackedAudioContext
    window.webkitAudioContext = TrackedAudioContext
  })
}

const oscillatorCount = (page) => page.evaluate(() => window.__audio2048.oscillators)
const audioTime = (page) => page.evaluate(() => window.__audio2048.instances[0]?.currentTime || 0)

test('gallery opens standard 2048 and keyboard slides merge or move before spawning a tile', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page)
  await expect(page).toHaveURL(/\/take-a-break\?game=2048$/)
  await expect(board(page)).toBeFocused()
  await expect(moves(page)).toHaveText('0')
  await expect(page.getByTestId('2048-score')).toHaveText('0')
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByRole('button', { name: 'Mute music', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByTestId('2048-music-status')).toHaveText('Music ready')
  const before = await readBoard(page)
  const initialIds = await page
    .locator('.number-tile')
    .evaluateAll((elements) => elements.map((element) => element.dataset.tileId))
  const direction = await legalDirection(page)
  await page.keyboard.press(KEYS[direction])
  await expect(moves(page)).toHaveText('1')
  const after = await readBoard(page)
  const difference =
    after.flat().reduce((sum, value) => sum + value, 0) -
    before.flat().reduce((sum, value) => sum + value, 0)
  expect([2, 4]).toContain(difference)
  const resultingIds = await page
    .locator('.number-tile')
    .evaluateAll((elements) => elements.map((element) => element.dataset.tileId))
  expect(new Set(resultingIds).size).toBe(resultingIds.length)
  expect(resultingIds.some((id) => !initialIds.includes(id))).toBe(true)
  const wasd = { left: 'a', up: 'w', right: 'd', down: 's' }
  await board(page).focus()
  await page.keyboard.press(wasd[await legalDirection(page)])
  await expect(moves(page)).toHaveText('2')
  await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Play 2048', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('valid slides create one real Web Audio voice, while blocked and muted inputs are silent', async ({
  page,
}) => {
  await instrumentAudio(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('learn-e-2048-music-muted', 'true')
  })
  await openGame(page)
  expect(await page.evaluate(() => window.__audio2048.supported)).toBe(true)
  expect(await oscillatorCount(page)).toBe(0)
  await moveWithButton(page, await legalDirection(page))
  await expect.poll(() => oscillatorCount(page)).toBe(1)

  const blockedDirection = await findBlockedDirection(page)
  const expectedVoices = Number(await moves(page).textContent())
  await expect.poll(() => oscillatorCount(page)).toBe(expectedVoices)
  const beforeBlocked = await readBoard(page)
  await slideButton(page, blockedDirection).click()
  await expect(moves(page)).toHaveText(String(expectedVoices))
  expect(await readBoard(page)).toEqual(beforeBlocked)
  expect(await oscillatorCount(page)).toBe(expectedVoices)

  await page.getByRole('button', { name: 'Mute sound', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await moveWithButton(page, await legalDirection(page))
  expect(await oscillatorCount(page)).toBe(expectedVoices)
  await page.getByRole('button', { name: 'Unmute sound', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await moveWithButton(page, await legalDirection(page))
  await expect.poll(() => oscillatorCount(page)).toBe(expectedVoices + 1)
})

test('music starts on a gesture, plays without slides, mutes independently, and closes on exit', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await instrumentAudio(page)
  await openGame(page)
  expect(await page.evaluate(() => window.__audio2048.supported)).toBe(true)
  await expect(page.getByTestId('2048-music-status')).toHaveText('Music ready')
  expect(await page.evaluate(() => window.__audio2048.contexts)).toBe(0)
  expect(await oscillatorCount(page)).toBe(0)

  await board(page).click()
  await expect(page.getByTestId('2048-music-status')).toHaveText('Music playing')
  await expect.poll(() => oscillatorCount(page)).toBeGreaterThan(0)
  const firstNotes = await oscillatorCount(page)
  await expect.poll(() => oscillatorCount(page)).toBeGreaterThan(firstNotes)
  await expect(moves(page)).toHaveText('0')
  expect(await page.evaluate(() => window.__audio2048.contexts)).toBe(1)

  await page.getByRole('button', { name: 'Mute music', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unmute music', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('2048-music-status')).toHaveText('Music off')
  expect(await page.evaluate(() => window.localStorage.getItem('learn-e-2048-music-muted'))).toBe(
    'true',
  )
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  const mutedNotes = await oscillatorCount(page)
  const mutedAt = await audioTime(page)
  // Observe a full musical beat on the actual audio clock while music is muted.
  await expect.poll(() => audioTime(page)).toBeGreaterThan(mutedAt + 0.8)
  expect(await oscillatorCount(page)).toBe(mutedNotes)
  await moveWithButton(page, await legalDirection(page))
  await expect.poll(() => oscillatorCount(page)).toBe(mutedNotes + 1)

  await page.getByRole('button', { name: 'Unmute music', exact: true }).click()
  await expect(page.getByTestId('2048-music-status')).toHaveText('Music playing')
  await expect.poll(() => oscillatorCount(page)).toBeGreaterThan(mutedNotes + 1)
  expect(await page.evaluate(() => window.__audio2048.contexts)).toBe(1)
  await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Play 2048', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__audio2048.closed)).toBe(1)
  expect(errors).toEqual([])
})

test('new game resets the board and score while the best score survives a reload', async ({
  page,
}) => {
  await openGame(page)
  const score = await playUntilMerge(page)
  expect(score).toBeGreaterThan(0)
  // Logged in (G16), Best is the saved personal best, shown once the score is saved.
  await expect(page.getByTestId('2048-best')).toHaveText(/^\d+$/)
  const best = Number(await page.getByTestId('2048-best').textContent())
  expect(best).toBeGreaterThanOrEqual(score)
  await page.getByRole('button', { name: 'New game', exact: true }).click()
  await expect(page.locator('.number-tile')).toHaveCount(2)
  await expect(page.getByTestId('2048-score')).toHaveText('0')
  await expect(moves(page)).toHaveText('0')
  await expect(page.getByTestId('2048-best')).toHaveText(String(best))
  await page.reload()
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toBeVisible()
  await expect(page.getByTestId('2048-best')).toHaveText(String(best))
  await expect(page.locator('.number-tile')).toHaveCount(2)
  await expect(moves(page)).toHaveText('0')
})

test('slow or failed game downloads show loading feedback and a route back', async ({ page }) => {
  await mockHealth(page)
  let releaseDownload
  const downloadGate = new Promise((resolve) => {
    releaseDownload = resolve
  })
  await page.route(/Game2048(?:\.vue|-[^/]+\.js)(?:\?|$)/, async (route) => {
    await downloadGate
    await route.abort('failed')
  })
  await page.goto('/take-a-break')
  await page.getByRole('link', { name: 'Play 2048', exact: true }).click()
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Loading game' })).toBeVisible()
  } finally {
    releaseDownload()
  }
  await expect(page.getByRole('heading', { name: 'Game could not load' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to game library', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Play 2048', exact: true })).toBeVisible()
})

test.describe('touch layout', () => {
  test.use({ hasTouch: true })

  test('375px and 320px layouts fit and accept both touch controls and a real touch swipe', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 850 })
    await openGame(page)
    await slideButton(page, await legalDirection(page)).tap()
    await expect(moves(page)).toHaveText('1')
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)

    await page.setViewportSize({ width: 320, height: 800 })
    const compact = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(compact.document).toBeLessThanOrEqual(compact.viewport)
    await expect(slideButton(page, 'left')).toBeVisible()
    const musicButton = page.getByRole('button', { name: 'Mute music', exact: true })
    const soundButton = page.getByRole('button', { name: 'Mute sound', exact: true })
    await expect(musicButton).toBeVisible()
    await expect(soundButton).toBeVisible()
    await expect(musicButton).toBeEnabled()
    await expect(soundButton).toBeEnabled()
    for (const control of [musicButton, soundButton]) {
      const bounds = await control.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
    }
    await musicButton.tap()
    await expect(page.getByRole('button', { name: 'Unmute music', exact: true })).toBeVisible()
    await soundButton.tap()
    await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toBeVisible()
    // Chromium suppresses compatibility clicks immediately after synthetic CDP
    // swipes, so exercise real button taps before dispatching the swipe gesture.
    const direction = await legalDirection(page)
    await swipeBoard(page, direction)
    await expect(moves(page)).toHaveText('2')
  })
})
