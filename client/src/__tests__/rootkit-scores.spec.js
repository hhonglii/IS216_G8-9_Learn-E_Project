import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RootkitGame from '../games/rootkit/RootkitGame.vue'

const clock = vi.hoisted(() => ({ time: 100_000, game: null }))
const scores = vi.hoisted(() => ({
  state: null,
  beginRun: vi.fn(),
  queueScore: vi.fn(),
  flushScore: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../games/rootkit/useRootkitEngine.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useRootkitEngine: () => {
      clock.game = original.useRootkitEngine({ now: () => clock.time })
      return clock.game
    },
  }
})
vi.mock('../games/useGameHighScores.js', async (importOriginal) => {
  const original = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...original,
    useGameHighScores: () => {
      scores.state = reactive({ gameId: 'rootkit', userId: 'selected-player', personalBest: null })
      return { ...scores, state: scores.state }
    },
  }
})
vi.mock('../games/rootkit/useRetroAudio.js', async () => {
  const { ref } = await import('vue')
  return {
    useRetroAudio: () => ({
      muted: ref(false),
      supported: ref(false),
      toggleMute: vi.fn(),
      play: vi.fn(),
    }),
  }
})

let wrapper
const originalScrollTo = HTMLElement.prototype.scrollTo
const button = (name) => wrapper.findAll('button').find((item) => item.text().includes(name))
async function mountGame({ returning = true } = {}) {
  if (returning) localStorage.setItem('learn-e-rootkit-tutorial-v1', 'done')
  wrapper = mount(RootkitGame, {
    attachTo: document.body,
    global: { stubs: { GameHighScores: true } },
  })
  await flushPromises()
}
function finish() {
  clock.game.execute('decrypt 3')
  clock.game.inspectPacket()
  clock.game.setFrequency(404)
  clock.game.execute('ssh barista@coffee.local -p 4040')
  clock.game.execute('BEAN-404')
  clock.game.execute('sudo brew --espresso')
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  clock.time = 100_000
  // jsdom has no element scrolling implementation; the tutorial still moves keyboard focus normally.
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  if (originalScrollTo) HTMLElement.prototype.scrollTo = originalScrollTo
  else delete HTMLElement.prototype.scrollTo
  vi.unstubAllGlobals()
})

describe('RootKit completed-run scores', () => {
  it('never starts a score run for isolated practice or recaptures it when reopening help', async () => {
    await mountGame({ returning: false })
    expect(scores.beginRun).not.toHaveBeenCalled()
    await button('Next').trigger('click')
    await button('Try ls').trigger('click')
    await button('Try cat briefing.txt').trigger('click')
    expect(wrapper.text()).toContain('Practice file opened')
    expect(scores.queueScore).not.toHaveBeenCalled()
    expect(scores.beginRun).not.toHaveBeenCalled()
    await button('Skip tutorial').trigger('click')
    await button('Boot RootKit OS').trigger('click')
    expect(scores.beginRun).toHaveBeenCalledOnce()
    expect(
      clock.game.state.value.log.some((entry) => entry.text.includes('Practice file opened')),
    ).toBe(false)
    clock.time += 1250
    await button('How to play').trigger('click')
    clock.time += 60_000
    await button('Return to game').trigger('click')
    expect(scores.beginRun).toHaveBeenCalledOnce()
    clock.time += 417
    finish()
    await flushPromises()
    expect(scores.queueScore).toHaveBeenCalledExactlyOnceWith(1667)
    expect(scores.flushScore).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="rootkit-finish-time"]').text()).toBe('Finished in 00:01.667')
    clock.time += 90_000
    clock.game.tick()
    expect(scores.queueScore).toHaveBeenCalledOnce()
    expect(clock.game.state.value.elapsedMs).toBe(1667)
    await button('Brew another').trigger('click')
    expect(scores.beginRun).toHaveBeenCalledTimes(2)
    expect(scores.queueScore).toHaveBeenCalledOnce()
    expect(clock.game.state.value.elapsedMs).toBe(0)
  })

  it('does not submit an unfinished long mission, including when leaving the game', async () => {
    await mountGame()
    await button('Boot RootKit OS').trigger('click')
    clock.time += 1_200_000
    clock.game.tick()
    await flushPromises()
    expect(clock.game.state.value).toMatchObject({ status: 'playing', elapsedMs: 1_200_000 })
    expect(scores.queueScore).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="rootkit-finish-time"]').exists()).toBe(false)
    expect(scores.beginRun).toHaveBeenCalledOnce()
    wrapper.unmount()
    wrapper = null
    expect(scores.queueScore).not.toHaveBeenCalled()
    expect(scores.flushScore).toHaveBeenCalledOnce()
  })

  it('submits a successful completion after twenty minutes with its precise elapsed score', async () => {
    await mountGame()
    await button('Boot RootKit OS').trigger('click')
    clock.time += 1_234_567
    clock.game.tick()
    expect(clock.game.state.value.status).toBe('playing')
    finish()
    await flushPromises()
    expect(scores.queueScore).toHaveBeenCalledExactlyOnceWith(1_234_567)
    expect(scores.flushScore).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="rootkit-finish-time"]').text()).toBe('Finished in 20:34.567')
  })

  it('allows a zero-millisecond successful run without treating it as a missing result', async () => {
    await mountGame()
    await button('Boot RootKit OS').trigger('click')
    finish()
    await flushPromises()
    expect(scores.queueScore).toHaveBeenCalledExactlyOnceWith(0)
    expect(scores.flushScore).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="rootkit-finish-time"]').text()).toBe('Finished in 00:00.000')
  })
})
