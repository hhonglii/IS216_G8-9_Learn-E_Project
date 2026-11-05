import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGameHighScores, saveGameScore } from '../games/gameScoreStore.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'

const KEY = 'learn-e.gameScores'
const { currentUser } = useCurrentUser()
// Sets who is logged in, as useCurrentUser does after login or refresh (G16).
const logIn = (id, displayName) => {
  currentUser.value = id ? { id, username: id, displayName, role: 'student' } : null
}
const stored = () => JSON.parse(window.localStorage.getItem(KEY))
const seed = (records) => window.localStorage.setItem(KEY, JSON.stringify(records))

beforeEach(() => {
  window.localStorage.clear()
  logIn('alice', 'Alice')
})

afterEach(() => {
  vi.restoreAllMocks()
  logIn(null)
})

describe('game score store', () => {
  it("returns only the player's own best, with no board of other players (H-16)", async () => {
    const { data } = await getGameHighScores('2048', 'alice')
    expect(data).toEqual({ gameId: '2048', metric: 'score', order: 'desc', personalBest: null })
  })

  it('has no personal best for anyone but the logged-in user', async () => {
    await saveGameScore('2048', 512, 'alice')
    expect((await getGameHighScores('2048', 'bob')).data.personalBest).toBeNull()
    logIn(null)
    expect((await getGameHighScores('2048', 'alice')).data.personalBest).toBeNull()
  })

  it('saves a first score and keeps only improvements', async () => {
    expect((await saveGameScore('2048', 512, 'alice')).data.improved).toBe(true)
    expect((await saveGameScore('2048', 256, 'alice')).data).toMatchObject({
      improved: false,
      personalBest: { userId: 'alice', value: 512 },
    })
    expect(stored()['2048'].alice.value).toBe(512)
    expect((await saveGameScore('2048', 1024, 'alice')).data.improved).toBe(true)
    expect(stored()['2048'].alice.value).toBe(1024)
  })

  it('keeps long RootKit times and treats a faster finish as better', async () => {
    await saveGameScore('rootkit', 900001, 'alice')
    expect((await saveGameScore('rootkit', 1200000, 'alice')).data.improved).toBe(false)
    expect((await saveGameScore('rootkit', 600001, 'alice')).data.improved).toBe(true)
    logIn('bob', 'Bob')
    await saveGameScore('rootkit', 420000, 'bob')
    logIn('alice', 'Alice')
    const { data } = await getGameHighScores('rootkit', 'alice')
    expect(data.personalBest.value).toBe(600001)
    expect(stored().rootkit.alice.value).toBe(600001)
  })

  it('stores no names, since nobody else sees the scores', async () => {
    await saveGameScore('tetris', 600, 'alice')
    expect(stored().tetris.alice).toEqual({ value: 600, achievedAt: expect.any(String) })
  })

  it('still reads a best saved with a name before H-16', async () => {
    seed({ 2048: { alice: { value: 512, achievedAt: 'x', displayName: 'Alice' } } })
    const { data } = await getGameHighScores('2048', 'alice')
    expect(data.personalBest).toEqual({ userId: 'alice', value: 512, achievedAt: 'x' })
  })

  it('ignores unreadable or hand-edited records', async () => {
    window.localStorage.setItem(KEY, '{not json')
    expect((await getGameHighScores('2048', 'alice')).data.personalBest).toBeNull()
    seed({ 2048: { alice: { value: -5 } } })
    expect((await getGameHighScores('2048', 'alice')).data.personalBest).toBeNull()
    expect((await saveGameScore('2048', 8, 'alice')).data.improved).toBe(true)
  })

  it('rejects invalid input without writing anything', async () => {
    await expect(saveGameScore('2048', 8, '')).rejects.toThrow(TypeError)
    await expect(saveGameScore('2048', -1, 'alice')).rejects.toThrow('That score cannot be saved.')
    await expect(saveGameScore('rootkit', Number.MAX_SAFE_INTEGER + 1, 'alice')).rejects.toThrow(
      'That score cannot be saved.',
    )
    await expect(saveGameScore('chess', 8, 'alice')).rejects.toThrow('unavailable for this game')
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('rejects when storage is blocked, so the game can report it', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable', 'SecurityError')
    })
    await expect(getGameHighScores('2048', 'alice')).rejects.toThrow('Storage is unavailable')
    await expect(saveGameScore('2048', 8, 'alice')).rejects.toThrow('Storage is unavailable')
  })
})
