// The Boss Battle editor's helpers: the readiness checklist,
// question helpers, the monsters and the preview engine. No API calls.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  duplicateQuestion,
  newQuestion,
  questionFromDraft,
  questionProblems,
  readinessChecklist,
} from '../utils/bossBattleEditor.js'
import { createPreviewEngine, playableQuestions } from '../utils/bossBattlePreview.js'
import { bosses, findBoss } from '../components/classroom-games/bosses.js'

// Vitest runs from client/. Read as text so the client tests do not run server code.
const source = readFileSync(
  resolve(process.cwd(), '../server/src/utils/classroomGameDraft.js'),
  'utf8',
)

function complete(overrides = {}) {
  const question = newQuestion()
  question.prompt = 'What prints?'
  question.options[0].label = 'Right'
  question.options[1].label = 'Wrong'
  question.correctOptionId = question.options[0].id
  question.explanation = 'Because.'
  return { ...question, ...overrides }
}
const correctLabel = (question) =>
  question.options.find((option) => option.id === question.correctOptionId).label

describe('readiness checklist', () => {
  const ready = () => ({
    title: 'Week 3',
    questions: [complete(), complete(), complete()],
  })

  it('is empty for a finished game', () => {
    expect(readinessChecklist(ready())).toEqual([])
  })

  it('asks for a title and at least 3 questions', () => {
    const messages = readinessChecklist({ title: ' ', questions: [] }).map((item) => item.message)
    expect(messages).toEqual(['Give the battle a title.', expect.stringMatching(/at least 3/)])
  })

  it('points each problem at its question', () => {
    const game = ready()
    game.questions[1].explanation = ''
    expect(readinessChecklist(game)).toEqual([
      { message: 'Question 2 needs a "Why?" explanation.', target: game.questions[1].id },
    ])
  })

  it.each([
    ['no question text', { prompt: ' ' }, /question text/],
    ['no correct answer', { correctOptionId: '' }, /correct answer/],
    ['an unapproved draft', { needsReview: true }, /not approved/],
  ])('flags %s', (_label, changes, message) => {
    expect(questionProblems(complete(changes)).join()).toMatch(message)
  })

  it('flags a correct answer marked on a blank row', () => {
    const question = complete()
    question.correctOptionId = question.options[3].id
    expect(questionProblems(question).join()).toMatch(/correct answer/)
  })

  it('flags identical answers', () => {
    const question = complete()
    question.options[1].label = ' Right '
    expect(questionProblems(question).join()).toMatch(/identical/)
  })

  it('ignores blank answer rows when counting', () => {
    expect(questionProblems(complete())).toEqual([])
  })
})

describe('question helpers', () => {
  it('gives every new question and answer its own valid id', () => {
    const ids = [newQuestion(), newQuestion()].flatMap((question) => [
      question.id,
      ...question.options.map((option) => option.id),
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^[A-Za-z0-9_-]{1,40}$/.test(id))).toBe(true)
  })

  it('duplicates with new ids and the same correct answer', () => {
    const original = complete()
    const copy = duplicateQuestion(original)
    expect(copy.id).not.toBe(original.id)
    expect(copy.options[0].id).not.toBe(original.options[0].id)
    expect(correctLabel(copy)).toBe('Right')
    expect(copy.prompt).toBe(original.prompt)
  })

  it('marks a generated question as needing approval', () => {
    const question = questionFromDraft({
      code: '',
      prompt: 'Pick',
      answers: ['a', 'b'],
      correctIndex: 1,
      explanation: 'b.',
    })
    expect(question.needsReview).toBe(true)
    expect(correctLabel(question)).toBe('b')
    expect(question.options).toHaveLength(4)
  })
})

describe('monsters', () => {
  it('match the ids the server accepts', () => {
    for (const boss of bosses) expect(source).toContain(`"${boss.id}"`)
    const listed = source.slice(source.indexOf('BOSS_IDS'), source.indexOf('];'))
    expect(listed.match(/"[a-z-]+"/g)).toHaveLength(bosses.length)
  })

  it('all have what the page binds to', () => {
    for (const boss of bosses) {
      expect(boss.name).toBeTruthy()
      expect(boss.image).toBeTruthy()
      expect(boss.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(new Set(bosses.map((boss) => boss.id)).size).toBe(bosses.length)
  })

  it('falls back to the first monster for an unknown id', () => {
    expect(findBoss('retired')).toBe(bosses[0])
  })
})

describe('preview engine', () => {
  const draft = (hearts = 2) => ({
    title: 'T',
    bossId: bosses[0].id,
    hearts,
    questions: [complete({ prompt: 'One' }), complete({ prompt: 'Two' })],
  })
  const rightOf = (game, id) => game.questions.find((q) => q.id === id).correctOptionId
  const wrongOf = (game, id) => {
    const question = game.questions.find((q) => q.id === id)
    return question.options[1].id
  }

  it('skips unfinished questions', () => {
    const game = draft()
    game.questions.push(newQuestion())
    expect(playableQuestions(game)).toHaveLength(2)
  })

  it('wins when every question is answered correctly', async () => {
    const game = draft()
    const engine = createPreviewEngine(game)
    let play = await engine.start()
    while (play.status === 'in-progress') {
      const id = play.currentQuestion.id
      ;({ play } = await engine.answer(play.id, id, rightOf(game, id)))
    }
    expect(play.status).toBe('won')
    expect(play.heartsLeft).toBe(2)
    expect(play.missed).toEqual([])
  })

  it('sends a wrong answer to the end and costs a heart', async () => {
    const game = draft()
    const engine = createPreviewEngine(game)
    const play = await engine.start()
    const first = play.currentQuestion.id
    const result = await engine.answer(play.id, first, wrongOf(game, first))
    expect(result.correct).toBe(false)
    // Like the server: the question comes back, so no explanation yet (G8).
    expect(result.explanation).toBe('')
    expect(result.play.heartsLeft).toBe(1)
    expect(result.play.remaining).toBe(2)
    expect(result.play.currentQuestion.id).not.toBe(first)
  })

  it('loses at zero hearts and lists what was missed', async () => {
    const game = draft(1)
    const engine = createPreviewEngine(game)
    const play = await engine.start()
    const id = play.currentQuestion.id
    const result = await engine.answer(play.id, id, wrongOf(game, id))
    expect(result.play.status).toBe('lost')
    expect(result.play.missed).toEqual([expect.objectContaining({ id, correctAnswer: 'Right' })])
  })

  it('offers only filled answers, and restarts with full hearts', async () => {
    const game = draft()
    const engine = createPreviewEngine(game)
    const play = await engine.start()
    expect(play.currentQuestion.options).toHaveLength(2)
    const id = play.currentQuestion.id
    await engine.answer(play.id, id, wrongOf(game, id))
    expect((await engine.start()).heartsLeft).toBe(2)
  })

  it('keeps the order when the question asks for it', async () => {
    const game = draft()
    game.questions = [complete({ keepOrder: true })]
    const engine = createPreviewEngine(game)
    for (let run = 0; run < 10; run++) {
      const play = await engine.start()
      expect(play.currentQuestion.options.map((o) => o.label)).toEqual(['Right', 'Wrong'])
    }
  })
})
