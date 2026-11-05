import { test, expect } from '@playwright/test'
import { logInAs, user } from './helpers/session.js'

// The games page is for logged-in people since G16; scores stay in this browser.
const player = user('507f1f77bcf86cd799439011', 'Alice')

const board = (page) => page.getByRole('group', { name: 'Tetris game board', exact: true })
const active = (page) => board(page).locator('.tetris-cell[data-kind="active"]')
const settled = (page) => board(page).locator('.tetris-cell[data-kind="settled"]')
const held = (page) =>
  page.getByRole('group', { name: 'Held piece', exact: true }).locator('[data-preview-piece]')
const nextPieces = (page) =>
  page.getByRole('group', { name: 'Next pieces', exact: true }).locator('[data-preview-piece]')
const control = (page, name) => page.getByRole('button', { name, exact: true })

async function counter(page, name) {
  return Number((await page.getByTestId(`tetris-${name}`).textContent()).replace(/[^\d]/g, ''))
}

async function positions(page) {
  return active(page).evaluateAll((cells) =>
    cells
      .map((cell) => ({ row: Number(cell.dataset.row), col: Number(cell.dataset.col) }))
      .sort((first, second) => first.row - second.row || first.col - second.col),
  )
}

async function openGame(page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await logInAs(page, player)
  await page.clock.install({ time: new Date('2026-10-19T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-19T12:01:00Z'))
  await page.goto('/take-a-break')
  // On a phone the carousel stacks the other cards behind the selected one, so bring
  // Tetris to the front first, the way a player would.
  await page.getByRole('button', { name: 'Show Tetris', exact: true }).click()
  await page.getByRole('link', { name: 'Play Tetris', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tetris', exact: true })).toBeVisible()
  await expect(control(page, 'Start game')).toBeVisible()
}

async function startGame(page) {
  await openGame(page)
  await control(page, 'Start game').click()
  // Flush Vue's leave animation frames without consuming a gravity interval.
  await page.clock.runFor(60)
  await expect(board(page)).toBeFocused()
}

async function hardDrop(page) {
  const previous = await counter(page, 'pieces')
  await board(page).focus()
  await page.keyboard.press('Space')
  await expect.poll(() => counter(page, 'pieces')).toBe(previous + 1)
}

async function stackUntilGameOver(page) {
  for (let turn = 0; turn < 150; turn += 1) {
    if (await page.getByRole('heading', { name: 'Game over', exact: true }).isVisible()) return
    await hardDrop(page)
  }
  throw new Error('150 centered hard drops did not reach game over')
}

async function trackAudio(page) {
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext || window.webkitAudioContext
    window.__tetrisAudio = {
      supported: Boolean(NativeContext),
      contexts: 0,
      oscillators: 0,
      buffers: 0,
      closed: 0,
      latestContext: null,
    }
    if (!NativeContext) return
    class TrackedContext extends NativeContext {
      constructor(...args) {
        super(...args)
        window.__tetrisAudio.contexts += 1
        window.__tetrisAudio.latestContext = this
      }
      createOscillator(...args) {
        window.__tetrisAudio.oscillators += 1
        return super.createOscillator(...args)
      }
      createBufferSource(...args) {
        window.__tetrisAudio.buffers += 1
        return super.createBufferSource(...args)
      }
      close(...args) {
        const result = super.close(...args)
        void Promise.resolve(result).then(() => {
          window.__tetrisAudio.closed += 1
        })
        return result
      }
    }
    window.AudioContext = TrackedContext
    window.webkitAudioContext = TrackedContext
  })
}

const audioVoices = (page) =>
  page.evaluate(() => window.__tetrisAudio.oscillators + window.__tetrisAudio.buffers)

async function advanceNativeMusic(page) {
  const before = await page.evaluate(() => window.__tetrisAudio.latestContext.currentTime)
  // AudioContext time is real even while the browser's game/scheduler clock is paused.
  await expect
    .poll(() => page.evaluate(() => window.__tetrisAudio.latestContext.currentTime), {
      timeout: 3000,
      intervals: [25, 50, 100],
    })
    .toBeGreaterThan(before + 0.25)
  await page.clock.runFor(100)
}

function placementCost(matrix, shape, x) {
  const blocked = (y) =>
    shape.some(
      (cell) => cell.row + y >= 20 || (cell.row + y >= 0 && matrix[cell.row + y][cell.col + x]),
    )
  if (blocked(0)) return null
  let y = 0
  while (!blocked(y + 1)) y += 1
  let next = matrix.map((row) => [...row])
  for (const cell of shape) next[cell.row + y][cell.col + x] = true
  const full = next.filter((row) => row.every(Boolean)).length
  next = next.filter((row) => !row.every(Boolean))
  while (next.length < 20) next.unshift(Array(10).fill(false))
  const heights = Array.from({ length: 10 }, (_, col) => {
    const top = next.findIndex((row) => row[col])
    return top < 0 ? 0 : 20 - top
  })
  let holes = 0
  for (let col = 0; col < 10; col += 1) {
    for (let row = 20 - heights[col]; row < 20; row += 1) {
      if (!next[row][col]) holes += 1
    }
  }
  const bumpiness = heights
    .slice(1)
    .reduce((total, height, index) => total + Math.abs(height - heights[index]), 0)
  return (
    0.51 * heights.reduce((total, height) => total + height, 0) +
    0.76 * holes +
    0.18 * bumpiness -
    0.76 * full
  )
}

async function placePieceFromRenderedBoard(page) {
  const matrix = Array.from({ length: 20 }, () => Array(10).fill(false))
  const locked = await settled(page).evaluateAll((cells) =>
    cells.map((cell) => ({ row: Number(cell.dataset.row), col: Number(cell.dataset.col) })),
  )
  for (const cell of locked) matrix[cell.row][cell.col] = true
  let best = null
  await board(page).focus()
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const cells = await positions(page)
    if (cells.length !== 4)
      throw new Error('A planned placement requires four visible active cells')
    const minRow = Math.min(...cells.map((cell) => cell.row))
    const minCol = Math.min(...cells.map((cell) => cell.col))
    const shape = cells.map((cell) => ({ row: cell.row - minRow, col: cell.col - minCol }))
    const width = Math.max(...shape.map((cell) => cell.col)) + 1
    for (let col = 0; col <= 10 - width; col += 1) {
      const cost = placementCost(matrix, shape, col)
      if (cost !== null && (!best || cost < best.cost)) best = { cost, rotation, col }
    }
    await page.keyboard.press('ArrowUp')
  }
  if (!best) throw new Error('No legal placement was found on the real board')
  for (let rotation = 0; rotation < best.rotation; rotation += 1)
    await page.keyboard.press('ArrowUp')
  for (let step = 0; step < 12; step += 1) await page.keyboard.press('ArrowLeft')
  for (let step = 0; step < best.col; step += 1) await page.keyboard.press('ArrowRight')
  await hardDrop(page)
}

async function playToScoreThreshold(page) {
  for (let piece = 0; piece < 40; piece += 1) {
    if ((await counter(page, 'score')) >= 500 && (await counter(page, 'lines')) > 0) return
    await placePieceFromRenderedBoard(page)
  }
  throw new Error('40 planned real placements did not reach 500 points and clear a line')
}

test('gallery opens Tetris with bounded keyboard movement, hold, previews and hard drops', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await startGame(page)
  await expect(page).toHaveURL(/game=tetris/)
  await expect(board(page).locator('.tetris-cell')).toHaveCount(200)
  await expect(active(page)).toHaveCount(4)
  await expect(board(page).locator('.tetris-cell[data-kind="ghost"]')).toHaveCount(4)
  await expect(nextPieces(page)).toHaveCount(3)
  await expect(held(page)).toHaveCount(0)
  await expect.poll(() => counter(page, 'level')).toBe(1)
  await expect.poll(() => counter(page, 'pieces')).toBe(0)
  const originalType = await active(page).first().getAttribute('data-piece')
  const firstNext = await nextPieces(page).first().getAttribute('data-preview-piece')

  await page.keyboard.press('c')
  await expect(held(page)).toHaveAttribute('data-preview-piece', originalType)
  await expect(active(page).first()).toHaveAttribute('data-piece', firstNext)
  const afterHold = await positions(page)
  await page.keyboard.press('c')
  expect(await positions(page)).toEqual(afterHold)
  await expect(held(page)).toHaveAttribute('data-preview-piece', originalType)

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('z')
  await expect(active(page)).toHaveCount(4)
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('ArrowLeft')
  expect(Math.min(...(await positions(page)).map((cell) => cell.col))).toBe(0)
  const againstLeftEdge = await positions(page)
  await page.keyboard.press('ArrowLeft')
  expect(await positions(page)).toEqual(againstLeftEdge)
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('d')
  expect(Math.max(...(await positions(page)).map((cell) => cell.col))).toBe(9)
  const againstRightEdge = await positions(page)
  await page.keyboard.press('d')
  expect(await positions(page)).toEqual(againstRightEdge)

  const beforeSoftDrop = Math.min(...(await positions(page)).map((cell) => cell.row))
  await page.keyboard.press('s')
  expect(Math.min(...(await positions(page)).map((cell) => cell.row))).toBeGreaterThan(
    beforeSoftDrop,
  )
  await hardDrop(page)
  await expect(settled(page)).toHaveCount(4)
  await expect.poll(() => counter(page, 'score')).toBeGreaterThan(0)
  await expect(nextPieces(page)).toHaveCount(3)
  await page.keyboard.press('c')
  await expect(active(page).first()).toHaveAttribute('data-piece', originalType)
  expect(errors).toEqual([])
})

test('gravity, explicit pause, blur pause and restart confirmation preserve the expected run', async ({
  page,
}) => {
  await startGame(page)
  const initialRow = Math.min(...(await positions(page)).map((cell) => cell.row))
  await page.clock.runFor(900)
  expect(Math.min(...(await positions(page)).map((cell) => cell.row))).toBeGreaterThan(initialRow)
  await board(page).focus()
  await page.keyboard.press('p')
  await expect(control(page, 'Resume game')).toBeVisible()
  await expect(control(page, 'Resume game')).toBeFocused()
  const paused = await positions(page)
  await page.clock.runFor(2_000)
  expect(await positions(page)).toEqual(paused)
  await page.keyboard.press('Escape')
  await page.clock.runFor(60)
  await expect(board(page)).toBeFocused()
  await page.clock.runFor(900)
  expect(Math.min(...(await positions(page)).map((cell) => cell.row))).toBeGreaterThan(
    Math.min(...paused.map((cell) => cell.row)),
  )

  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(control(page, 'Resume game')).toBeVisible()
  const blurred = await positions(page)
  await page.clock.runFor(2_000)
  expect(await positions(page)).toEqual(blurred)
  await control(page, 'Resume game').click()
  await page.clock.runFor(60)
  await hardDrop(page)
  const existingBoard = await settled(page).count()
  const existingScore = await counter(page, 'score')
  const beforeConfirmation = await positions(page)

  await control(page, 'New game').click()
  const confirmation = page.getByRole('alertdialog', { name: 'Restart game?', exact: true })
  await expect(confirmation).toBeVisible()
  await page.clock.runFor(2_000)
  expect(await positions(page)).toEqual(beforeConfirmation)
  await confirmation.getByRole('button', { name: 'Keep playing', exact: true }).click()
  await page.clock.runFor(60)
  await expect(confirmation).toHaveCount(0)
  await expect(settled(page)).toHaveCount(existingBoard)
  expect(await counter(page, 'score')).toBe(existingScore)
  await control(page, 'New game').click()
  await confirmation.getByRole('button', { name: 'Restart game', exact: true }).click()
  await page.clock.runFor(60)
  await expect(board(page)).toBeFocused()
  await expect(settled(page)).toHaveCount(0)
  await expect.poll(() => counter(page, 'score')).toBe(0)
  await expect.poll(() => counter(page, 'lines')).toBe(0)
  await expect.poll(() => counter(page, 'pieces')).toBe(0)
})

test('effects use native audio, mute stays silent, and centered drops reach a restartable game over', async ({
  page,
}) => {
  await trackAudio(page)
  await startGame(page)
  expect(await page.evaluate(() => window.__tetrisAudio.supported)).toBe(true)
  await control(page, 'Mute music').click()
  await hardDrop(page)
  await expect.poll(() => page.evaluate(() => window.__tetrisAudio.oscillators)).toBeGreaterThan(0)
  await control(page, 'Mute sound').click()
  await expect(control(page, 'Unmute sound')).toHaveAttribute('aria-pressed', 'true')
  const voices = await page.evaluate(() => window.__tetrisAudio.oscillators)
  await hardDrop(page)
  expect(await page.evaluate(() => window.__tetrisAudio.oscillators)).toBe(voices)
  await control(page, 'Unmute music').click()
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music playing')
  await stackUntilGameOver(page)
  await expect(page.getByRole('heading', { name: 'Game over', exact: true })).toBeVisible()
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music paused')
  const stoppedVoices = await audioVoices(page)
  await page.clock.runFor(600)
  expect(await audioVoices(page)).toBe(stoppedVoices)
  expect(await counter(page, 'pieces')).toBeLessThanOrEqual(150)
  const best = await counter(page, 'best')
  expect(best).toBeGreaterThanOrEqual(await counter(page, 'score'))
  await control(page, 'Play again').click()
  await page.clock.runFor(60)
  await expect(board(page)).toBeFocused()
  await expect(settled(page)).toHaveCount(0)
  await expect.poll(() => counter(page, 'score')).toBe(0)
  expect(await counter(page, 'best')).toBe(best)
  await control(page, 'Back to game library').click()
  await expect(page.getByRole('link', { name: 'Play Tetris', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__tetrisAudio.closed)).toBeGreaterThan(0)
})

test('background music continues independently, pauses cleanly, and remembers its own mute preference', async ({
  page,
}) => {
  await trackAudio(page)
  await openGame(page)
  expect(await page.evaluate(() => window.__tetrisAudio.contexts)).toBe(0)
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music ready')
  await control(page, 'Start game').click()
  await page.clock.runFor(60)
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music playing')
  await expect.poll(() => audioVoices(page)).toBeGreaterThan(0)
  await control(page, 'Mute sound').click()
  await expect(control(page, 'Unmute sound')).toHaveAttribute('aria-pressed', 'true')
  const beforeIdleMusic = await audioVoices(page)
  await advanceNativeMusic(page)
  expect(await audioVoices(page)).toBeGreaterThan(beforeIdleMusic)

  await control(page, 'Pause game').click()
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music paused')
  const pausedVoices = await audioVoices(page)
  await page.clock.runFor(600)
  expect(await audioVoices(page)).toBe(pausedVoices)
  await control(page, 'Resume game').click()
  await page.clock.runFor(60)
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music playing')
  await advanceNativeMusic(page)
  expect(await audioVoices(page)).toBeGreaterThan(pausedVoices)

  await control(page, 'Mute music').click()
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music off')
  const allMutedVoices = await audioVoices(page)
  await page.clock.runFor(600)
  expect(await audioVoices(page)).toBe(allMutedVoices)
  await control(page, 'Unmute sound').click()
  await expect(control(page, 'Unmute music')).toHaveAttribute('aria-pressed', 'true')
  await hardDrop(page)
  await expect.poll(() => audioVoices(page)).toBeGreaterThan(allMutedVoices)

  await page.reload()
  await expect(control(page, 'Start game')).toBeVisible()
  await expect(control(page, 'Unmute music')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music off')
  expect(await page.evaluate(() => window.__tetrisAudio.contexts)).toBe(0)
  await control(page, 'Start game').click()
  await page.clock.runFor(60)
  await control(page, 'Unmute music').click()
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music playing')
  await control(page, 'New game').click()
  await page
    .getByRole('alertdialog', { name: 'Restart game?', exact: true })
    .getByRole('button', { name: 'Restart game', exact: true })
    .click()
  await page.clock.runFor(60)
  await expect(page.getByTestId('tetris-music-status')).toHaveText('Music playing')
  expect(await page.evaluate(() => window.__tetrisAudio.contexts)).toBe(1)
  await control(page, 'Pause game').click()
  const afterRestartPause = await audioVoices(page)
  await page.clock.runFor(600)
  expect(await audioVoices(page)).toBe(afterRestartPause)
  await control(page, 'Back to game library').click()
  await expect.poll(() => page.evaluate(() => window.__tetrisAudio.closed)).toBe(1)
})

test('real scored placements update the level, gravity speed, musical tempo and next-level progress', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await startGame(page)
  await control(page, 'Mute music').click()
  await control(page, 'Mute sound').click()
  await expect.poll(() => counter(page, 'bpm')).toBe(128)
  await expect.poll(() => counter(page, 'speed')).toBe(800)
  await expect(page.getByTestId('tetris-level-progress')).toHaveText(/0\s*\/\s*500/)
  await board(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => counter(page, 'score')).toBe(1)
  await expect(page.getByTestId('tetris-level-progress')).toHaveText(/1\s*\/\s*500/)
  await playToScoreThreshold(page)
  const score = await counter(page, 'score')
  const level = 1 + Math.floor(score / 500)
  const speed = Math.max(100, 800 - (level - 1) * 65)
  expect(score).toBeGreaterThanOrEqual(500)
  expect(await counter(page, 'lines')).toBeGreaterThan(0)
  await expect.poll(() => counter(page, 'level')).toBe(level)
  await expect.poll(() => counter(page, 'speed')).toBe(speed)
  await expect.poll(() => counter(page, 'bpm')).toBe(Math.min(164, 128 + (level - 1) * 3))
  await expect(page.getByTestId('tetris-level-progress')).toHaveText(
    new RegExp(`${score % 500}\\s*\\/\\s*500`),
  )
  await expect(board(page)).toBeFocused()
  const row = Math.min(...(await positions(page)).map((cell) => cell.row))
  await page.clock.runFor(speed + 100)
  expect(Math.min(...(await positions(page)).map((cell) => cell.row))).toBeGreaterThan(row)
})

test.describe('touch controls', () => {
  test.use({ hasTouch: true })

  for (const width of [375, 320]) {
    test(`${width}px touch layout fits and supports movement, rotation, hold, drop and resume`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await startGame(page)
      const initialColumn = Math.min(...(await positions(page)).map((cell) => cell.col))
      await control(page, 'Move left').tap()
      expect(Math.min(...(await positions(page)).map((cell) => cell.col))).toBe(initialColumn - 1)
      await control(page, 'Move right').tap()
      expect(Math.min(...(await positions(page)).map((cell) => cell.col))).toBe(initialColumn)
      await control(page, 'Rotate clockwise').tap()
      await control(page, 'Rotate counterclockwise').tap()
      await control(page, 'Hold piece').tap()
      await expect(held(page)).toHaveCount(1)
      await control(page, 'Soft drop').tap()
      await control(page, 'Hard drop').tap()
      await expect.poll(() => counter(page, 'pieces')).toBe(1)
      await expect(settled(page)).toHaveCount(4)
      await control(page, 'Pause game').tap()
      await control(page, 'Resume game').tap()
      await page.clock.runFor(60)
      await expect(board(page)).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      const box = await board(page).boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    })
  }
})
