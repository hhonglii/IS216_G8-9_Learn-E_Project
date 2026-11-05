import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TetrisGame from '../games/tetris/TetrisGame.vue'

const captured = vi.hoisted(() => ({ game: null }))
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
      scores.state = reactive({ gameId: 'tetris', userId: null, personalBest: null })
      return { ...scores, state: scores.state }
    },
  }
})
vi.mock('../games/tetris/useTetrisGame.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useTetrisGame(options) {
      captured.game = original.useTetrisGame({ ...options, random: () => 0, storage: null })
      return captured.game
    },
  }
})

let wrapper
let frames
let nextFrame
let outside
const button = (name) =>
  wrapper
    .findAll('button')
    .find((item) => item.attributes('aria-label') === name || item.text().startsWith(name))
const board = () => wrapper.get('[aria-label="Tetris game board"]')

async function frame(timestamp) {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(timestamp))
  await flushPromises()
}

async function start() {
  wrapper = mount(TetrisGame, {
    attachTo: document.body,
    global: { stubs: { GameHighScores: true } },
  })
  await button('Start game').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id))
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('AudioContext', undefined)
  vi.stubGlobal('webkitAudioContext', undefined)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  outside = document.createElement('button')
  outside.textContent = 'Outside the game'
  document.body.append(outside)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  outside.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Tetris interface lifecycle', () => {
  it('starts score ownership only on a fresh run and keeps server best separate from browser best', async () => {
    wrapper = mount(TetrisGame, {
      attachTo: document.body,
      global: { stubs: { GameHighScores: true } },
    })
    captured.game.state.value.best = 6000
    await flushPromises()
    expect(scores.beginRun).not.toHaveBeenCalled()
    expect(scores.queueScore).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="tetris-best"]').text()).toBe('6,000')
    expect(wrapper.text()).toContain('Browser best')
    scores.state.userId = 'selected-player'
    await flushPromises()
    expect(wrapper.get('[data-testid="tetris-best"]').text()).toBe('—')
    scores.state.personalBest = { value: 1200 }
    await flushPromises()
    expect(wrapper.get('[data-testid="tetris-best"]').text()).toBe('1,200')
    expect(wrapper.text()).toContain('Your best')

    await button('Start game').trigger('click')
    await flushPromises()
    expect(scores.beginRun).toHaveBeenCalledOnce()
    await button('Hard drop').trigger('click')
    expect(scores.queueScore).toHaveBeenCalledExactlyOnceWith(captured.game.state.value.score)
    expect(captured.game.state.value.score).toBeGreaterThan(0)
    await button('Pause game').trigger('click')
    await button('Resume game').trigger('click')
    expect(scores.beginRun).toHaveBeenCalledOnce()
    await button('New game').trigger('click')
    await button('Restart game').trigger('click')
    expect(scores.beginRun).toHaveBeenCalledTimes(2)
    expect(scores.flushScore).not.toHaveBeenCalled()
    expect(scores.queueScore).toHaveBeenCalledOnce()
  })

  it('flushes game-over scores and pending work on unmount', async () => {
    await start()
    captured.game.hardDrop()
    captured.game.state.value.status = 'over'
    await flushPromises()
    expect(scores.queueScore).toHaveBeenCalledExactlyOnceWith(captured.game.state.value.score)
    expect(scores.flushScore).toHaveBeenCalledOnce()
    wrapper.unmount()
    wrapper = null
    expect(scores.flushScore).toHaveBeenCalledTimes(2)
  })

  it('stops held-key repeats on pause and does not replay them after resuming', async () => {
    await start()
    await board().trigger('keydown', { key: 'ArrowLeft' })
    await frame(0)
    await frame(50)
    await frame(100)
    await frame(150)
    const position = captured.game.state.value.active.x
    await board().trigger('keydown', { key: 'p' })
    await flushPromises()
    expect(captured.game.state.value.status).toBe('paused')
    expect(document.activeElement).toBe(button('Resume game').element)
    await frame(200)
    await button('Resume game').trigger('click')
    await flushPromises()
    await frame(250)
    await frame(300)
    await frame(350)
    await frame(400)
    expect(captured.game.state.value.active.x).toBe(position)
    expect(document.activeElement).toBe(board().element)
  })

  it('traps restart focus and preserves whether cancel should resume or remain paused', async () => {
    await start()
    captured.game.hardDrop()
    const boardBefore = JSON.stringify(captured.game.state.value.board)
    await button('New game').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alertdialog"]').attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(button('Keep playing').element)
    await button('Keep playing').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(button('Restart game').element)
    await button('Restart game').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(button('Keep playing').element)
    await button('Keep playing').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(captured.game.state.value.status).toBe('playing')
    expect(JSON.stringify(captured.game.state.value.board)).toBe(boardBefore)

    await button('Pause game').trigger('click')
    await button('New game').trigger('click')
    await button('Keep playing').trigger('click')
    expect(captured.game.state.value.status).toBe('paused')
  })

  it('auto-pauses on external focus and window blur without stealing focus back', async () => {
    await start()
    outside.focus()
    await frame(0)
    expect(captured.game.state.value.status).toBe('paused')
    expect(document.activeElement).toBe(outside)
    await button('Resume game').trigger('click')
    await flushPromises()
    expect(captured.game.state.value.status).toBe('playing')
    window.dispatchEvent(new Event('blur'))
    expect(captured.game.state.value.status).toBe('paused')
  })

  it('announces consecutive clears, preserves board focus, and clears the old run announcement on restart', async () => {
    await start()
    const focusedBoard = board().element
    for (let index = 0; index < 2; index += 1) {
      captured.game.state.value.board = Array.from({ length: 20 }, () => Array(10).fill(null))
      captured.game.state.value.board[19].fill('Z')
      captured.game.state.value.board[19][4] = null
      captured.game.state.value.active = { type: 'I', rotation: 1, x: 2, y: 16 }
      await button('Hard drop').trigger('click')
    }
    expect(wrapper.get('.tetris-live').text()).toBe('1 line cleared. Score 200. Level 1.')
    expect(board().element).toBe(focusedBoard)
    expect(document.activeElement).toBe(focusedBoard)
    expect(wrapper.get('.board-clear-flash').attributes('aria-hidden')).toBe('true')
    await button('New game').trigger('click')
    await button('Restart game').trigger('click')
    await flushPromises()
    expect(wrapper.get('.tetris-live').text()).toBe('')
    expect(captured.game.state.value.score).toBe(0)
    expect(document.activeElement).toBe(board().element)
  })

  it('cancels animation frames and focus listeners when leaving the game', async () => {
    await start()
    await board().trigger('keydown', { key: 'ArrowLeft' })
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    expect(frames.size).toBeGreaterThan(0)
    wrapper.unmount()
    wrapper = null
    expect(frames.size).toBe(0)
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeWindow).toHaveBeenCalledWith('blur', expect.any(Function))
    const before = JSON.stringify(captured.game.state.value)
    window.dispatchEvent(new Event('blur'))
    await frame(1000)
    expect(JSON.stringify(captured.game.state.value)).toBe(before)
  })
})
