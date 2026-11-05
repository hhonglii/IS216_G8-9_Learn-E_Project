import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, SIZE, hasMoves, slideTiles, use2048Game } from '../games/2048/use2048Game.js'

const tile = (id, row, col, value = 2) => ({ id, row, col, value })
const grid = (tiles) =>
  Array.from({ length: SIZE }, (_, row) =>
    Array.from(
      { length: SIZE },
      (_, col) => tiles.find((item) => item.row === row && item.col === col)?.value || 0,
    ),
  )
const fullBoard = () =>
  Array.from({ length: SIZE ** 2 }, (_, index) => {
    const row = Math.floor(index / SIZE)
    const col = index % SIZE
    return tile(`full-${index}`, row, col, (row + col) % 2 === 0 ? 2 : 4)
  })

function gameWith(tiles, extra = {}, options = {}) {
  const game = use2048Game({ random: () => 0, storage: null, ...options })
  Object.assign(game.state.value, { tiles, ...extra })
  return game
}

describe('2048 standard movement', () => {
  it('exports the standard board and keyboard direction names', () => {
    expect(SIZE).toBe(4)
    expect(DIRECTIONS).toEqual(['up', 'left', 'down', 'right'])
  })

  it.each([
    [
      'left',
      [
        [4, 4, 0, 0],
        [8, 8, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    ],
    [
      'right',
      [
        [0, 0, 4, 4],
        [0, 0, 8, 8],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    ],
  ])('slides and merges every row %s once per move', (direction, expected) => {
    const tiles = [
      ...Array.from({ length: 4 }, (_, col) => tile(`a${col}`, 0, col)),
      ...Array.from({ length: 4 }, (_, col) => tile(`b${col}`, 1, col, 4)),
    ]
    const before = JSON.stringify(tiles)
    const result = slideTiles(tiles, direction)
    expect(grid(result.tiles)).toEqual(expected)
    expect(result.gain).toBe(24)
    expect(result.changed).toBe(true)
    expect(JSON.stringify(tiles)).toBe(before)
  })

  it.each([
    [
      'up',
      [
        [4, 8, 0, 0],
        [4, 8, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    ],
    [
      'down',
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [4, 8, 0, 0],
        [4, 8, 0, 0],
      ],
    ],
  ])('slides and merges every column %s once per move', (direction, expected) => {
    const tiles = [
      ...Array.from({ length: 4 }, (_, row) => tile(`a${row}`, row, 0)),
      ...Array.from({ length: 4 }, (_, row) => tile(`b${row}`, row, 1, 4)),
    ]
    const result = slideTiles(tiles, direction)
    expect(grid(result.tiles)).toEqual(expected)
    expect(result.gain).toBe(24)
  })

  it.each([
    [[2, 2, 4], [4, 4, 0, 0], 4],
    [[4, 2, 2], [4, 4, 0, 0], 4],
    [[2, 2, 2], [4, 2, 0, 0], 4],
    [[4, 4, 8, 8], [8, 16, 0, 0], 24],
  ])('never merges an already merged tile twice: %j', (values, expected, gain) => {
    const result = slideTiles(
      values.map((value, col) => tile(`b${col}`, 0, col, value)),
      'left',
    )
    expect(grid(result.tiles)[0]).toEqual(expected)
    expect(result.gain).toBe(gain)
  })

  it('merges through gaps while preserving the survivor id and clearing prior merge flags', () => {
    const first = slideTiles(
      [tile('front', 0, 0), tile('rear', 0, 2), tile('other', 1, 2, 8)],
      'left',
    )
    expect(first.tiles.find((item) => item.id === 'front')).toMatchObject({
      row: 0,
      col: 0,
      value: 4,
      merged: true,
    })
    expect(first.tiles.some((item) => item.id === 'rear')).toBe(false)
    const second = slideTiles(first.tiles, 'right')
    expect(second.tiles.find((item) => item.id === 'front')).toMatchObject({
      row: 0,
      col: 3,
      value: 4,
      merged: false,
    })
    expect(second.tiles.find((item) => item.id === 'other')).toMatchObject({ row: 1, col: 3 })
  })

  it('keeps the leading tile identity for a rightwards merge', () => {
    const result = slideTiles([tile('left', 0, 0), tile('right', 0, 1)], 'right')
    expect(result.tiles).toEqual([expect.objectContaining({ id: 'right', col: 3, value: 4 })])
  })
})

describe('2048 movement invariants', () => {
  // Fixed seeds cover mixed sparse/full boards without making regressions intermittent.
  function boards() {
    let seed = 0x2048
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    return Array.from({ length: 64 }, (_, sample) =>
      Array.from({ length: SIZE ** 2 }, (_, index) => {
        const exponent = Math.floor(random() * 7)
        return exponent < 2
          ? null
          : tile(
              `sample-${sample}-${index}`,
              Math.floor(index / SIZE),
              index % SIZE,
              2 ** (exponent - 1),
            )
      }).filter(Boolean),
    )
  }

  const mapCells = (tiles, transform) => tiles.map((item) => ({ ...item, ...transform(item) }))
  const mirror = (tiles) => mapCells(tiles, ({ row, col }) => ({ row, col: SIZE - 1 - col }))
  const transpose = (tiles) => mapCells(tiles, ({ row, col }) => ({ row: col, col: row }))

  it('conserves tile value, ids, occupancy and one-merge scoring across 256 seeded moves', () => {
    for (const tiles of boards()) {
      const original = JSON.stringify(tiles)
      const ids = new Set(tiles.map((item) => item.id))
      const total = tiles.reduce((sum, item) => sum + item.value, 0)
      for (const direction of DIRECTIONS) {
        const result = slideTiles(tiles, direction)
        const merged = result.tiles.filter((item) => item.merged)
        expect(result.tiles.reduce((sum, item) => sum + item.value, 0)).toBe(total)
        expect(new Set(result.tiles.map((item) => `${item.row},${item.col}`)).size).toBe(
          result.tiles.length,
        )
        expect(
          result.tiles.every(
            (item) =>
              ids.has(item.id) &&
              item.row >= 0 &&
              item.row < SIZE &&
              item.col >= 0 &&
              item.col < SIZE,
          ),
        ).toBe(true)
        expect(tiles.length - result.tiles.length).toBe(merged.length)
        expect(result.gain).toBe(merged.reduce((sum, item) => sum + item.value, 0))
      }
      expect(JSON.stringify(tiles)).toBe(original)
    }
  })

  it('obeys horizontal mirror and transpose symmetry on 64 mixed boards', () => {
    for (const tiles of boards()) {
      const right = slideTiles(tiles, 'right')
      const mirroredLeft = slideTiles(mirror(tiles), 'left')
      expect(grid(right.tiles)).toEqual(grid(mirror(mirroredLeft.tiles)))
      expect(right.gain).toBe(mirroredLeft.gain)
      const up = slideTiles(tiles, 'up')
      const transposedLeft = slideTiles(transpose(tiles), 'left')
      expect(grid(up.tiles)).toEqual(grid(transpose(transposedLeft.tiles)))
      expect(up.gain).toBe(transposedLeft.gain)
      const down = slideTiles(tiles, 'down')
      const transposedRight = slideTiles(transpose(tiles), 'right')
      expect(grid(down.tiles)).toEqual(grid(transpose(transposedRight.tiles)))
      expect(down.gain).toBe(transposedRight.gain)
    }
  })
})

describe('2048 spawning and score', () => {
  it.each([
    [0, 2],
    [0.899999, 2],
    [0.9, 4],
    [0.999999, 4],
  ])('uses the 90/10 tile probability boundary at %f', (sample, expected) => {
    const random = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(sample)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(sample)
    const game = use2048Game({ random, storage: null })
    expect(game.state.value.tiles).toHaveLength(2)
    expect(game.state.value.tiles.map((item) => item.value)).toEqual([expected, expected])
    expect(new Set(game.state.value.tiles.map((item) => `${item.row},${item.col}`)).size).toBe(2)
    expect(random).toHaveBeenCalledTimes(4)
  })

  it('spawns exactly one tile after a valid slide, and scores only merged values', () => {
    const random = vi.fn(() => 0)
    const game = gameWith([tile('a', 0, 0), tile('b', 0, 1), tile('c', 0, 2, 4)], {}, { random })
    random.mockClear()
    expect(game.move('left')).toBe(true)
    expect(grid(game.state.value.tiles)[0]).toEqual([4, 4, 2, 0])
    expect(game.state.value).toMatchObject({
      score: 4,
      best: 4,
      moves: 1,
      lastGain: 4,
      revision: 1,
    })
    expect(random).toHaveBeenCalledTimes(2)
    expect(game.state.value.tiles.filter((item) => item.id.startsWith('tile-'))).toHaveLength(1)
  })

  it('does not spawn, score or increment counters on a no-op or unrecognised direction', () => {
    const random = vi.fn(() => 0)
    const game = gameWith([tile('a', 0, 0)], {}, { random })
    random.mockClear()
    const before = JSON.stringify(game.state.value)
    expect(game.move('left')).toBe(false)
    expect(game.move('up')).toBe(false)
    expect(game.move('diagonal')).toBe(false)
    expect(random).not.toHaveBeenCalled()
    expect(JSON.stringify(game.state.value)).toBe(before)
  })

  it('adds points from all merged lanes to existing score and updates the best', () => {
    const game = gameWith(
      [tile('a', 0, 0, 8), tile('b', 0, 1, 8), tile('c', 2, 0, 4), tile('d', 2, 1, 4)],
      { score: 100, best: 110 },
    )
    game.move('left')
    expect(game.state.value).toMatchObject({ score: 124, best: 124, lastGain: 24 })
  })

  it('keeps unique tile ids through repeated spawns and a restart', () => {
    const game = use2048Game({ random: () => 0, storage: null })
    const firstIds = game.state.value.tiles.map((item) => item.id)
    game.move('down')
    const movedIds = game.state.value.tiles.map((item) => item.id)
    expect(new Set(movedIds).size).toBe(movedIds.length)
    game.restart()
    expect(game.state.value.tiles.every((item) => !firstIds.includes(item.id))).toBe(true)
    expect(game.state.value.tiles.every((item) => !movedIds.includes(item.id))).toBe(true)
  })
})

describe('2048 win, continuation and loss', () => {
  it('wins at 2048, blocks play until continued, then permits higher merges without another win', () => {
    const game = gameWith([tile('a', 0, 0, 1024), tile('b', 0, 1, 1024)])
    expect(game.move('left')).toBe(true)
    expect(game.state.value).toMatchObject({ status: 'won', hasWon: true, score: 2048 })
    expect(game.move('down')).toBe(false)
    game.continueGame()
    expect(game.state.value.status).toBe('playing')
    game.state.value.tiles = [tile('a', 0, 0, 2048), tile('b', 0, 1, 2048)]
    expect(game.move('left')).toBe(true)
    expect(game.state.value).toMatchObject({ status: 'playing', hasWon: true, score: 6144 })
    expect(game.state.value.tiles.some((item) => item.value === 4096)).toBe(true)
  })

  it('detects full dead boards even when the incoming slide is invalid', () => {
    const game = gameWith(fullBoard())
    expect(hasMoves(game.state.value.tiles)).toBe(false)
    expect(game.move('left')).toBe(false)
    expect(game.state.value).toMatchObject({ status: 'lost', score: 0, moves: 0, revision: 0 })
    expect(game.move('right')).toBe(false)
    game.continueGame()
    expect(game.state.value.status).toBe('lost')
  })

  it('detects a loss after a valid slide and spawn consume the last empty cell', () => {
    const tiles = fullBoard().filter((item) => !(item.row === 0 && item.col === 0))
    for (const item of tiles.filter((item) => item.row === 1)) item.value *= 4
    const game = gameWith(tiles)
    expect(game.move('left')).toBe(true)
    expect(game.state.value.status).toBe('lost')
    expect(game.state.value.tiles).toHaveLength(16)
  })

  it('recognises full boards with a legal horizontal or vertical merge', () => {
    const horizontal = fullBoard()
    horizontal[1].value = horizontal[0].value
    expect(hasMoves(horizontal)).toBe(true)
    const vertical = fullBoard()
    vertical[4].value = vertical[0].value
    expect(hasMoves(vertical)).toBe(true)
    expect(hasMoves(fullBoard().slice(1))).toBe(true)
  })

  it('reports loss when continuing a won board that has no legal moves', () => {
    const game = gameWith(fullBoard(), { status: 'won', hasWon: true })
    game.continueGame()
    expect(game.state.value.status).toBe('lost')
    expect(game.state.value.hasWon).toBe(true)
  })

  it('restarts with two fresh tiles and reset counters while retaining the best score', () => {
    const game = gameWith([tile('a', 0, 0)], {
      score: 400,
      best: 800,
      hasWon: true,
      status: 'lost',
      moves: 30,
      lastGain: 128,
      revision: 30,
    })
    game.restart()
    expect(game.state.value).toMatchObject({
      score: 0,
      best: 800,
      hasWon: false,
      status: 'playing',
      moves: 0,
      lastGain: 0,
      revision: 0,
    })
    expect(game.state.value.tiles).toHaveLength(2)
  })
})

describe('2048 guarded best-score persistence', () => {
  it('loads and persists only the best score under the dedicated key', () => {
    const storage = { getItem: vi.fn(() => '32'), setItem: vi.fn() }
    const game = gameWith([tile('a', 0, 0, 32), tile('b', 0, 1, 32)], {}, { storage })
    expect(game.state.value.best).toBe(32)
    expect(storage.getItem).toHaveBeenCalledWith('learn-e-2048-best')
    game.move('left')
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith('learn-e-2048-best', '64')
    expect(game.state.value.best).toBe(64)
    game.restart()
    expect(game.state.value.best).toBe(64)
  })

  it.each(['garbage', '-3', 'Infinity', '1.25', '9007199254740992'])(
    'ignores invalid saved score %s',
    (saved) => {
      const game = use2048Game({ random: () => 0, storage: { getItem: () => saved } })
      expect(game.state.value.best).toBe(0)
    },
  )

  it('keeps playing if storage reads and writes throw', () => {
    const storage = {
      getItem: () => {
        throw new Error('read blocked')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const game = gameWith([tile('a', 0, 0), tile('b', 0, 1)], {}, { storage })
    expect(game.state.value.best).toBe(0)
    expect(game.move('left')).toBe(true)
    expect(game.state.value).toMatchObject({ score: 4, best: 4, status: 'playing' })
  })

  it('does not rewrite storage while a move stays below the existing best', () => {
    const storage = { getItem: () => '100', setItem: vi.fn() }
    const game = gameWith([tile('a', 0, 0), tile('b', 0, 1)], {}, { storage })
    game.move('left')
    expect(game.state.value.best).toBe(100)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
