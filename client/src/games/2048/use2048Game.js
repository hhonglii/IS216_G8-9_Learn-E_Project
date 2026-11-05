import { ref } from 'vue'

export const SIZE = 4
export const DIRECTIONS = Object.freeze(['up', 'left', 'down', 'right'])
const BEST_KEY = 'learn-e-2048-best'
const tileAt = (tiles, row, col) => tiles.find((tile) => tile.row === row && tile.col === col)

/** Pure standard-2048 move: each tile may participate in at most one merge. */
export function slideTiles(tiles, direction) {
  const result = tiles.map((tile) => ({ ...tile, merged: false }))
  if (!DIRECTIONS.includes(direction)) return { tiles: result, changed: false, gain: 0 }
  const horizontal = direction === 'left' || direction === 'right'
  const reverse = direction === 'right' || direction === 'down'
  let changed = false
  let gain = 0

  for (let lane = 0; lane < SIZE; lane += 1) {
    // Read from the destination edge so the same packing rule handles all four directions.
    const cells = Array.from({ length: SIZE }, (_, index) => {
      const position = reverse ? SIZE - 1 - index : index
      return horizontal ? { row: lane, col: position } : { row: position, col: lane }
    })
    const occupied = cells.map(({ row, col }) => tileAt(result, row, col)).filter(Boolean)
    const packed = []
    for (const tile of occupied) {
      const previous = packed.at(-1)
      if (previous && !previous.merged && previous.value === tile.value) {
        // Lock the survivor for this move: [2, 2, 4] becomes [4, 4], never [8].
        previous.value *= 2
        previous.merged = true
        gain += previous.value
        result.splice(result.indexOf(tile), 1)
        changed = true
      } else packed.push(tile)
    }
    packed.forEach((tile, index) => {
      const { row, col } = cells[index]
      if (tile.row !== row || tile.col !== col) changed = true
      tile.row = row
      tile.col = col
    })
  }
  return { tiles: result, changed, gain }
}

/** Empty cells or an orthogonally adjacent equal pair make another move possible. */
export function hasMoves(tiles) {
  if (tiles.length < SIZE ** 2) return true
  return tiles.some(
    (tile) =>
      tileAt(tiles, tile.row, tile.col + 1)?.value === tile.value ||
      tileAt(tiles, tile.row + 1, tile.col)?.value === tile.value,
  )
}

function availableStorage(storage) {
  try {
    return storage === undefined ? globalThis.localStorage : storage
  } catch {
    return null
  }
}

function readBest(storage) {
  try {
    const best = Number(storage?.getItem(BEST_KEY))
    return Number.isSafeInteger(best) && best >= 0 ? best : 0
  } catch {
    return 0
  }
}

export function use2048Game({ random = Math.random, storage } = {}) {
  const savedStorage = availableStorage(storage)
  // Keep ids increasing across restarts so leaving and freshly spawned Vue tiles never collide.
  let nextId = 0

  function spawn(tiles) {
    const empty = []
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (!tileAt(tiles, row, col)) empty.push({ row, col })
      }
    }
    if (!empty.length) return
    // Choose an empty cell uniformly, then apply the standard 90% 2 / 10% 4 distribution.
    const index = Math.max(0, Math.min(empty.length - 1, Math.floor(random() * empty.length)))
    const value = random() < 0.9 ? 2 : 4
    tiles.push({ id: `tile-${++nextId}`, ...empty[index], value, merged: false })
  }

  function freshState(best) {
    const tiles = []
    spawn(tiles)
    spawn(tiles)
    return {
      tiles,
      score: 0,
      best,
      status: 'playing',
      hasWon: false,
      moves: 0,
      lastGain: 0,
      revision: 0,
      message: 'Slide the tiles. Merge matching numbers to reach 2048.',
    }
  }

  const state = ref(freshState(readBest(savedStorage)))

  function move(direction) {
    if (state.value.status !== 'playing' || !DIRECTIONS.includes(direction)) return false
    const result = slideTiles(state.value.tiles, direction)
    if (!result.changed) {
      if (!hasMoves(state.value.tiles)) {
        state.value.status = 'lost'
        state.value.message = 'No moves left. Start a new game and try another strategy.'
      }
      return false
    }
    // Only changed boards receive a new tile, a move count, and the UI's single slide sound.
    spawn(result.tiles)
    state.value.tiles = result.tiles
    state.value.score += result.gain
    state.value.moves += 1
    state.value.lastGain = result.gain
    state.value.revision += 1
    if (state.value.score > state.value.best) {
      state.value.best = state.value.score
      try {
        savedStorage?.setItem(BEST_KEY, String(state.value.best))
      } catch {
        // Private browsing or a full storage quota must never interrupt play.
      }
    }
    // Remember the first win so continuing past 2048 does not repeatedly reopen the result screen.
    if (!state.value.hasWon && result.tiles.some((tile) => tile.value >= 2048)) {
      state.value.hasWon = true
      state.value.status = 'won'
      state.value.message = '2048! You made it. Keep going or start a fresh game.'
    } else if (!hasMoves(result.tiles)) {
      state.value.status = 'lost'
      state.value.message = 'No moves left. Start a new game and try another strategy.'
    } else {
      state.value.message = result.gain
        ? `Merged for +${result.gain} points. Keep the board moving.`
        : 'Tiles shifted. Find your next merge.'
    }
    return true
  }

  function continueGame() {
    if (state.value.status !== 'won') return
    state.value.status = hasMoves(state.value.tiles) ? 'playing' : 'lost'
    state.value.message =
      state.value.status === 'playing'
        ? 'Keep going. How high can you climb?'
        : 'No moves left, but 2048 is yours. Start a new game to play again.'
  }

  function restart() {
    state.value = freshState(state.value.best)
  }

  return { state, move, restart, continueGame }
}
