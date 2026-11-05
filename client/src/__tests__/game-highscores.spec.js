import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useGameHighScores, formatGameScore } from '../games/useGameHighScores.js'
import { getGameHighScores, saveGameScore } from '../games/gameScoreStore.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'

vi.mock('../games/gameScoreStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getGameHighScores: vi.fn(),
  saveGameScore: vi.fn(),
}))
let wrapper
let scores
// G16 Step 9: scores follow the logged-in user. Setting currentUser is what
// login, logout and refresh do, so it stands in for logging in as someone else.
const { currentUser } = useCurrentUser()
const logIn = (id) => {
  currentUser.value = id ? { id, username: id, displayName: `Player ${id}`, role: 'student' } : null
}
const entry = (userId, value) => ({
  userId,
  displayName: `Player ${userId}`,
  value,
  achievedAt: '2026-10-20T00:00:00.000Z',
})
const rules = (gameId) => ({
  gameId,
  metric: gameId === 'rootkit' ? 'timeMs' : 'score',
  order: gameId === 'rootkit' ? 'asc' : 'desc',
})
const readResult = (gameId, userId, personalBest = null) => ({
  data: {
    ...rules(gameId),
    personalBest,
  },
})
const writeResult = (gameId, userId, value) => ({
  data: { ...rules(gameId), personalBest: entry(userId, value), improved: true },
})
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function mountScores(gameId = '2048') {
  let result
  wrapper = mount(
    defineComponent({
      setup() {
        result = useGameHighScores(gameId)
        return () => null
      },
    }),
  )
  return result
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.resetAllMocks()
  localStorage.clear()
  logIn(null)
  scores = new Map()
  getGameHighScores.mockImplementation(async (gameId, userId) =>
    readResult(gameId, userId, scores.get(`${gameId}/${userId}`) || null),
  )
  saveGameScore.mockImplementation(async (gameId, value, userId) => {
    const result = writeResult(gameId, userId, value)
    scores.set(`${gameId}/${userId}`, result.data.personalBest)
    return result
  })
})

afterEach(async () => {
  wrapper?.unmount()
  wrapper = null
  await flushPromises()
  vi.useRealTimers()
  localStorage.clear()
  logIn(null)
})

describe('game score formatting', () => {
  it('formats points and exact millisecond mission times, including zero', () => {
    expect(formatGameScore('2048', 10000)).toBe(new Intl.NumberFormat().format(10000))
    expect(formatGameScore('rootkit', 0)).toBe('00:00.000')
    expect(formatGameScore('rootkit', 123456)).toBe('02:03.456')
    expect(formatGameScore('rootkit', 299999)).toBe('04:59.999')
    expect(formatGameScore('rootkit', 300000)).toBe('05:00.000')
    expect(formatGameScore('rootkit', 1234567)).toBe('20:34.567')
    expect(formatGameScore('rootkit', 36012345)).toBe('600:12.345')
    expect(formatGameScore('rootkit', Number.MAX_SAFE_INTEGER + 1)).toBe('—')
    expect(formatGameScore('2048', undefined)).toBe('—')
  })
})

describe('score loading and the logged-in user', () => {
  it('loads the personal best automatically without starting or uploading a run', async () => {
    logIn('alice')
    const result = mountScores()
    expect(result.state.userId).toBe('alice')
    expect(result.state.loading).toBe(true)
    await flushPromises()
    expect(result.state.personalBest).toBeNull()
    expect(result.state.loading).toBe(false)
    expect(saveGameScore).not.toHaveBeenCalled()
  })

  it('catches offline reads and supports an explicit refresh', async () => {
    getGameHighScores.mockRejectedValueOnce(new Error('Offline'))
    const result = mountScores()
    await flushPromises()
    expect(result.state.error).toContain('could not load')
    expect(result.state.loading).toBe(false)
    expect(await result.refresh()).toBe(true)
    expect(result.state.error).toBe('')
  })

  it('ignores responses for the previously logged-in user', async () => {
    const old = deferred()
    logIn('alice')
    getGameHighScores.mockImplementationOnce(() => old.promise)
    const result = mountScores()
    logIn('bob')
    scores.set('2048/bob', entry('bob', 32))
    await flushPromises()
    old.resolve(readResult('2048', 'alice', entry('alice', 64)))
    await flushPromises()
    expect(result.state.userId).toBe('bob')
    expect(result.state.personalBest.value).toBe(32)
  })

  it('drops a read that resolves after the user changed, and reads again for the new user', async () => {
    const old = deferred()
    logIn('alice')
    getGameHighScores.mockImplementationOnce(() => old.promise)
    const result = mountScores()
    logIn('bob')
    old.resolve(readResult('2048', 'alice', entry('alice', 64)))
    await flushPromises()
    expect(result.state.userId).toBe('bob')
    expect(result.state.personalBest).toBeNull()
    expect(getGameHighScores).toHaveBeenLastCalledWith('2048', 'bob')
  })

  it('keeps the latest read loading until it resolves, ignoring an older failure', async () => {
    const old = deferred()
    const latest = deferred()
    getGameHighScores
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => latest.promise)
    const result = mountScores()
    const refresh = result.refresh()
    old.reject(new Error('Old failure'))
    await flushPromises()
    expect(result.state.loading).toBe(true)
    expect(result.state.error).toBe('')
    latest.resolve(readResult('2048', null))
    await refresh
    expect(result.state.loading).toBe(false)
  })

  it('reads again when someone logs in or out, and not on focus or storage events', async () => {
    const result = mountScores()
    await flushPromises()
    getGameHighScores.mockClear()
    window.dispatchEvent(new StorageEvent('storage', { key: 'learn-e.prototypeUserId' }))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(getGameHighScores).not.toHaveBeenCalled()
    logIn('alice')
    await flushPromises()
    expect(result.state.userId).toBe('alice')
    expect(getGameHighScores).toHaveBeenCalledExactlyOnceWith('2048', 'alice')
    logIn(null)
    await flushPromises()
    expect(result.state.userId).toBeNull()
    expect(result.state.personalBest).toBeNull()
    expect(getGameHighScores).toHaveBeenCalledTimes(2)
  })
})

describe('captured run score writes', () => {
  it('debounces numeric improvements and uploads only the latest score', async () => {
    logIn('alice')
    const result = mountScores()
    await result.beginRun()
    expect(result.queueScore(8)).toBe(true)
    expect(result.queueScore(16)).toBe(true)
    expect(result.queueScore(12)).toBe(false)
    vi.advanceTimersByTime(499)
    expect(saveGameScore).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(saveGameScore).toHaveBeenCalledExactlyOnceWith('2048', 16, 'alice')
    expect(result.state.personalBest.value).toBe(16)
    expect(result.state.saveMessage).toBe('Personal best saved.')
  })

  it('never uploads guest play later when someone logs in', async () => {
    const result = mountScores()
    await result.beginRun()
    expect(result.queueScore(8)).toBe(false)
    logIn('alice')
    expect(result.queueScore(16)).toBe(false)
    await result.flushScore()
    expect(saveGameScore).not.toHaveBeenCalled()
    await result.beginRun()
    result.queueScore(16)
    await result.flushScore()
    expect(saveGameScore).toHaveBeenCalledExactlyOnceWith('2048', 16, 'alice')
  })

  it('cannot attribute an old run to a newly logged-in user', async () => {
    logIn('alice')
    const result = mountScores()
    await result.beginRun()
    result.queueScore(8)
    logIn('bob')
    result.queueScore(16)
    await result.flushScore()
    expect(saveGameScore).toHaveBeenCalledExactlyOnceWith('2048', 16, 'alice')
    expect(result.state.userId).toBe('bob')
    expect(result.state.personalBest).toBeNull()
    await result.beginRun()
    result.queueScore(32)
    await result.flushScore()
    expect(saveGameScore).toHaveBeenLastCalledWith('2048', 32, 'bob')
  })

  it('flushes the prior run while immediately capturing the next owner during an in-flight save', async () => {
    const old = deferred()
    logIn('alice')
    const result = mountScores()
    await result.beginRun()
    saveGameScore.mockImplementationOnce(() => old.promise)
    result.queueScore(8)
    const first = result.flushScore()
    logIn('bob')
    const restart = result.beginRun()
    result.queueScore(32)
    expect(saveGameScore).toHaveBeenCalledExactlyOnceWith('2048', 8, 'alice')
    old.resolve(writeResult('2048', 'alice', 8))
    await Promise.all([first, restart])
    expect(saveGameScore).toHaveBeenCalledTimes(2)
    expect(saveGameScore).toHaveBeenLastCalledWith('2048', 32, 'bob')
  })

  it('serializes improvements queued during a pending write', async () => {
    const old = deferred()
    logIn('alice')
    const result = mountScores()
    await result.beginRun()
    saveGameScore.mockImplementationOnce(() => old.promise)
    result.queueScore(8)
    const saving = result.flushScore()
    expect(result.state.saving).toBe(true)
    result.queueScore(16)
    result.queueScore(12)
    expect(saveGameScore).toHaveBeenCalledOnce()
    old.resolve(writeResult('2048', 'alice', 8))
    await saving
    expect(saveGameScore.mock.calls.map((call) => call[1])).toEqual([8, 16])
    expect(result.state.saving).toBe(false)
  })

  it('preserves the latest improvement after failure and retries only when requested', async () => {
    const failed = deferred()
    logIn('alice')
    const result = mountScores()
    await result.beginRun()
    saveGameScore.mockImplementationOnce(() => failed.promise)
    result.queueScore(8)
    const first = result.flushScore()
    result.queueScore(16)
    failed.reject(new Error('Offline'))
    expect(await first).toBe(false)
    expect(result.state.saveError).toContain('could not be saved')
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(saveGameScore).toHaveBeenCalledOnce()
    expect(await result.flushScore()).toBe(true)
    expect(saveGameScore).toHaveBeenLastCalledWith('2048', 16, 'alice')
    expect(result.state.saveError).toBe('')
  })

  it('keeps failed scores owned by their old run across identity changes and new runs', async () => {
    logIn('alice')
    const result = mountScores()
    await result.beginRun()
    saveGameScore.mockRejectedValueOnce(new Error('Offline'))
    result.queueScore(8)
    await result.flushScore()
    logIn('bob')
    await result.beginRun()
    result.queueScore(32)
    await result.flushScore()
    expect(saveGameScore.mock.calls.map(([, value, userId]) => [value, userId])).toEqual([
      [8, 'alice'],
      [8, 'alice'],
      [32, 'bob'],
    ])
    expect(result.state.userId).toBe('bob')
    expect(result.state.saveError).toBe('')
  })

  it('accepts long mission times and zero while keeping lower times better', async () => {
    logIn('alice')
    const result = mountScores('rootkit')
    await result.beginRun()
    expect(result.queueScore(1200000)).toBe(true)
    expect(result.queueScore(900000)).toBe(true)
    expect(result.queueScore(1000000)).toBe(false)
    expect(result.queueScore(0)).toBe(true)
    expect(result.queueScore(300000)).toBe(false)
    await result.flushScore()
    expect(saveGameScore).toHaveBeenCalledExactlyOnceWith('rootkit', 0, 'alice')
  })

  it('does not upload a browser best or a current run below a known server best', async () => {
    logIn('alice')
    localStorage.setItem('learn-e-2048-best', '100000')
    scores.set('2048/alice', entry('alice', 64))
    const result = mountScores()
    await flushPromises()
    await result.beginRun()
    expect(result.queueScore(32)).toBe(false)
    await result.flushScore()
    expect(saveGameScore).not.toHaveBeenCalled()
    expect(result.queueScore(128)).toBe(true)
    await result.flushScore()
    expect(saveGameScore).toHaveBeenCalledExactlyOnceWith('2048', 128, 'alice')
  })

  it.each(['8', NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, undefined, {}, true])(
    'rejects invalid score %j',
    async (value) => {
      logIn('alice')
      const result = mountScores()
      await result.beginRun()
      expect(result.queueScore(value)).toBe(false)
      await result.flushScore()
      expect(saveGameScore).not.toHaveBeenCalled()
    },
  )

  it('does not save before a run is explicitly started', async () => {
    logIn('alice')
    const result = mountScores()
    expect(result.queueScore(64)).toBe(false)
    logIn(null)
    await result.flushScore()
    expect(saveGameScore).not.toHaveBeenCalled()
  })
})

describe('high-score cleanup', () => {
  it('flushes pending scores on unmount and stops timers and reads, even after a login', async () => {
    logIn('alice')
    const result = mountScores()
    await result.beginRun()
    const timerBaseline = vi.getTimerCount()
    result.queueScore(64)
    expect(vi.getTimerCount()).toBe(timerBaseline + 1)
    getGameHighScores.mockClear()
    wrapper.unmount()
    wrapper = null
    await flushPromises()
    expect(saveGameScore).toHaveBeenCalledExactlyOnceWith('2048', 64, 'alice')
    expect(vi.getTimerCount()).toBe(timerBaseline)
    logIn('bob')
    await flushPromises()
    expect(getGameHighScores).not.toHaveBeenCalled()
  })

  it('does not publish a delayed read to an unmounted component', async () => {
    const read = deferred()
    getGameHighScores.mockImplementationOnce(() => read.promise)
    const result = mountScores()
    wrapper.unmount()
    wrapper = null
    read.resolve(readResult('2048', null, entry('alice', 64)))
    await flushPromises()
    expect(result.state.personalBest).toBeNull()
  })
})
