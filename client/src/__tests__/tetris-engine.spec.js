import { describe, expect, it, vi } from 'vitest'
import {
  WIDTH,
  HEIGHT,
  SHAPES,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  MAX_TICK_DELTA,
  POINTS_PER_LEVEL,
  gravityForLevel,
  cellsFor,
  collides,
  clearFullRows,
  createSevenBag,
  useTetrisGame,
} from '../games/tetris/useTetrisGame.js'

const emptyBoard = () => Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null))
const piece = (type = 'T', rotation = 0, x = 3, y = 0) => ({ type, rotation, x, y })
function playing(active = piece()) {
  const game = useTetrisGame({ random: () => 0, storage: null })
  game.start()
  game.state.value.active = active
  return game
}
const occupied = (board) => board.flat().filter(Boolean).length

describe('Tetris geometry and seven-bag pieces', () => {
  it('provides seven four-cell tetrominoes in all four rotations', () => {
    expect(Object.keys(SHAPES).sort()).toEqual(['I', 'J', 'L', 'O', 'S', 'T', 'Z'])
    for (const type of Object.keys(SHAPES)) {
      for (let rotation = 0; rotation < 4; rotation += 1) {
        const cells = cellsFor(piece(type, rotation, 3, 5))
        expect(cells).toHaveLength(4)
        expect(new Set(cells.map(({ x, y }) => `${x},${y}`)).size).toBe(4)
        expect(collides(emptyBoard(), piece(type, rotation, 3, 5))).toBe(false)
      }
    }
    expect(cellsFor(null)).toEqual([])
    expect(collides(emptyBoard(), piece('unknown'))).toBe(true)
  })

  it('detects side walls, floor and occupied cells while allowing cells above the visible board', () => {
    const board = emptyBoard()
    expect(collides(board, piece('O', 0, -1, 0))).toBe(true)
    expect(collides(board, piece('O', 0, 9, 0))).toBe(true)
    expect(collides(board, piece('O', 0, 4, 19))).toBe(true)
    expect(collides(board, piece('O', 0, 4, -1))).toBe(false)
    board[1][4] = 'T'
    expect(collides(board, piece('O', 0, 4, 0))).toBe(true)
  })

  it('clears all full rows together, preserves order, and never mutates its input', () => {
    const board = emptyBoard()
    board[17][0] = 'T'
    board[18].fill('I')
    board[19].fill('Z')
    const before = JSON.stringify(board)
    const result = clearFullRows(board)
    expect(result.cleared).toBe(2)
    expect(result.board).toHaveLength(20)
    expect(result.board[19][0]).toBe('T')
    expect(occupied(result.board)).toBe(1)
    expect(JSON.stringify(board)).toBe(before)
    expect(result.board[0]).not.toBe(result.board[1])
  })

  it('uses injected randomness to shuffle seven-piece bags without omissions or duplicates', () => {
    const random = vi.fn(() => 0.999999)
    const bag = createSevenBag(random)
    expect(bag).toEqual(['I', 'O', 'T', 'S', 'Z', 'J', 'L'])
    expect(random).toHaveBeenCalledTimes(6)
    expect(new Set(createSevenBag(() => 0)).size).toBe(7)
    expect(createSevenBag(() => 0)).not.toEqual(bag)
  })

  it('maintains three previews and draws each tetromino exactly once in every bag', () => {
    const game = useTetrisGame({ random: () => 0, storage: null })
    expect(game.state.value.queue).toHaveLength(3)
    game.start()
    const drawn = []
    for (let index = 0; index < 21; index += 1) {
      drawn.push(game.state.value.active.type)
      game.hardDrop()
      game.state.value.board = emptyBoard()
      expect(game.state.value.queue).toHaveLength(3)
    }
    const bags = [drawn.slice(0, 7), drawn.slice(7, 14), drawn.slice(14, 21)]
    expect(bags.map((bag) => new Set(bag).size)).toEqual([7, 7, 7])
  })
})

describe('Tetris movement, rotations and ghost', () => {
  it('starts once and refuses player actions before starting', () => {
    const game = useTetrisGame({ random: () => 0, storage: null })
    expect(game.move(1)).toBe(false)
    expect(game.rotate()).toBe(false)
    expect(game.softDrop()).toBe(false)
    expect(game.hardDrop()).toBe(false)
    expect(game.hold()).toBe(false)
    expect(game.tick(100)).toBe(false)
    expect(game.ghost.value).toBeNull()
    expect(game.start()).toBe(true)
    expect(game.start()).toBe(false)
    expect(game.state.value.status).toBe('playing')
    expect(collides(game.state.value.board, game.state.value.active)).toBe(false)
  })

  it('moves one column and ignores wall collisions and unsupported displacements', () => {
    const game = playing(piece('O', 0, 0, 5))
    expect(game.move(-1)).toBe(false)
    expect(game.move(2)).toBe(false)
    expect(game.state.value.eventId).toBe(0)
    expect(game.move(1)).toBe(true)
    expect(game.state.value.active.x).toBe(1)
    expect(game.state.value).toMatchObject({ eventId: 1, lastEvent: 'move', score: 0 })
  })

  it('supports clockwise and counterclockwise rotation with stable origins away from obstacles', () => {
    const game = playing(piece('T', 0, 3, 5))
    const before = [...cellsFor(game.state.value.active)].sort((a, b) => a.x - b.x || a.y - b.y)
    expect(game.rotate()).toBe(true)
    expect(game.state.value.active.rotation).toBe(1)
    expect(game.rotate(-1)).toBe(true)
    expect(cellsFor(game.state.value.active).sort((a, b) => a.x - b.x || a.y - b.y)).toEqual(before)
    expect(game.rotate(0)).toBe(false)
  })

  it('uses a two-column I wall kick and upward floor kick without overlap', () => {
    const game = playing(piece('I', 1, -2, 5))
    expect(game.rotate()).toBe(true)
    expect(game.state.value.active).toMatchObject({ rotation: 2, x: 0, y: 5 })
    game.state.value.active = piece('I', 0, 3, 18)
    expect(game.rotate()).toBe(true)
    expect(game.state.value.active.y).toBe(16)
    expect(collides(game.state.value.board, game.state.value.active)).toBe(false)
    expect(Math.max(...cellsFor(game.state.value.active).map(({ y }) => y))).toBe(19)
  })

  it('rejects a rotation when every kick is obstructed', () => {
    const game = playing(piece('T', 0, 3, 10))
    game.state.value.board = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('I'))
    for (const { x, y } of cellsFor(game.state.value.active)) game.state.value.board[y][x] = null
    const before = { ...game.state.value.active }
    expect(game.rotate()).toBe(false)
    expect(game.state.value.active).toEqual(before)
    expect(game.state.value.eventId).toBe(0)
  })

  it('computes a landing ghost and locks hard drops exactly there for two points per cell', () => {
    const game = playing(piece('T', 0, 3, 0))
    game.state.value.board[18][4] = 'O'
    const landing = { ...game.ghost.value }
    expect(collides(game.state.value.board, landing)).toBe(false)
    expect(collides(game.state.value.board, { ...landing, y: landing.y + 1 })).toBe(true)
    expect(game.hardDrop()).toBe(true)
    expect(cellsFor(landing).map(({ x, y }) => game.state.value.board[y][x])).toEqual([
      'T',
      'T',
      'T',
      'T',
    ])
    expect(game.state.value).toMatchObject({ score: landing.y * 2, pieces: 1, lastEvent: 'lock' })
    expect(collides(game.state.value.board, game.state.value.active)).toBe(false)
  })

  it('awards soft-drop points only for descended cells and does not lock a blocked soft drop', () => {
    const game = playing(piece('O', 0, 4, 17))
    expect(game.softDrop()).toBe(true)
    expect(game.state.value).toMatchObject({ score: 1, lastEvent: 'drop', pieces: 0 })
    expect(game.softDrop()).toBe(false)
    expect(game.state.value.score).toBe(1)
    expect(game.state.value.pieces).toBe(0)
  })
})

describe('Tetris hold, scoring and top-out', () => {
  it('permits one hold until a piece locks and resets swapped pieces to their spawn orientation', () => {
    const game = playing(piece('T', 2, 5, 10))
    const next = game.state.value.queue[0]
    expect(game.hold()).toBe(true)
    expect(game.state.value).toMatchObject({ held: 'T', canHold: false, lastEvent: 'hold' })
    expect(game.state.value.active.type).toBe(next)
    expect(game.hold()).toBe(false)
    game.hardDrop()
    expect(game.state.value.canHold).toBe(true)
    const before = [...game.state.value.queue]
    const outgoing = game.state.value.active.type
    expect(game.hold()).toBe(true)
    expect(game.state.value.active).toEqual(piece('T', 0, 3, 0))
    expect(game.state.value.held).toBe(outgoing)
    expect(game.state.value.queue).toEqual(before)
  })

  it.each([
    [1, 100],
    [2, 300],
    [3, 500],
    [4, 800],
  ])(
    'clears %i rows for %i points and prioritizes clear events over hard drop',
    (count, points) => {
      const game = playing(piece('I', 1, 2, 16))
      for (let row = HEIGHT - count; row < HEIGHT; row += 1) {
        game.state.value.board[row].fill('Z')
        game.state.value.board[row][4] = null
      }
      expect(game.hardDrop()).toBe(true)
      expect(game.state.value).toMatchObject({
        score: points,
        lines: count,
        lastClear: count,
        pieces: 1,
        lastEvent: 'clear',
      })
      expect(occupied(game.state.value.board)).toBe(4 - count)
      expect(
        game.state.value.board
          .slice(0, count)
          .flat()
          .every((cell) => cell === null),
      ).toBe(true)
    },
  )

  it('uses the current score level for line points while counting lines independently', () => {
    const game = playing(piece('I', 1, 2, 16))
    game.state.value.score = 600
    game.state.value.level = 2
    game.state.value.lines = 9
    game.state.value.board[19].fill('Z')
    game.state.value.board[19][4] = null
    game.hardDrop()
    expect(game.state.value).toMatchObject({ score: 800, lines: 10, level: 2 })
    game.state.value.active = piece('I', 1, 2, 16)
    game.state.value.board = emptyBoard()
    for (const row of [18, 19]) {
      game.state.value.board[row].fill('Z')
      game.state.value.board[row][4] = null
    }
    game.hardDrop()
    expect(game.state.value).toMatchObject({ score: 1400, lines: 12, level: 3 })
  })

  it('increases level exactly at 500-point boundaries, including soft-drop points', () => {
    const game = playing(piece('O', 0, 4, 5))
    game.state.value.score = 498
    game.softDrop()
    expect(game.state.value).toMatchObject({ score: 499, level: 1, lines: 0 })
    game.softDrop()
    expect(game.state.value).toMatchObject({ score: POINTS_PER_LEVEL, level: 2, lines: 0 })
    game.tick(250)
    game.tick(250)
    game.tick(234)
    expect(game.state.value.active.y).toBe(7)
    game.tick(1)
    expect(game.state.value.active.y).toBe(8)
  })

  it('increases level from hard-drop points even when no lines clear', () => {
    const game = playing(piece('O', 0, 4, 17))
    game.state.value.score = 499
    expect(game.hardDrop()).toBe(true)
    expect(game.state.value).toMatchObject({ score: 501, level: 2, lines: 0, lastEvent: 'lock' })
  })

  it('uses the level before hard-drop distance points for that input line-clear bonus', () => {
    const game = playing(piece('I', 1, 2, 0))
    game.state.value.score = 480
    game.state.value.board[19].fill('Z')
    game.state.value.board[19][4] = null
    game.hardDrop()
    // 32 distance points cross 500; the same move still clears at level one's 100 points.
    expect(game.state.value).toMatchObject({ score: 612, level: 2, lines: 1, lastClear: 1 })
  })

  it('advances across multiple score tiers from one line-clear award', () => {
    const game = playing(piece('I', 1, 2, 16))
    game.state.value.score = 499
    for (const row of [16, 17, 18, 19]) {
      game.state.value.board[row].fill('Z')
      game.state.value.board[row][4] = null
    }
    game.hardDrop()
    expect(game.state.value).toMatchObject({ score: 1299, level: 3, lines: 4, lastClear: 4 })
  })

  it('tops out on the next spawn without leaving an overlapping active piece', () => {
    const game = playing(piece('I', 0, 3, 18))
    game.state.value.board[0][4] = 'Z'
    game.state.value.queue[0] = 'T'
    expect(game.hardDrop()).toBe(true)
    expect(game.state.value).toMatchObject({
      status: 'over',
      active: null,
      pieces: 1,
      lastEvent: 'over',
    })
    expect(game.ghost.value).toBeNull()
    expect(game.move(1)).toBe(false)
    expect(game.hold()).toBe(false)
  })

  it('tops out safely when a held piece cannot spawn', () => {
    const game = playing(piece('T', 0, 3, 10))
    game.state.value.held = 'I'
    game.state.value.board[1][3] = 'Z'
    expect(game.hold()).toBe(true)
    expect(game.state.value).toMatchObject({ status: 'over', active: null, lastEvent: 'over' })
    expect(occupied(game.state.value.board)).toBe(1)
  })

  it('prioritizes top-out over a simultaneous clear while retaining earned line points', () => {
    const game = playing(piece('I', 1, 2, 16))
    game.state.value.board[19].fill('Z')
    game.state.value.board[19][4] = null
    game.state.value.board[0][4] = 'J'
    game.state.value.queue[0] = 'T'
    game.hardDrop()
    expect(game.state.value).toMatchObject({
      status: 'over',
      active: null,
      lines: 1,
      lastClear: 1,
      score: 100,
      lastEvent: 'over',
    })
    expect(game.ghost.value).toBeNull()
  })

  it('ends a lock above the visible ceiling without writing illegal cells', () => {
    const game = playing(piece('T', 0, 3, -1))
    game.state.value.board[1][4] = 'Z'
    game.tick(250)
    game.tick(250)
    expect(game.state.value).toMatchObject({
      status: 'over',
      active: null,
      lastEvent: 'over',
      pieces: 0,
    })
    expect(occupied(game.state.value.board)).toBe(1)
    expect(game.state.value.board).toHaveLength(20)
  })
})

describe('Tetris gravity, lock delay and pause', () => {
  it.each([
    [1, 800],
    [2, 735],
    [11, 150],
    [12, 100],
    [1000, 100],
    [-10, 800],
    [0, 800],
    [NaN, 800],
    [Infinity, 800],
    [undefined, 800],
  ])('bounds gravity for level %s at %ims', (level, expected) => {
    expect(gravityForLevel(level)).toBe(expected)
  })

  it('handles an elapsed gravity interval made overdue by a new score level without negative catch-up', () => {
    const game = playing()
    game.state.value.score = 500
    game.state.value.level = 2
    game.state.value.fallElapsed = 750
    expect(game.tick(10)).toBe(true)
    expect(game.state.value.active.y).toBe(1)
    expect(game.state.value.fallElapsed).toBe(10)
    game.tick(250)
    game.tick(250)
    game.tick(224)
    expect(game.state.value.active.y).toBe(1)
    game.tick(1)
    expect(game.state.value.active.y).toBe(2)
  })

  it('caps delayed frames after a score increase instead of replaying the old interval as backlog', () => {
    const game = playing()
    game.state.value.score = 10_000
    game.state.value.level = 21
    game.state.value.fallElapsed = 750
    game.tick(100_000)
    expect(game.state.value.active.y).toBe(3)
    expect(game.state.value.fallElapsed).toBe(50)
    expect(game.state.value.pieces).toBe(0)
  })
  it('falls after 800ms at level one without emitting player drop events', () => {
    const game = playing()
    for (let index = 0; index < 3; index += 1) game.tick(250)
    expect(game.state.value.active.y).toBe(0)
    expect(game.tick(50)).toBe(true)
    expect(game.state.value.active.y).toBe(1)
    expect(game.state.value.eventId).toBe(0)
    expect(game.state.value.score).toBe(0)
  })

  it('bounds high-level gravity at 100ms and caps delayed-frame catch-up', () => {
    const game = playing()
    game.state.value.level = 99
    game.tick(250)
    expect(game.state.value.active.y).toBe(2)
    expect(game.state.value.fallElapsed).toBe(50)
    game.restart()
    game.tick(100_000)
    expect(game.state.value.active.y).toBe(0)
    expect(game.state.value.fallElapsed).toBe(MAX_TICK_DELTA)
    expect(game.tick(NaN)).toBe(false)
    expect(game.tick(-10)).toBe(false)
  })

  it('locks only after 500ms actually spent on the ground', () => {
    const game = playing(piece('O', 0, 4, 17))
    game.state.value.fallElapsed = 750
    game.tick(100)
    expect(game.state.value.active.y).toBe(18)
    expect(game.state.value.lockElapsed).toBe(50)
    game.tick(249)
    game.tick(200)
    expect(game.state.value.pieces).toBe(0)
    expect(game.state.value.lockElapsed).toBe(LOCK_DELAY - 1)
    game.tick(1)
    expect(game.state.value.pieces).toBe(1)
    expect(game.state.value.lastEvent).toBe('lock')
  })

  it('allows fifteen grounded movement resets, then locks without a sixteenth reset', () => {
    const game = playing(piece('O', 0, 4, 18))
    for (let index = 0; index < MAX_LOCK_RESETS; index += 1) {
      game.tick(200)
      game.tick(200)
      game.move(index % 2 === 0 ? -1 : 1)
    }
    expect(game.state.value).toMatchObject({ lockResets: 15, lockElapsed: 0, pieces: 0 })
    game.tick(200)
    game.tick(200)
    expect(game.move(1)).toBe(true)
    expect(game.state.value.lockElapsed).toBe(400)
    game.tick(99)
    expect(game.state.value.pieces).toBe(0)
    game.tick(1)
    expect(game.state.value.pieces).toBe(1)
    expect(game.state.value.lockResets).toBe(0)
  })

  it('counts accepted grounded rotations toward the same reset cap, while rejected actions do not reset', () => {
    const game = playing(piece('O', 0, 0, 18))
    game.tick(200)
    expect(game.move(-1)).toBe(false)
    expect(game.state.value).toMatchObject({ lockResets: 0, lockElapsed: 200 })
    expect(game.rotate()).toBe(true)
    expect(game.state.value).toMatchObject({ lockResets: 1, lockElapsed: 0 })
  })

  it('retains an exhausted reset quota and lock timer when moving off and back onto a ledge', () => {
    const game = playing(piece('O', 0, 4, 16))
    game.state.value.board[18][4] = 'J'
    game.state.value.board[18][5] = 'J'
    game.state.value.lockResets = MAX_LOCK_RESETS
    game.state.value.lockElapsed = 400
    game.move(-1)
    game.move(-1)
    game.tick(200)
    expect(game.state.value).toMatchObject({ lockResets: MAX_LOCK_RESETS, lockElapsed: 400 })
    expect(game.state.value.active.y).toBe(16)
    game.move(1)
    game.tick(99)
    expect(game.state.value.pieces).toBe(0)
    game.tick(1)
    expect(game.state.value.pieces).toBe(1)
  })

  it('keeps the ghost while paused and refuses every game mutation until resumed', () => {
    const game = playing()
    game.tick(200)
    const ghost = { ...game.ghost.value }
    expect(game.pause()).toBe(true)
    expect(game.pause()).toBe(false)
    const before = JSON.stringify(game.state.value)
    expect(game.tick(100_000)).toBe(false)
    expect(game.move(1)).toBe(false)
    expect(game.rotate()).toBe(false)
    expect(game.softDrop()).toBe(false)
    expect(game.hardDrop()).toBe(false)
    expect(game.hold()).toBe(false)
    expect(JSON.stringify(game.state.value)).toBe(before)
    expect(game.ghost.value).toEqual(ghost)
    expect(game.resume()).toBe(true)
    expect(game.resume()).toBe(false)
    game.tick(250)
    game.tick(250)
    game.tick(100)
    expect(game.state.value.active.y).toBe(1)
  })

  it('cannot cross a score tier while paused, and resumes score-driven speed after unpausing', () => {
    const game = playing()
    game.state.value.score = 499
    game.pause()
    expect(game.softDrop()).toBe(false)
    expect(game.hardDrop()).toBe(false)
    expect(game.state.value).toMatchObject({ score: 499, level: 1 })
    game.resume()
    game.softDrop()
    expect(game.state.value).toMatchObject({ score: 500, level: 2 })
  })
})

describe('Tetris seeded long-play invariants', () => {
  it.each([7, 91, 2026])(
    'keeps legal pieces, boards and scores throughout 500 locks with seed %i',
    (seed) => {
      let cursor = seed
      const random = () => {
        cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0
        return cursor / 2 ** 32
      }
      const game = useTetrisGame({ random, storage: null })
      game.start()
      let previousBest = 0
      let endedRuns = 0
      for (let turn = 0; turn < 500; turn += 1) {
        if (game.state.value.status === 'over') {
          endedRuns += 1
          game.restart()
        }
        const scoreBefore = game.state.value.score
        if (random() < 0.2) game.hold()
        const actions = Math.floor(random() * 12)
        for (let action = 0; action < actions; action += 1) {
          const choice = Math.floor(random() * 4)
          if (choice === 0) game.move(random() < 0.5 ? -1 : 1)
          else if (choice === 1) game.rotate(random() < 0.5 ? -1 : 1)
          else if (choice === 2) game.softDrop()
          else game.tick(random() * 400)
        }
        game.hardDrop()
        const { board, active, queue, score, best, level, lockResets } = game.state.value
        expect(board).toHaveLength(HEIGHT)
        expect(board.every((row) => row.length === WIDTH)).toBe(true)
        expect(board.flat().every((cell) => cell === null || Object.hasOwn(SHAPES, cell))).toBe(
          true,
        )
        expect(board.some((row) => row.every(Boolean))).toBe(false)
        expect(queue).toHaveLength(3)
        expect(score).toBeGreaterThanOrEqual(scoreBefore)
        expect(level).toBe(1 + Math.floor(score / POINTS_PER_LEVEL))
        expect(best).toBeGreaterThanOrEqual(Math.max(score, previousBest))
        expect(lockResets).toBeLessThanOrEqual(MAX_LOCK_RESETS)
        const activeIsLegal = active === null || !collides(board, active)
        const ghostIsLegal =
          game.ghost.value === null ||
          (!collides(board, game.ghost.value) &&
            collides(board, { ...game.ghost.value, y: game.ghost.value.y + 1 }))
        expect(activeIsLegal).toBe(true)
        expect(ghostIsLegal).toBe(true)
        previousBest = best
      }
      expect(endedRuns).toBeGreaterThan(0)
    },
  )
})

describe('Tetris best-score storage and restart', () => {
  it('loads only the best score and persists new bests without storing a board', () => {
    const storage = { getItem: vi.fn(() => '10'), setItem: vi.fn() }
    const game = useTetrisGame({ random: () => 0, storage })
    expect(storage.getItem).toHaveBeenCalledWith('learn-e-tetris-best')
    expect(game.state.value.best).toBe(10)
    game.start()
    game.hardDrop()
    expect(game.state.value.best).toBeGreaterThan(10)
    expect(storage.setItem).toHaveBeenLastCalledWith(
      'learn-e-tetris-best',
      String(game.state.value.best),
    )
    expect(storage.setItem.mock.calls.every(([key]) => key === 'learn-e-tetris-best')).toBe(true)
  })

  it.each([
    ['garbage', 0],
    ['Infinity', 0],
    ['-4', 0],
    ['1.8', 1],
    ['1e100', Number.MAX_SAFE_INTEGER],
  ])('safely normalizes saved score %s', (value, expected) => {
    const game = useTetrisGame({ random: () => 0, storage: { getItem: () => value } })
    expect(game.state.value.best).toBe(expected)
  })

  it('keeps scoring if storage reads or writes fail', () => {
    const storage = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('full')
      },
    }
    const game = useTetrisGame({ random: () => 0, storage })
    game.start()
    expect(game.hardDrop()).toBe(true)
    expect(game.state.value.score).toBeGreaterThan(0)
    expect(game.state.value.best).toBe(game.state.value.score)
  })

  it('restarts immediately into a clean run while preserving the best and event sequence', () => {
    const game = playing()
    game.hardDrop()
    game.state.value.score = 499
    game.softDrop()
    expect(game.state.value.level).toBe(2)
    game.hold()
    game.pause()
    const best = game.state.value.best
    const eventId = game.state.value.eventId
    expect(game.restart()).toBe(true)
    expect(game.state.value).toMatchObject({
      status: 'playing',
      score: 0,
      best,
      lines: 0,
      level: 1,
      pieces: 0,
      held: null,
      canHold: true,
      lastClear: 0,
      lockElapsed: 0,
      lockResets: 0,
      eventId,
    })
    expect(occupied(game.state.value.board)).toBe(0)
    expect(game.state.value.queue).toHaveLength(3)
    expect(game.state.value.active).not.toBeNull()
  })
})
