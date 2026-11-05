// Personal bests live in this browser's localStorage, one record per user per game.
// Only the player's own best is read back: the shared leaderboard was removed
// (decision H-16), since a board of everyone who used one browser meant little.
import { useCurrentUser } from '../composables/useCurrentUser.js'

const { currentUser } = useCurrentUser()

const STORAGE_KEY = 'learn-e.gameScores'

export const GAME_RULES = Object.freeze({
  2048: { metric: 'score', order: 'desc' },
  tetris: { metric: 'score', order: 'desc' },
  rootkit: { metric: 'timeMs', order: 'asc' },
})

function rulesFor(gameId) {
  if (!Object.hasOwn(GAME_RULES, gameId))
    throw new Error('High scores are unavailable for this game.')
  return GAME_RULES[gameId]
}

export function validValue(_gameId, value) {
  return Number.isSafeInteger(value) && value >= 0
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// A blocked storage throws here and the caller reports it. Unreadable or hand-edited
// JSON counts as no records, so one bad value cannot lock the scores panel.
function readRecords() {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function recordsFor(all, gameId) {
  return isPlainObject(all[gameId]) ? all[gameId] : {}
}

function entry(userId, record) {
  return { userId, value: record.value, achievedAt: record.achievedAt }
}

export async function getGameHighScores(gameId, userId) {
  const rules = rulesFor(gameId)
  const records = recordsFor(readRecords(), gameId)
  const known = Boolean(userId) && currentUser.value?.id === userId
  const own = known ? records[userId] : null
  return {
    data: {
      gameId,
      ...rules,
      personalBest: own && validValue(gameId, own.value) ? entry(userId, own) : null,
    },
  }
}

export async function saveGameScore(gameId, value, userId) {
  // Writes must use the run's captured owner, never whichever user is selected later.
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new TypeError('A captured player is required to save a score.')
  }
  const rules = rulesFor(gameId)
  if (!validValue(gameId, value)) throw new Error('That score cannot be saved.')
  const owner = userId.trim()
  const all = readRecords()
  const records = recordsFor(all, gameId)
  const previous = validValue(gameId, records[owner]?.value) ? records[owner] : null
  const improved =
    !previous || (rules.order === 'asc' ? value < previous.value : value > previous.value)
  const best = improved ? { value, achievedAt: new Date().toISOString() } : previous
  if (improved) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...all, [gameId]: { ...records, [owner]: best } }),
    )
  }
  return { data: { gameId, ...rules, improved, personalBest: entry(owner, best) } }
}
