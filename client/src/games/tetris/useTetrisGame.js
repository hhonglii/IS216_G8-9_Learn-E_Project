import { computed, ref } from 'vue'

export const WIDTH = 10
export const HEIGHT = 20
export const LOCK_DELAY = 500
export const MAX_LOCK_RESETS = 15
export const MAX_TICK_DELTA = 250
export const POINTS_PER_LEVEL = 500
const BEST_KEY = 'learn-e-tetris-best'
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
const LINE_POINTS = [0, 100, 300, 500, 800]
const BASE = {
  I: {
    size: 4,
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  },
  O: {
    size: 2,
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  },
  T: {
    size: 3,
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  S: {
    size: 3,
    cells: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
  },
  Z: {
    size: 3,
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  },
  J: {
    size: 3,
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  L: {
    size: 3,
    cells: [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
}

export const SHAPES = Object.freeze(
  Object.fromEntries(
    TYPES.map((type) => {
      const rotations = []
      let cells = BASE[type].cells
      for (let index = 0; index < 4; index += 1) {
        rotations.push(Object.freeze(cells.map((cell) => Object.freeze([...cell]))))
        cells = cells.map(([x, y]) => [BASE[type].size - 1 - y, x])
      }
      return [type, Object.freeze(rotations)]
    }),
  ),
)

// Deliberately simplified wall/floor kicks, not the official SRS tables.
// Horizontal alternatives precede upward nudges; each final placement is collision checked.
const KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
  [0, -2],
]
const emptyBoard = () => Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null))

export function gravityForLevel(level) {
  const normalized = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1
  return Math.max(100, 800 - (normalized - 1) * 65)
}

export function cellsFor(piece) {
  if (!piece || !SHAPES[piece.type]) return []
  const rotation = ((piece.rotation % 4) + 4) % 4
  return SHAPES[piece.type][rotation].map(([x, y]) => ({ x: x + piece.x, y: y + piece.y }))
}

export function collides(board, piece) {
  const cells = cellsFor(piece)
  // Kicks may briefly put a cell above the visible ceiling; lock() handles
  // top-out before any such cell can be written into the board.
  return (
    cells.length !== 4 ||
    cells.some(({ x, y }) => x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && board[y][x] !== null))
  )
}

export function clearFullRows(board) {
  const remaining = board.filter((row) => row.some((cell) => cell === null))
  const cleared = HEIGHT - remaining.length
  return {
    board: [
      ...Array.from({ length: cleared }, () => Array(WIDTH).fill(null)),
      ...remaining.map((row) => [...row]),
    ],
    cleared,
  }
}

export function createSevenBag(random = Math.random) {
  const bag = [...TYPES]
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const sampled = random()
    const target = Number.isFinite(sampled)
      ? Math.min(index, Math.max(0, Math.floor(sampled * (index + 1))))
      : 0
    ;[bag[index], bag[target]] = [bag[target], bag[index]]
  }
  return bag
}

function readStorage(storage) {
  try {
    return storage === undefined ? globalThis.localStorage : storage
  } catch {
    return null
  }
}

function readBest(storage) {
  try {
    const value = Number(storage?.getItem(BEST_KEY))
    return Number.isFinite(value)
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)))
      : 0
  } catch {
    return 0
  }
}

function initialState(best) {
  return {
    status: 'ready',
    board: emptyBoard(),
    active: null,
    queue: [],
    held: null,
    canHold: true,
    score: 0,
    best,
    lines: 0,
    level: 1,
    pieces: 0,
    lastClear: 0,
    eventId: 0,
    lastEvent: '',
    fallElapsed: 0,
    lockElapsed: 0,
    lockResets: 0,
  }
}

export function useTetrisGame({ random = Math.random, storage } = {}) {
  const savedStorage = readStorage(storage)
  const state = ref(initialState(readBest(savedStorage)))
  let bag = []

  function fillQueue() {
    // Hold may consume a preview, but never starts a fresh bag early.
    while (state.value.queue.length < 3) {
      if (!bag.length) bag = createSevenBag(random)
      state.value.queue.push(bag.shift())
    }
  }
  fillQueue()

  const ghost = computed(() => {
    if (!state.value.active || !['playing', 'paused'].includes(state.value.status)) return null
    const piece = { ...state.value.active } // Projection must not move the live piece.
    if (collides(state.value.board, piece)) return null
    while (!collides(state.value.board, { ...piece, y: piece.y + 1 })) piece.y += 1
    return piece
  })

  function emit(event) {
    state.value.eventId += 1
    state.value.lastEvent = event
  }

  function addScore(amount) {
    state.value.score = Math.min(Number.MAX_SAFE_INTEGER, state.value.score + amount)
    state.value.level = 1 + Math.floor(state.value.score / POINTS_PER_LEVEL)
    if (state.value.score <= state.value.best) return
    state.value.best = state.value.score
    try {
      savedStorage?.setItem(BEST_KEY, String(state.value.best))
    } catch {
      // Blocked or full storage must never interrupt a game.
    }
  }

  function resetClocks() {
    state.value.fallElapsed = 0
    state.value.lockElapsed = 0
    state.value.lockResets = 0
  }

  function spawn(type) {
    const piece = { type, rotation: 0, x: Math.floor((WIDTH - BASE[type].size) / 2), y: 0 }
    resetClocks()
    if (collides(state.value.board, piece)) {
      state.value.active = null
      state.value.status = 'over'
      return false
    }
    state.value.active = piece
    return true
  }

  function spawnNext() {
    const type = state.value.queue.shift()
    fillQueue()
    return spawn(type)
  }

  function grounded() {
    return collides(state.value.board, { ...state.value.active, y: state.value.active.y + 1 })
  }

  function resetGroundedLock(wasGrounded) {
    // The quota belongs to the whole piece, including brief trips off a ledge.
    if (!wasGrounded || state.value.lockResets >= MAX_LOCK_RESETS) return
    state.value.lockElapsed = 0
    state.value.lockResets += 1
  }

  function lock(scoringLevel = state.value.level) {
    const piece = state.value.active
    const cells = cellsFor(piece)
    if (collides(state.value.board, piece) || cells.some(({ y }) => y < 0)) {
      state.value.active = null
      state.value.status = 'over'
      emit('over')
      return
    }
    const board = state.value.board.map((row) => [...row])
    for (const { x, y } of cells) board[y][x] = piece.type
    const result = clearFullRows(board)
    state.value.board = result.board
    state.value.pieces += 1
    state.value.lastClear = result.cleared
    addScore(LINE_POINTS[result.cleared] * scoringLevel)
    state.value.lines += result.cleared
    state.value.canHold = true
    spawnNext()
    emit(state.value.status === 'over' ? 'over' : result.cleared ? 'clear' : 'lock')
  }

  function start() {
    if (state.value.status !== 'ready') return false
    state.value.status = 'playing'
    spawnNext()
    if (state.value.status === 'over') emit('over')
    return true
  }

  function restart() {
    const best = state.value.best
    const eventId = state.value.eventId
    bag = []
    state.value = initialState(best)
    state.value.eventId = eventId
    fillQueue()
    return start()
  }

  function move(dx) {
    if (state.value.status !== 'playing' || ![-1, 1].includes(dx)) return false
    const candidate = { ...state.value.active, x: state.value.active.x + dx }
    if (collides(state.value.board, candidate)) return false
    const wasGrounded = grounded()
    state.value.active = candidate
    resetGroundedLock(wasGrounded)
    emit('move')
    return true
  }

  function rotate(direction = 1) {
    if (state.value.status !== 'playing' || ![-1, 1].includes(direction)) return false
    const piece = state.value.active
    const rotation = (piece.rotation + direction + 4) % 4
    for (const [dx, dy] of KICKS) {
      const candidate = { ...piece, rotation, x: piece.x + dx, y: piece.y + dy }
      if (collides(state.value.board, candidate)) continue
      const wasGrounded = grounded()
      state.value.active = candidate
      resetGroundedLock(wasGrounded)
      emit('rotate')
      return true
    }
    return false
  }

  function softDrop() {
    if (state.value.status !== 'playing') return false
    const candidate = { ...state.value.active, y: state.value.active.y + 1 }
    if (collides(state.value.board, candidate)) return false
    state.value.active = candidate
    state.value.fallElapsed = 0
    addScore(1)
    emit('drop')
    return true
  }

  function hardDrop() {
    if (state.value.status !== 'playing') return false
    const landing = ghost.value
    if (!landing) return false
    // All points from one hard-drop input use its starting level for the line
    // bonus. Distance points cannot increase their own clear multiplier.
    const scoringLevel = state.value.level
    addScore((landing.y - state.value.active.y) * 2)
    state.value.active = { ...landing }
    lock(scoringLevel)
    return true
  }

  function hold() {
    if (state.value.status !== 'playing' || !state.value.canHold) return false
    const previous = state.value.held
    state.value.held = state.value.active.type
    if (previous) spawn(previous)
    else spawnNext()
    state.value.canHold = false
    emit(state.value.status === 'over' ? 'over' : 'hold')
    return true
  }

  function tick(deltaMs) {
    if (state.value.status !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return false
    // A delayed frame may advance at most 250ms. The UI pauses on visibility loss;
    // the engine never fast-forwards an entire offline interval on resume.
    let remaining = Math.min(MAX_TICK_DELTA, deltaMs)
    let changed = false
    while (remaining > 0 && state.value.status === 'playing') {
      if (grounded()) {
        state.value.fallElapsed = 0
        const consumed = Math.min(remaining, LOCK_DELAY - state.value.lockElapsed)
        state.value.lockElapsed += consumed
        remaining -= consumed
        if (state.value.lockElapsed >= LOCK_DELAY) {
          lock()
          return true
        }
      } else {
        const gravity = gravityForLevel(state.value.level)
        // A new score tier can make the old interval overdue. Consume no
        // negative time and resolve that fall once, rather than replaying a backlog.
        const consumed = Math.min(remaining, Math.max(0, gravity - state.value.fallElapsed))
        state.value.fallElapsed += consumed
        remaining -= consumed
        if (state.value.fallElapsed >= gravity) {
          state.value.active = { ...state.value.active, y: state.value.active.y + 1 }
          state.value.fallElapsed = 0
          changed = true
        }
      }
    }
    return changed
  }

  function pause() {
    if (state.value.status !== 'playing') return false
    state.value.status = 'paused'
    return true
  }

  function resume() {
    if (state.value.status !== 'paused') return false
    state.value.status = 'playing'
    return true
  }

  return {
    state,
    ghost,
    start,
    restart,
    move,
    rotate,
    softDrop,
    hardDrop,
    hold,
    tick,
    pause,
    resume,
  }
}
