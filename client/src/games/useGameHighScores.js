import { onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { GAME_RULES, getGameHighScores, saveGameScore, validValue } from './gameScoreStore.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'

const { currentUserId } = useCurrentUser()

export function formatGameScore(gameId, value) {
  if (!validValue(gameId, value)) return '—'
  if (gameId !== 'rootkit') return new Intl.NumberFormat().format(value)
  const minutes = String(Math.floor(value / 60000)).padStart(2, '0')
  const seconds = String(Math.floor((value % 60000) / 1000)).padStart(2, '0')
  return `${minutes}:${seconds}.${String(value % 1000).padStart(3, '0')}`
}

const failureMessage = (error, fallback) => error?.response?.data?.error?.message || fallback

export function useGameHighScores(gameId) {
  const rules = GAME_RULES[gameId]
  const state = reactive({
    gameId,
    userId: currentUserId.value,
    personalBest: null,
    loading: false,
    error: '',
    saving: false,
    saveError: '',
    saveMessage: '',
  })
  const pending = new Map()
  const confirmed = new Map()
  const failedOwners = new Set()
  const saveErrors = new Map()
  const saveMessages = new Map()
  let runOwner = null
  let runStarted = false
  let runBest = null
  let activeJob = null
  let pump = null
  let saveTimer = null
  let readVersion = 0
  let disposed = false

  const better = (value, previous) =>
    previous == null || (rules?.order === 'asc' ? value < previous : value > previous)

  function remember(userId, value) {
    if (validValue(gameId, value) && better(value, confirmed.get(userId)))
      confirmed.set(userId, value)
  }

  function publishSaveState() {
    if (disposed) return
    state.saving = Boolean(activeJob && activeJob.userId === state.userId)
    state.saveError = saveErrors.get(state.userId) || ''
    state.saveMessage = saveMessages.get(state.userId) || ''
  }

  function syncIdentity() {
    const userId = currentUserId.value
    if (state.userId === userId) return false
    state.userId = userId
    state.personalBest = null
    state.error = ''
    publishSaveState()
    return true
  }

  async function refresh() {
    if (disposed) return false
    syncIdentity()
    if (!rules) {
      state.error = 'High scores are unavailable for this game.'
      return false
    }
    const userId = state.userId
    const version = ++readVersion
    state.loading = true
    state.error = ''
    try {
      const response = await getGameHighScores(gameId, userId)
      if (disposed || version !== readVersion) return false
      if (currentUserId.value !== userId) {
        // The logged-in user changed during this load; never publish an old identity's result.
        void refresh()
        return false
      }
      const result = response?.data
      if (
        result?.gameId !== gameId ||
        result.metric !== rules.metric ||
        result.order !== rules.order
      ) {
        throw new Error('Unexpected high-score response.')
      }
      state.personalBest = result.personalBest ?? null
      if (state.personalBest) remember(userId, state.personalBest.value)
      return true
    } catch (error) {
      if (!disposed && version === readVersion) {
        state.error = failureMessage(error, 'High scores could not load. Try again.')
      }
      return false
    } finally {
      if (!disposed && version === readVersion) state.loading = false
    }
  }

  function clearSaveTimer() {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = null
  }

  function putPending(job) {
    const previous = pending.get(job.userId)
    if (!previous || better(job.value, previous.value)) pending.set(job.userId, job)
  }

  function startDrain(retryFailures) {
    if (pump) return pump
    const attemptedFailures = new Set()
    const work = async () => {
      let allSaved = true
      while (pending.size) {
        const job = [...pending.values()].find(
          (candidate) =>
            !attemptedFailures.has(candidate.userId) &&
            (retryFailures || !failedOwners.has(candidate.userId)),
        )
        if (!job) break
        pending.delete(job.userId)
        activeJob = job
        publishSaveState()
        try {
          const response = await saveGameScore(gameId, job.value, job.userId)
          const result = response?.data
          if (result?.gameId !== gameId || !validValue(gameId, result.personalBest?.value)) {
            throw new Error('Unexpected saved-score response.')
          }
          remember(job.userId, result.personalBest.value)
          failedOwners.delete(job.userId)
          saveErrors.delete(job.userId)
          saveMessages.set(
            job.userId,
            result.improved ? 'Personal best saved.' : 'Score saved. Your best is unchanged.',
          )
          if (!disposed) {
            syncIdentity()
            if (state.userId === job.userId) {
              state.personalBest = result.personalBest
            }
            void refresh()
          }
        } catch (error) {
          allSaved = false
          // Preserve the best pending value and owner; one failure cannot spin an automatic retry loop.
          putPending(job)
          attemptedFailures.add(job.userId)
          failedOwners.add(job.userId)
          saveMessages.delete(job.userId)
          saveErrors.set(
            job.userId,
            failureMessage(error, 'Your score could not be saved in this browser. Try again.'),
          )
        } finally {
          activeJob = null
          publishSaveState()
        }
      }
      return allSaved
    }
    pump = work().finally(() => {
      pump = null
    })
    return pump
  }

  function flushScore() {
    clearSaveTimer()
    if (disposed) return Promise.resolve(false)
    // Finish an in-flight write before flushing any later improvements or retrying failed jobs.
    return pump ? pump.then(() => startDrain(true)) : startDrain(true)
  }

  function beginRun() {
    if (disposed) return Promise.resolve(false)
    const previous = flushScore()
    // Capture synchronously: waiting for the previous network write could attach this run to a new user.
    runOwner = currentUserId.value
    runStarted = true
    runBest = null
    if (syncIdentity()) void refresh()
    return previous
  }

  function queueScore(value) {
    if (
      disposed ||
      !rules ||
      !runStarted ||
      !runOwner ||
      !validValue(gameId, value) ||
      !better(value, runBest)
    )
      return false
    runBest = value
    const alternatives = [
      confirmed.get(runOwner),
      pending.get(runOwner)?.value,
      activeJob?.userId === runOwner ? activeJob.value : null,
    ]
    if (alternatives.some((previous) => previous != null && !better(value, previous))) return false
    putPending({ userId: runOwner, value })
    saveMessages.delete(runOwner)
    publishSaveState()
    clearSaveTimer()
    saveTimer = setTimeout(() => {
      saveTimer = null
      void startDrain(false)
    }, 500)
    return true
  }

  watch(currentUserId, () => void refresh())

  onMounted(() => {
    void refresh()
  })
  onBeforeUnmount(() => {
    // Route changes get a best-effort final write; no callbacks may mutate an unmounted scoreboard.
    void flushScore()
    disposed = true
    readVersion += 1
    clearSaveTimer()
  })

  return { state, refresh, beginRun, queueScore, flushScore }
}
