import { test, expect } from '@playwright/test'
import { logInAs, user } from './helpers/session.js'

// The games page is for logged-in people since G16; scores stay in this browser.
const player = user('507f1f77bcf86cd799439011', 'Alice')

const entries = [
  { id: '2048', title: '2048' },
  { id: 'rootkit', title: 'RootKit OS' },
  { id: 'tetris', title: 'Tetris' },
]

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { data: { status: 'ok' } } }))
  await logInAs(page, player)
})

async function dismissTutorial(page, id) {
  if (id === 'rootkit') {
    await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click()
  }
}

async function playWithoutOptionalServices(page, id) {
  if (id === '2048') {
    for (const direction of ['left', 'up', 'right', 'down']) {
      await page.getByRole('button', { name: `Slide ${direction}`, exact: true }).click()
    }
    await expect(page.getByTestId('2048-moves')).not.toHaveText('0')
  } else if (id === 'tetris') {
    await page.getByRole('button', { name: 'Start game', exact: true }).click()
    await page.getByRole('group', { name: 'Tetris game board', exact: true }).press('Space')
    await expect(page.getByTestId('tetris-pieces')).toHaveText('1')
  } else {
    await page.getByRole('button', { name: 'Boot RootKit OS', exact: true }).click()
    const command = page.getByRole('textbox', { name: 'Terminal command', exact: true })
    await command.fill('ls')
    await command.press('Enter')
    await expect(page.getByRole('log', { name: 'Terminal output' })).toContainText('README.txt')
  }
}

test('all three cards support keyboard entry and restore gallery focus on return', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/take-a-break')
  for (const game of entries) {
    const card = page.getByRole('link', { name: `Play ${game.title}`, exact: true })
    await card.focus()
    await card.press('Enter')
    await expect(page).toHaveURL(new RegExp(`game=${game.id}$`))
    await dismissTutorial(page, game.id)
    await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Take a break.', exact: true })).toBeFocused()
    await expect(page.locator('.game-card')).toHaveCount(3)
  }
  expect(errors).toEqual([])
})

test('unknown and repeated game parameters fall back to the usable library', async ({ page }) => {
  await page.goto('/take-a-break?game=unknown')
  await expect(page.locator('.game-card')).toHaveCount(3)
  await page.goto('/take-a-break?game=2048&game=tetris')
  await expect(page.locator('.game-card')).toHaveCount(3)
  await page.getByRole('link', { name: 'Play Tetris', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
})

for (const game of entries) {
  test(`${game.title} remains playable without Web Audio or local storage`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    // Simulate restricted browser features without replacing any game rules/state.
    // The session token is let through: without it the login guard (G16) never
    // reaches the game. blocked-storage.spec.js covers storage blocked outright.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true })
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined, configurable: true })
      for (const method of ['getItem', 'setItem']) {
        const original = Storage.prototype[method]
        Storage.prototype[method] = function (key, ...rest) {
          if (key === 'learn-e.sessionToken') return original.call(this, key, ...rest)
          throw new DOMException('Storage is unavailable', 'SecurityError')
        }
      }
    })
    await page.goto(`/take-a-break?game=${game.id}`)
    await dismissTutorial(page, game.id)
    await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeDisabled()
    await playWithoutOptionalServices(page, game.id)
    await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
    await expect(page.locator('.game-card')).toHaveCount(3)
    expect(errors).toEqual([])
  })
}

test('carousel controls wrap and keyboard selection follows focus through play and return', async ({
  page,
}) => {
  await page.goto('/take-a-break')

  await page.getByRole('button', { name: 'Previous game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show Tetris', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Next game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show 2048', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Show RootKit OS', exact: true }).click()
  const rootkit = page.getByRole('link', { name: 'Play RootKit OS', exact: true })
  await rootkit.focus()
  await rootkit.press('ArrowRight')
  const tetris = page.getByRole('link', { name: 'Play Tetris', exact: true })
  await expect(tetris).toBeFocused()
  await tetris.press('Home')
  const firstGame = page.getByRole('link', { name: 'Play 2048', exact: true })
  await expect(firstGame).toBeFocused()
  await firstGame.press('End')
  await expect(tetris).toBeFocused()
  await tetris.press('Enter')
  await expect(page).toHaveURL(/\/take-a-break\?game=tetris$/)
  await page.getByRole('button', { name: 'Back to game library', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Take a break.', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Show Tetris', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('dragging a game link snaps without opening it and a later click still plays', async ({
  page,
}) => {
  await page.goto('/take-a-break')
  const firstGame = page.getByRole('link', { name: 'Play 2048', exact: true })
  await firstGame.scrollIntoViewIfNeeded()
  const bounds = await firstGame.boundingBox()
  expect(bounds).not.toBeNull()
  const y = bounds.y + bounds.height / 3

  // A vertical mouse drag must not turn into an accidental launch on release either.
  await page.mouse.move(bounds.x + bounds.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2, y + 80, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Show 2048', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page).toHaveURL(/\/take-a-break$/)

  await page.mouse.move(bounds.x + bounds.width * 0.7, y)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.25, y, { steps: 6 })
  await page.mouse.up()

  await expect(page.getByRole('button', { name: 'Show RootKit OS', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page).toHaveURL(/\/take-a-break$/)
  await page.getByRole('button', { name: 'Show Tetris', exact: true }).click()
  await page.getByRole('link', { name: 'Play Tetris', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
})

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`${viewport.width}x${viewport.height} shows every game and its controls without scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/take-a-break')

    const controls = page.locator('.carousel-controls button')
    await expect(controls).toHaveCount(5)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    // Check before clicking: Playwright's automatic scrolling must not hide a sizing regression.
    for (const control of await controls.all()) {
      await expect(control).toBeInViewport({ ratio: 1 })
      const bounds = await control.boundingBox()
      expect(bounds.width).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }

    for (const game of entries) {
      await page.getByRole('button', { name: `Show ${game.title}`, exact: true }).click()
      const selected = page.locator('.game-card.is-selected')
      await expect(selected).toHaveAttribute(
        'aria-label',
        `${game.title}, ${entries.indexOf(game) + 1} of 3`,
      )
      await expect(selected).toBeInViewport({ ratio: 1 })
      const header = await page.locator('.app-bar').boundingBox()
      expect((await selected.boundingBox()).y).toBeGreaterThanOrEqual(header.y + header.height)
      const play = selected.locator('.game-card-cta')
      await expect(play).toBeInViewport({ ratio: 1 })
      expect((await play.boundingBox()).height).toBeGreaterThanOrEqual(44)
      for (const control of await controls.all()) {
        await expect(control).toBeInViewport({ ratio: 1 })
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      )
    }
  })
}

async function touchCarousel(page, dx, dy, cancel = false) {
  const selected = page.locator('.game-card.is-selected .game-card-link')
  await selected.scrollIntoViewIfNeeded()
  const bounds = await selected.boundingBox()
  if (!bounds) throw new Error('The selected game has no touch bounds')
  const x = bounds.x + bounds.width / 2 - dx / 2
  const y = bounds.y + bounds.height / 2 - dy / 2
  const scrollBefore = await page.evaluate(() => window.scrollY)
  const client = await page.context().newCDPSession(page)
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    })
    for (let step = 1; step <= 4; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + (dx * step) / 4, y: y + (dy * step) / 4 }],
      })
    }
    await client.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    })
  } finally {
    await client.detach()
  }
  return scrollBefore
}

test.describe('touch carousel', () => {
  test.use({ hasTouch: true })

  for (const width of [375, 320]) {
    test(`${width}px supports cancellation, swipe selection and native vertical scrolling`, async ({
      page,
    }) => {
      // Short enough that the library scrolls now the leaderboard is gone (H-16).
      await page.setViewportSize({ width, height: 520 })
      await page.goto('/take-a-break')

      // Cancellation must settle on the original card, even after a committed horizontal drag.
      await touchCarousel(page, -110, 0, true)
      await expect(page.getByRole('button', { name: 'Show 2048', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await touchCarousel(page, -110, 0)
      await expect(
        page.getByRole('button', { name: 'Show RootKit OS', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/\/take-a-break$/)

      const scrollBefore = await touchCarousel(page, 0, -160)
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(scrollBefore + 20)
      await expect(
        page.getByRole('button', { name: 'Show RootKit OS', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
  }
})
