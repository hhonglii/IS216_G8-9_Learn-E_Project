import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import Game2048 from '../games/2048/Game2048.vue'

const audio = vi.hoisted(() => ({
  activate: vi.fn(() => Promise.resolve(true)),
  playSlide: vi.fn(),
  toggleMute: vi.fn(),
  toggleMusic: vi.fn(),
}))
const engine = vi.hoisted(() => ({ current: null }))
const scores = vi.hoisted(() => ({
  state: null,
  beginRun: vi.fn(),
  queueScore: vi.fn(),
  flushScore: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../games/useGameHighScores.js', async () => {
  const { reactive } = await import('vue')
  return {
    useGameHighScores: () => {
      scores.state = reactive({ gameId: '2048', userId: null, personalBest: null })
      return { ...scores, state: scores.state }
    },
  }
})

vi.mock('../games/useSlideSound.js', async () => {
  const { ref } = await import('vue')
  return {
    useSlideSound: () => ({
      ...audio,
      muted: ref(false),
      supported: ref(true),
      musicMuted: ref(false),
      musicPlaying: ref(false),
    }),
  }
})
vi.mock('../games/2048/use2048Game.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    use2048Game: () => {
      engine.current = actual.use2048Game({ random: () => 0, storage: null })
      return engine.current
    },
  }
})

let wrapper
const tile = (id, row, col, value = 2) => ({ id, row, col, value })
const root = () => wrapper.find('section.game-2048')
const board = () => wrapper.get('[aria-label="2048 game board"]')

async function mountGame(tiles = [tile('fixture-a', 1, 1)]) {
  wrapper = mount(Game2048, {
    attachTo: document.body,
    global: { stubs: { GameHighScores: true } },
  })
  engine.current.state.value.tiles = tiles
  await flushPromises()
  return engine.current
}

async function pointer(type, values = {}) {
  // jsdom's pointer fallback exposes readonly MouseEvent fields; define the event payload explicitly.
  const event = new Event(type, { bubbles: true })
  const properties = {
    button: 0,
    pointerId: 1,
    isPrimary: true,
    clientX: 100,
    clientY: 100,
    ...values,
  }
  Object.defineProperties(
    event,
    Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, { value }])),
  )
  board().element.dispatchEvent(event)
  await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  engine.current = null
})

describe('2048 input and feedback integration', () => {
  it('captures each run and submits current score gains without borrowing the browser best', async () => {
    const game = await mountGame([tile('fixture-a', 0, 0), tile('fixture-b', 0, 1)])
    game.state.value.best = 9000
    await nextTick()
    expect(scores.beginRun).toHaveBeenCalledOnce()
    expect(scores.queueScore).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="2048-best"]').text()).toBe('9000')
    expect(wrapper.text()).toContain('Browser best')

    scores.state.userId = 'another-player'
    await nextTick()
    expect(wrapper.get('[data-testid="2048-best"]').text()).toBe('—')
    scores.state.personalBest = { value: 36 }
    await nextTick()
    expect(wrapper.get('[data-testid="2048-best"]').text()).toBe('36')
    expect(wrapper.text()).toContain('Your best')
    expect(scores.beginRun).toHaveBeenCalledOnce()

    await root().trigger('keydown', { key: 'ArrowLeft' })
    expect(scores.queueScore).toHaveBeenCalledExactlyOnceWith(4)
    await wrapper.get('button.new-game').trigger('click')
    expect(scores.beginRun).toHaveBeenCalledTimes(2)
    // beginRun owns flushing the prior run; the host must not issue a second retry.
    expect(scores.flushScore).not.toHaveBeenCalled()
    expect(scores.queueScore).toHaveBeenCalledOnce()
    expect(game.state.value.score).toBe(0)
  })

  it('flushes a finished run and flushes pending scores when leaving', async () => {
    const game = await mountGame([tile('fixture-a', 0, 0, 1024), tile('fixture-b', 0, 1, 1024)])
    await root().trigger('keydown', { key: 'ArrowLeft' })
    expect(scores.queueScore).toHaveBeenCalledExactlyOnceWith(2048)
    expect(scores.flushScore).toHaveBeenCalledOnce()
    game.state.value.best += 100
    await nextTick()
    expect(scores.queueScore).toHaveBeenCalledOnce()
    wrapper.unmount()
    wrapper = null
    expect(scores.flushScore).toHaveBeenCalledTimes(2)
  })

  it('plays exactly one effect for a merge and none for a blocked move', async () => {
    const game = await mountGame([tile('fixture-a', 0, 0), tile('fixture-b', 0, 1)])
    await root().trigger('keydown', { key: 'ArrowLeft' })
    expect(game.state.value).toMatchObject({ moves: 1, score: 4 })
    expect(audio.playSlide).toHaveBeenCalledOnce()
    const snapshot = JSON.stringify(game.state.value)
    await root().trigger('keydown', { key: 'ArrowUp' })
    expect(JSON.stringify(game.state.value)).toBe(snapshot)
    expect(audio.playSlide).toHaveBeenCalledOnce()
  })

  it.each(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'w', 'a', 's', 'd'])(
    'supports the %s keyboard direction',
    async (key) => {
      const game = await mountGame()
      await root().trigger('keydown', { key })
      expect(game.state.value.moves).toBe(1)
      expect(audio.playSlide).toHaveBeenCalledOnce()
    },
  )

  it('ignores browser modifier shortcuts and editable input', async () => {
    const game = await mountGame()
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      await root().trigger('keydown', { key: 'ArrowLeft', [modifier]: true })
    }
    const input = document.createElement('input')
    root().element.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(game.state.value.moves).toBe(0)
    expect(audio.playSlide).not.toHaveBeenCalled()
    expect(audio.activate).not.toHaveBeenCalled()
  })

  it('keeps audio switches from triggering the general pointer activation handler', async () => {
    await mountGame()
    const controls = wrapper.findAll('[data-audio-control]')
    await controls[0].trigger('pointerdown')
    await controls[0].trigger('click')
    await controls[1].trigger('pointerdown')
    await controls[1].trigger('click')
    expect(audio.activate).not.toHaveBeenCalled()
    expect(audio.toggleMute).toHaveBeenCalledOnce()
    expect(audio.toggleMusic).toHaveBeenCalledOnce()
  })

  it('accepts one primary swipe even when a second pointer arrives or loses capture', async () => {
    const game = await mountGame()
    await pointer('pointerdown')
    await pointer('pointerdown', { pointerId: 2, isPrimary: false })
    await pointer('lostpointercapture', { pointerId: 2, isPrimary: false })
    await pointer('pointerup', { clientX: 200 })
    await pointer('pointerup', { clientX: 200 })
    expect(game.state.value.moves).toBe(1)
    expect(audio.playSlide).toHaveBeenCalledOnce()
  })

  it('ignores taps, cancelled gestures and unrelated pointer releases', async () => {
    const game = await mountGame()
    await pointer('pointerdown')
    await pointer('pointerup', { clientX: 123 })
    await pointer('pointerdown')
    await pointer('pointercancel')
    await pointer('pointerup', { clientX: 200 })
    await pointer('pointerup', { pointerId: 2, clientX: 200 })
    expect(game.state.value.moves).toBe(0)
    expect(audio.playSlide).not.toHaveBeenCalled()
  })

  it('does not apply a gesture from the old board after starting a new game', async () => {
    const game = await mountGame()
    await pointer('pointerdown')
    await wrapper.get('button.new-game').trigger('click')
    await pointer('pointerup', { clientX: 200 })
    expect(game.state.value).toMatchObject({ moves: 0, score: 0 })
    expect(game.state.value.tiles).toHaveLength(2)
    expect(audio.playSlide).not.toHaveBeenCalled()
  })

  it('still handles an in-board swipe when pointer capture is unavailable', async () => {
    const game = await mountGame()
    board().element.setPointerCapture = () => {
      throw new DOMException('Pointer ended')
    }
    await pointer('pointerdown')
    await pointer('pointerup', { clientY: 200 })
    expect(game.state.value.moves).toBe(1)
    expect(audio.playSlide).toHaveBeenCalledOnce()
  })

  it('focuses the result at 2048 and resumes keyboard play after Keep playing', async () => {
    const game = await mountGame([tile('fixture-a', 0, 0, 1024), tile('fixture-b', 0, 1, 1024)])
    await root().trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()
    expect(game.state.value.status).toBe('won')
    expect(wrapper.get('.game-result h3').element).toBe(document.activeElement)
    const keepPlaying = wrapper
      .findAll('.game-result button')
      .find((button) => button.text() === 'Keep playing')
    await keepPlaying.trigger('click')
    await nextTick()
    expect(game.state.value.status).toBe('playing')
    expect(board().element).toBe(document.activeElement)
    await root().trigger('keydown', { key: 'ArrowDown' })
    expect(game.state.value.moves).toBe(2)
    expect(audio.playSlide).toHaveBeenCalledTimes(2)
  })
})
