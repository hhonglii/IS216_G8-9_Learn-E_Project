// The Classroom games page: what a student and a professor each see, the
// student's battle and its effects, the professor's editor and the class
// results. API mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ClassroomGamesView from '../views/ClassroomGamesView.vue'
import * as api from '../services/classroomGamesApi.js'
import { newQuestion } from '../utils/bossBattleEditor.js'
import { findBoss } from '../components/classroom-games/bosses.js'

vi.mock('../services/classroomGamesApi.js', () => ({
  getClassroomGame: vi.fn(),
  saveClassroomGame: vi.fn(),
  publishClassroomGame: vi.fn(),
  unpublishClassroomGame: vi.fn(),
  getClassroomGameResults: vi.fn(),
  draftGameQuestions: vi.fn(),
  startGamePlay: vi.fn(),
  answerGamePlay: vi.fn(),
}))

enableAutoUnmount(afterEach)

async function mountView() {
  const blank = { template: '<p />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/classrooms/:classroomId/games', component: blank },
      { path: '/classrooms/:classroomId', name: 'classroom', component: blank },
    ],
  })
  await router.push('/classrooms/c1/games')
  const wrapper = mount(ClassroomGamesView, {
    attachTo: document.body,
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

function readyQuestion(prompt) {
  const question = newQuestion()
  question.prompt = prompt
  question.options[0].label = 'Right'
  question.options[1].label = 'Wrong'
  question.correctOptionId = question.options[0].id
  question.explanation = 'Because.'
  return question
}
const readyGame = (overrides = {}) => ({
  title: 'Week 3',
  bossId: 'memory-kraken',
  hearts: 3,
  status: 'draft',
  version: 0,
  questions: [readyQuestion('One'), readyQuestion('Two'), readyQuestion('Three')],
  ...overrides,
})
// Buttons and the links styled as buttons, such as Continue.
const button = (wrapper, text) =>
  wrapper.findAll('button, a').find((item) => item.text().includes(text))

const studentGame = {
  id: 'g1',
  title: 'Week 3',
  bossId: 'memory-kraken',
  hearts: 2,
  questionCount: 2,
}
const playState = (overrides = {}) => ({
  id: 'p1',
  status: 'in-progress',
  heartsLeft: 2,
  maxHearts: 2,
  totalQuestions: 2,
  remaining: 2,
  answerCount: 0,
  currentQuestion: {
    id: 'q1',
    code: 'print(1)',
    prompt: 'What prints?',
    options: [
      { id: 'a', label: 'One' },
      { id: 'b', label: 'Two' },
    ],
  },
  missed: [],
  ...overrides,
})
const asStudent = (data) =>
  api.getClassroomGame.mockResolvedValue({
    data: { viewer: 'student', game: studentGame, play: null, defeated: false, ...data },
  })

beforeEach(() => {
  vi.resetAllMocks()
  api.getClassroomGameResults.mockResolvedValue({
    data: { version: 1, studentsPlayed: 0, studentsDefeatedBoss: 0, questions: [] },
  })
  api.saveClassroomGame.mockResolvedValue({ data: {} })
})

describe('what each person sees', () => {
  it('links back to the classroom, its only way in (fifth pass W8)', async () => {
    asStudent({})
    const wrapper = await mountView()
    const back = wrapper.findAll('a').find((link) => link.text() === 'Back to classroom')
    expect(back.attributes('href')).toBe('/classrooms/c1')
  })

  it('shows a student the empty message when no game is published', async () => {
    asStudent({ game: null })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No Boss Battle right now')
    // True both before the first publish and after an unpublish (G16).
    expect(wrapper.text()).toContain("Your professor hasn't put up a battle to play.")
    expect(wrapper.find('#game-title').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Start battle')
  })

  it('shows a student the battle when one is published, with no editor', async () => {
    asStudent({})
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Start battle')
    expect(wrapper.text()).not.toContain('No Boss Battle right now')
    expect(wrapper.find('#game-title').exists()).toBe(false)
  })

  it('shows a professor the edit screen even before any game exists', async () => {
    api.getClassroomGame.mockResolvedValue({ data: { viewer: 'professor', game: null } })
    const wrapper = await mountView()
    expect(wrapper.find('#game-title').exists()).toBe(true)
    expect(wrapper.text()).toContain('Choose a monster')
    expect(wrapper.text()).not.toContain('No Boss Battle right now')
  })

  it('offers a retry when loading fails', async () => {
    api.getClassroomGame.mockRejectedValueOnce(new Error('offline'))
    const wrapper = await mountView()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not reach the server.')
    asStudent({ game: null })
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No Boss Battle right now')
  })

  it('shows the server message when the person is not allowed in', async () => {
    api.getClassroomGame.mockRejectedValue({
      response: {
        status: 403,
        data: { error: { message: 'Join this classroom to open its games.' } },
      },
    })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Join this classroom')
  })
})

describe('the student battle', () => {
  async function inBattle() {
    asStudent({})
    api.startGamePlay.mockResolvedValue({ data: { play: playState() } })
    const wrapper = await mountView()
    await button(wrapper, 'Start battle').trigger('click')
    await flushPromises()
    return wrapper
  }
  const answerWith = (correct, play) =>
    api.answerGamePlay.mockResolvedValue({
      // Like the server, which sends no explanation after a wrong answer (G8).
      data: { correct, explanation: correct ? 'Because of print.' : '', play },
    })

  it('shows the question, code, hearts and answers', async () => {
    const wrapper = await inBattle()
    expect(wrapper.text()).toContain('What prints?')
    expect(wrapper.get('pre').text()).toBe('print(1)')
    expect(wrapper.find('[aria-label="2 of 2 hearts left"]').exists()).toBe(true)
    expect(button(wrapper, 'One').attributes('aria-disabled')).toBe('false')
  })

  it('binds the chosen monster to the picture', async () => {
    const wrapper = await inBattle()
    const image = wrapper.get('img.boss')
    expect(image.attributes('alt')).toBe('The Memory Kraken')
    expect(image.attributes('style')).toContain('--boss-color')
    expect(image.attributes('src')).toBe(findBoss('memory-kraken').image)
  })

  it('takes a heart after a wrong answer without giving the answer away', async () => {
    const wrapper = await inBattle()
    answerWith(
      false,
      playState({
        heartsLeft: 1,
        currentQuestion: { ...playState().currentQuestion, id: 'q2', prompt: 'Next one?' },
      }),
    )
    await button(wrapper, 'Two').trigger('click')
    await flushPromises()
    expect(api.answerGamePlay).toHaveBeenCalledWith('p1', 'q1', 'b', 0)
    expect(wrapper.get('.battle-feedback').text()).toContain('This question will come back.')
    expect(wrapper.find('.battle-explanation').exists()).toBe(false)
    expect(wrapper.find('.battle-answer--right').exists()).toBe(false)
    expect(wrapper.find('[aria-label="1 of 2 hearts left"]').exists()).toBe(true)
    // The question stays up until they continue.
    expect(wrapper.text()).toContain('What prints?')
    await button(wrapper, 'Continue').trigger('click')
    expect(wrapper.text()).toContain('Next one?')
  })

  it('explains a right answer', async () => {
    const wrapper = await inBattle()
    answerWith(true, playState({ remaining: 1 }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(wrapper.get('.battle-explanation').text()).toBe('Because of print.')
    await button(wrapper, 'Continue').trigger('click')
    expect(wrapper.text()).not.toContain('Because of print.')
  })

  it('cannot answer twice while the explanation is showing', async () => {
    const wrapper = await inBattle()
    answerWith(true, playState({ remaining: 1 }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(button(wrapper, 'Two').attributes('aria-disabled')).toBe('true')
    await button(wrapper, 'Two').trigger('click')
    expect(api.answerGamePlay).toHaveBeenCalledTimes(1)
  })

  it('reads out the start, each result and the ending on one status line', async () => {
    const wrapper = await inBattle()
    const status = () => wrapper.get('#boss-battle > [role="status"]').text()
    expect(status()).toBe('The battle has started. What prints?')
    answerWith(false, playState({ heartsLeft: 1 }))
    await button(wrapper, 'Two').trigger('click')
    await flushPromises()
    expect(status()).toContain('strikes back')
    expect(status()).toContain('This question will come back.')
    await button(wrapper, 'Continue').trigger('click')
    // The question's heading is read out where the link lands instead.
    expect(status()).toBe('')
    answerWith(true, playState({ status: 'won', remaining: 0, currentQuestion: null }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    await button(wrapper, 'See how it ended').trigger('click')
    expect(status()).toContain('Boss defeated!')
    expect(status()).toContain('hearts left')
  })

  it('links Continue to the next question and the ending to the top of the battle', async () => {
    const wrapper = await inBattle()
    expect(wrapper.get('#battle-question').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('#boss-battle').attributes('tabindex')).toBe('-1')
    answerWith(true, playState({ remaining: 1 }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(button(wrapper, 'Continue').attributes('href')).toBe('#battle-question')
    await button(wrapper, 'Continue').trigger('click')
    answerWith(true, playState({ status: 'won', remaining: 0, currentQuestion: null }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(button(wrapper, 'See how it ended').attributes('href')).toBe('#boss-battle')
  })

  it('moves the health bar as questions are cleared', async () => {
    const wrapper = await inBattle()
    expect(wrapper.get('.battle-health').attributes('aria-valuenow')).toBe('100')
    answerWith(true, playState({ remaining: 1 }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(wrapper.get('.battle-health').attributes('aria-valuenow')).toBe('50')
  })

  it('celebrates a win once the student continues', async () => {
    const wrapper = await inBattle()
    answerWith(true, playState({ status: 'won', remaining: 0, currentQuestion: null }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    await button(wrapper, 'See how it ended').trigger('click')
    expect(wrapper.text()).toContain('Boss defeated!')
    expect(wrapper.get('img.boss').classes()).toContain('boss--defeated')
    expect(button(wrapper, 'Play again')).toBeTruthy()
  })

  it('shows the review after a loss and lets the student try again', async () => {
    const wrapper = await inBattle()
    answerWith(
      false,
      playState({
        status: 'lost',
        heartsLeft: 0,
        currentQuestion: null,
        missed: [
          { id: 'q1', code: '', prompt: 'What prints?', explanation: 'Why.', correctAnswer: 'One' },
        ],
      }),
    )
    await button(wrapper, 'Two').trigger('click')
    await flushPromises()
    await button(wrapper, 'See how it ended').trigger('click')
    expect(wrapper.text()).toContain('You ran out of hearts')
    expect(wrapper.text()).toContain('Correct answer: One')
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(api.startGamePlay).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('What prints?')
  })

  it('resumes a battle in progress straight away', async () => {
    asStudent({ play: playState({ heartsLeft: 1 }) })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('What prints?')
    expect(wrapper.find('[aria-label="1 of 2 hearts left"]').exists()).toBe(true)
    expect(api.startGamePlay).not.toHaveBeenCalled()
  })

  it('remembers a boss already defeated', async () => {
    asStudent({ defeated: true })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('You have defeated this boss')
    expect(button(wrapper, 'Fight again')).toBeTruthy()
  })

  it('reloads when the battle changed, as when the professor unpublished', async () => {
    const wrapper = await inBattle()
    api.answerGamePlay.mockRejectedValue({ response: { status: 409, data: { error: {} } } })
    asStudent({ game: null })
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No Boss Battle right now')
    expect(wrapper.text()).toContain('has been reloaded')
  })

  it('keeps the question up after a network failure so the student can retry', async () => {
    const wrapper = await inBattle()
    api.answerGamePlay.mockRejectedValue(new Error('offline'))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not reach the server.')
    expect(button(wrapper, 'One').attributes('aria-disabled')).toBe('false')
  })
})

describe('the battle effects', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function inBattle(play = playState()) {
    asStudent({})
    api.startGamePlay.mockResolvedValue({ data: { play } })
    const wrapper = await mountView()
    await button(wrapper, 'Start battle').trigger('click')
    await flushPromises()
    return wrapper
  }
  const answerWith = (correct, play) =>
    api.answerGamePlay.mockResolvedValue({ data: { correct, explanation: 'Why.', play } })
  const bossClasses = (wrapper) => wrapper.get('img.boss').classes()
  const bolt = (wrapper) => wrapper.find('.battle-bolt')

  it('flies a bolt at the monster, then lands the hit and recovers', async () => {
    const wrapper = await inBattle()
    answerWith(true, playState({ remaining: 1 }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()

    expect(bolt(wrapper).classes()).toContain('battle-bolt--hit')
    expect(bossClasses(wrapper)).toContain('boss--idle')
    expect(wrapper.find('.boss-impact').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(260)
    expect(bolt(wrapper).exists()).toBe(false)
    expect(bossClasses(wrapper)).toContain('boss--hurt')
    expect(wrapper.get('.boss-impact__label').text()).toBe('−50 HP')
    expect(wrapper.find('.battle-grid--hit').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(480)
    expect(bossClasses(wrapper)).toContain('boss--idle')
    expect(wrapper.find('.battle-grid--hit').exists()).toBe(false)
  })

  it('tells screen readers the new health and result before the hit lands', async () => {
    const wrapper = await inBattle()
    answerWith(true, playState({ remaining: 1 }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(wrapper.get('.battle-health').attributes('aria-valuenow')).toBe('50')
    expect(wrapper.get('[role="status"]').text()).toContain('Direct hit')
  })

  it('has the monster strike back and breaks only the heart just lost', async () => {
    const wrapper = await inBattle()
    expect(wrapper.find('.heart-piece').exists()).toBe(false)
    answerWith(false, playState({ heartsLeft: 1 }))
    await button(wrapper, 'Two').trigger('click')
    await flushPromises()

    expect(bossClasses(wrapper)).toContain('boss--attack')
    expect(wrapper.findAll('.heart-slot')[1].find('.heart-piece--whole').exists()).toBe(true)
    expect(wrapper.findAll('.heart-slot')[0].find('.heart-piece').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(60)
    expect(bolt(wrapper).classes()).toContain('battle-bolt--attack')
    await vi.advanceTimersByTimeAsync(200)
    expect(bolt(wrapper).exists()).toBe(false)
    expect(wrapper.find('.battle-grid--hurt').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(220)
    expect(bossClasses(wrapper)).toContain('boss--idle')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.find('.heart-piece').exists()).toBe(false)
  })

  it('does not replay old heart losses when a battle resumes', async () => {
    asStudent({ play: playState({ heartsLeft: 1 }) })
    const wrapper = await mountView()
    expect(wrapper.findAll('.heart--lost')).toHaveLength(1)
    expect(wrapper.find('.heart-piece').exists()).toBe(false)
  })

  it('plays the defeat on the final blow and keeps the monster defeated', async () => {
    const wrapper = await inBattle()
    answerWith(true, playState({ status: 'won', remaining: 0, currentQuestion: null }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    // The monster must not fall before the blow reaches it.
    expect(bossClasses(wrapper)).toContain('boss--idle')

    await vi.advanceTimersByTimeAsync(260)
    expect(bossClasses(wrapper)).toContain('boss--dying')
    expect(wrapper.get('.boss-impact__label').text()).toBe('FATAL ERROR')
    expect(wrapper.find('.boss-impact--fatal').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(1300)
    expect(bossClasses(wrapper)).toContain('boss--defeated')

    await button(wrapper, 'See how it ended').trigger('click')
    expect(wrapper.find('.battle-end-won').exists()).toBe(true)
    expect(wrapper.find('.boss-impact--fatal').exists()).toBe(true)
    expect(wrapper.find('.boss-impact__label').exists()).toBe(false)
  })

  it('leaves the monster gloating after the last heart is lost', async () => {
    const wrapper = await inBattle()
    answerWith(false, playState({ status: 'lost', heartsLeft: 0, currentQuestion: null }))
    await button(wrapper, 'Two').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(480)
    expect(bossClasses(wrapper)).toContain('boss--gloat')
    await button(wrapper, 'See how it ended').trigger('click')
    expect(bossClasses(wrapper)).toContain('boss--gloat')
    expect(wrapper.find('.battle-end-lost').exists()).toBe(true)
  })

  it('clears a bolt in flight when the battle restarts or the page closes', async () => {
    const wrapper = await inBattle()
    answerWith(true, playState({ remaining: 1 }))
    await button(wrapper, 'One').trigger('click')
    await flushPromises()
    expect(bolt(wrapper).exists()).toBe(true)
    await button(wrapper, 'Continue').trigger('click')
    api.startGamePlay.mockResolvedValue({ data: { play: playState() } })
    answerWith(false, playState({ status: 'lost', heartsLeft: 0, currentQuestion: null }))
    await button(wrapper, 'Two').trigger('click')
    await flushPromises()
    await button(wrapper, 'See how it ended').trigger('click')
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(bolt(wrapper).exists()).toBe(false)
    expect(wrapper.find('.heart-piece').exists()).toBe(false)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(2000)
  })
})

describe('the professor editor', () => {
  async function editor(game = readyGame()) {
    api.getClassroomGame.mockResolvedValue({ data: { viewer: 'professor', game } })
    return mountView()
  }
  // Publishing and removing a filled-in question both ask first; say yes unless a test says no.
  let confirm
  beforeEach(() => {
    vi.useFakeTimers()
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    vi.useRealTimers()
    confirm.mockRestore()
  })

  const settle = async () => {
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
  }

  it('changes the monster preview when another monster is chosen', async () => {
    const wrapper = await editor()
    expect(wrapper.get('.game-setup-preview').text()).toContain('The Memory Kraken')
    await wrapper.find('input[value="race-ghost"]').setValue(true)
    expect(wrapper.get('.game-setup-preview').text()).toContain('The Race Condition')
    expect(wrapper.get('.game-setup-preview img').attributes('src')).toBe(
      findBoss('race-ghost').image,
    )
  })

  it('offers 1 to 10 hearts', async () => {
    const wrapper = await editor()
    const values = wrapper.findAll('#game-hearts option').map((option) => option.element.value)
    expect(values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  })

  it('says nothing about saving on a new battle until the first change (G13)', async () => {
    const wrapper = await editor(null)
    const status = wrapper.get('#game-status [role="status"]')
    expect(status.text()).toBe('')
    await wrapper.get('#game-title').setValue('A')
    expect(status.text()).toBe('Unsaved changes')
  })

  it('autosaves after a pause, not on every keystroke', async () => {
    const wrapper = await editor()
    await wrapper.get('#game-title').setValue('A')
    await wrapper.get('#game-title').setValue('Ab')
    expect(api.saveClassroomGame).not.toHaveBeenCalled()
    await settle()
    expect(api.saveClassroomGame).toHaveBeenCalledTimes(1)
    expect(api.saveClassroomGame.mock.calls[0][1].title).toBe('Ab')
    expect(wrapper.text()).toContain('All changes saved')
  })

  it('never runs two saves at once, and saves the edit made during a save', async () => {
    const wrapper = await editor()
    let finish
    api.saveClassroomGame.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await wrapper.get('#game-title').setValue('First')
    await settle()
    await wrapper.get('#game-title').setValue('Second')
    await settle()
    expect(api.saveClassroomGame).toHaveBeenCalledTimes(1)
    finish({ data: {} })
    await settle()
    await settle()
    expect(api.saveClassroomGame).toHaveBeenCalledTimes(2)
    expect(api.saveClassroomGame.mock.calls[1][1].title).toBe('Second')
  })

  it('reports a failed save and lets the professor retry', async () => {
    const wrapper = await editor()
    api.saveClassroomGame.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('#game-title').setValue('Changed')
    await settle()
    expect(wrapper.text()).toContain('Not saved')
    await button(wrapper, 'Try saving again').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('All changes saved')
  })

  it('saves unsaved edits when the professor leaves the page', async () => {
    const wrapper = await editor()
    await wrapper.get('#game-title').setValue('Leaving')
    wrapper.unmount()
    expect(api.saveClassroomGame).toHaveBeenCalledTimes(1)
    expect(api.saveClassroomGame.mock.calls[0][1].title).toBe('Leaving')
  })

  it('marks the correct answer by clicking its circle', async () => {
    const wrapper = await editor(readyGame({ questions: [newQuestion()] }))
    const radios = wrapper.findAll('.game-answer-row input[type="radio"]')
    await radios[2].setValue(true)
    await settle()
    const saved = api.saveClassroomGame.mock.calls[0][1].questions[0]
    expect(saved.correctOptionId).toBe(saved.options[2].id)
  })

  it('adds, reorders, duplicates and removes questions', async () => {
    const wrapper = await editor()
    const prompts = () =>
      wrapper
        .findAll('fieldset[id^="game-question-"]')
        .map((card) => card.get('textarea[id$="-prompt"]').element.value)
    await wrapper.get('[aria-label="Move question 1 down"]').trigger('click')
    expect(prompts()).toEqual(['Two', 'One', 'Three'])
    await wrapper.get('[aria-label="Duplicate question 2"]').trigger('click')
    expect(prompts()).toEqual(['Two', 'One', 'One', 'Three'])
    await wrapper.get('[aria-label="Remove question 1"]').trigger('click')
    expect(prompts()).toEqual(['One', 'One', 'Three'])
    await button(wrapper, 'Add question').trigger('click')
    expect(prompts()).toEqual(['One', 'One', 'Three', ''])
  })

  it('saves a change to the hearts or the monster, and to a question', async () => {
    const wrapper = await editor()
    await wrapper.get('#game-hearts').setValue('5')
    await settle()
    expect(api.saveClassroomGame.mock.calls[0][1].hearts).toBe(5)
    await wrapper.find('input[value="race-ghost"]').setValue(true)
    await settle()
    expect(api.saveClassroomGame.mock.calls[1][1].bossId).toBe('race-ghost')
    await wrapper.get('textarea[id$="-prompt"]').setValue('Changed')
    await settle()
    expect(api.saveClassroomGame.mock.calls[2][1].questions[0].prompt).toBe('Changed')
  })

  it('says which question was added and links to its question box', async () => {
    const wrapper = await editor()
    const note = () => wrapper.get('#game-add-question').element.parentElement.nextElementSibling
    expect(note().getAttribute('role')).toBe('status')
    expect(note().textContent.trim()).toBe('')
    await button(wrapper, 'Add question').trigger('click')
    expect(note().textContent).toContain('Question 4 added.')
    const link = wrapper.findAll('a').find((a) => a.text() === 'Go to question 4')
    const box = wrapper.findAll('textarea[id$="-prompt"]')[3]
    expect(link.attributes('href')).toBe(`#${box.attributes('id')}`)
    await wrapper.get('[aria-label="Duplicate question 1"]').trigger('click')
    expect(note().textContent).toContain('Question 2 added.')
    await wrapper.get('[aria-label="Remove question 2"]').trigger('click')
    expect(note().textContent.trim()).toBe('')
  })

  it('adds the next question with Ctrl+Enter', async () => {
    const wrapper = await editor()
    await wrapper
      .get('fieldset[id^="game-question-"] textarea')
      .trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(wrapper.findAll('fieldset[id^="game-question-"]')).toHaveLength(4)
  })

  it('asks before removing a question with anything in it, but not a blank one', async () => {
    const wrapper = await editor()
    const count = () => wrapper.findAll('fieldset[id^="game-question-"]').length
    confirm.mockReturnValue(false)
    await wrapper.get('[aria-label="Remove question 2"]').trigger('click')
    expect(confirm).toHaveBeenCalledWith("Remove question 2? This can't be undone.")
    expect(count()).toBe(3)
    await button(wrapper, 'Add question').trigger('click')
    confirm.mockClear()
    await wrapper.get('[aria-label="Remove question 4"]').trigger('click')
    expect(confirm).not.toHaveBeenCalled()
    expect(count()).toBe(3)
  })

  it('offers no paste box, only adding, duplicating and generating', async () => {
    const wrapper = await editor()
    expect(button(wrapper, 'Paste questions')).toBeUndefined()
    expect(wrapper.find('#game-paste').exists()).toBe(false)
    expect(button(wrapper, 'Add question')).toBeDefined()
    expect(button(wrapper, 'Generate with AI')).toBeDefined()
  })

  it('explains every field with an (i) button', async () => {
    const wrapper = await editor(readyGame({ questions: [readyQuestion('One')] }))
    await button(wrapper, 'Generate with AI').trigger('click')
    const names = wrapper.findAll('.le-infotip').map((tip) => tip.attributes('aria-label'))
    expect(names).toEqual([
      'About Battle title',
      'About Hearts',
      'About Monster',
      'About Topic',
      'About Language',
      'About How many',
      'About Your code',
      'About Code',
      'About Question',
      'About Answers',
      'About Keep this order',
      'About Why?',
    ])
    await wrapper.get('[aria-label="About Keep this order"]').trigger('click')
    expect(wrapper.get('.le-infotip-text').text()).toContain('All of the above')
  })

  it('holds generated questions back until each is approved', async () => {
    const wrapper = await editor(readyGame({ questions: [readyQuestion('A'), readyQuestion('B')] }))
    api.draftGameQuestions.mockResolvedValue({
      data: {
        questions: [
          { code: '', prompt: 'Made', answers: ['x', 'y'], correctIndex: 1, explanation: 'y.' },
        ],
      },
    })
    await button(wrapper, 'Generate with AI').trigger('click')
    await wrapper.get('#game-topic').setValue('Loops')
    await button(wrapper, 'Generate questions').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Generated draft')
    expect(wrapper.text()).toContain('Question 3 added.')
    expect(wrapper.text()).toContain('Question 3 is a generated draft')
    expect(button(wrapper, 'Publish to class').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="Approve question 3"]').trigger('click')
    expect(wrapper.text()).not.toContain('Generated draft')
    expect(button(wrapper, 'Publish to class').attributes('disabled')).toBeUndefined()
  })

  it('shows why generation failed and keeps the editor working', async () => {
    const wrapper = await editor()
    api.draftGameQuestions.mockRejectedValue({
      response: {
        status: 503,
        data: {
          error: {
            message:
              'Question generation is not set up. You can still write the questions yourself.',
          },
        },
      },
    })
    await button(wrapper, 'Generate with AI').trigger('click')
    await wrapper.get('#game-topic').setValue('Loops')
    await button(wrapper, 'Generate questions').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(
      'Question generation is not set up. You can still write the questions yourself.',
    )
    expect(wrapper.findAll('fieldset[id^="game-question-"]')).toHaveLength(3)
  })

  it('blocks publishing until the checklist is clear', async () => {
    const wrapper = await editor(readyGame({ title: '' }))
    const link = wrapper.findAll('a').find((a) => a.text() === 'Give the battle a title.')
    expect(link.attributes('href')).toBe('#game-title')
    expect(button(wrapper, 'Publish to class').attributes('disabled')).toBeDefined()
    await wrapper.get('#game-title').setValue('Week 3')
    expect(wrapper.text()).toContain('Everything is ready')
    expect(button(wrapper, 'Publish to class').attributes('disabled')).toBeUndefined()
  })

  it('asks before publishing, and does nothing on Cancel', async () => {
    const wrapper = await editor()
    confirm.mockReturnValue(false)
    await button(wrapper, 'Publish to class').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).toMatch(/^Publish this battle\?/)
    expect(api.publishClassroomGame).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Draft, hidden from students')
  })

  it('saves the latest edits before publishing, and then locks the fields', async () => {
    const wrapper = await editor()
    api.publishClassroomGame.mockResolvedValue({ data: {} })
    await wrapper.get('#game-title').setValue('Final title')
    await button(wrapper, 'Publish to class').trigger('click')
    await flushPromises()
    expect(api.saveClassroomGame.mock.calls[0][1].title).toBe('Final title')
    expect(api.saveClassroomGame.mock.invocationCallOrder[0]).toBeLessThan(
      api.publishClassroomGame.mock.invocationCallOrder[0],
    )
    expect(wrapper.text()).toContain('Published')
    expect(wrapper.get('.game-edit-fields').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Class results')
    // The checklist card is gone, so the bottom of the page says where to look.
    expect(wrapper.find('#game-ready-heading').exists()).toBe(false)
    expect(wrapper.get('a[href="#game-status"]').text()).toBe('top of the page')
    expect(wrapper.text()).not.toContain('Add next question')
  })

  it('does not publish when the save before it fails', async () => {
    const wrapper = await editor()
    api.saveClassroomGame.mockRejectedValue(new Error('offline'))
    await wrapper.get('#game-title').setValue('Changed')
    await button(wrapper, 'Publish to class').trigger('click')
    await flushPromises()
    expect(api.publishClassroomGame).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Could not reach the server.')
  })

  it('lists the server reasons when it refuses to publish', async () => {
    const wrapper = await editor()
    api.publishClassroomGame.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error: {
            message: 'This game is not ready to publish yet.',
            details: [{ field: 'title', message: 'Give the battle a title.' }],
          },
        },
      },
    })
    await button(wrapper, 'Publish to class').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Give the battle a title.')
  })

  it('asks before unpublishing, and unlocks the fields', async () => {
    const wrapper = await editor(readyGame({ status: 'published', version: 1 }))
    await flushPromises()
    confirm.mockReturnValue(false)
    await button(wrapper, 'Unpublish to edit').trigger('click')
    expect(api.unpublishClassroomGame).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    api.unpublishClassroomGame.mockResolvedValue({ data: {} })
    await button(wrapper, 'Unpublish to edit').trigger('click')
    await flushPromises()
    expect(wrapper.get('.game-edit-fields').attributes('disabled')).toBeUndefined()
    expect(api.saveClassroomGame).not.toHaveBeenCalled()
  })

  it('does not autosave a published game', async () => {
    const wrapper = await editor(readyGame({ status: 'published', version: 1 }))
    await settle()
    expect(wrapper.text()).not.toContain('Unsaved changes')
    expect(api.saveClassroomGame).not.toHaveBeenCalled()
  })

  it('previews the unsaved draft without calling the server, then returns to the editor', async () => {
    const wrapper = await editor()
    await wrapper.get('#game-title').setValue('Unsaved title')
    await button(wrapper, 'Preview the battle').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('nothing is recorded')
    expect(wrapper.text()).toContain('Unsaved title')
    await button(wrapper, 'Start battle').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    await button(wrapper, 'Wrong').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.text()).toContain('This question will come back.')
    expect(wrapper.find('.battle-explanation').exists()).toBe(false)
    expect(api.startGamePlay).not.toHaveBeenCalled()
    expect(api.answerGamePlay).not.toHaveBeenCalled()
    expect(button(wrapper, 'Back to editing').attributes('href')).toBe('#game-preview-button')
    await button(wrapper, 'Back to editing').trigger('click')
    await flushPromises()
    expect(wrapper.get('#game-title').element.value).toBe('Unsaved title')
    expect(button(wrapper, 'Preview the battle').attributes('id')).toBe('game-preview-button')
  })

  it('cannot preview until a question is complete', async () => {
    const wrapper = await editor(readyGame({ questions: [newQuestion()] }))
    expect(button(wrapper, 'Preview the battle').attributes('disabled')).toBeDefined()
  })
})

describe('class results', () => {
  it('shows first-try accuracy and the most common wrong answer', async () => {
    api.getClassroomGame.mockResolvedValue({
      data: { viewer: 'professor', game: readyGame({ status: 'published', version: 1 }) },
    })
    api.getClassroomGameResults.mockResolvedValue({
      data: {
        version: 1,
        studentsPlayed: 4,
        studentsDefeatedBoss: 2,
        questions: [
          {
            id: 'q1',
            prompt: 'What prints?',
            firstTryCorrect: 3,
            firstTryTotal: 4,
            topWrongAnswer: { label: 'Nine', count: 1 },
          },
          {
            id: 'q2',
            prompt: 'Unanswered',
            firstTryCorrect: 0,
            firstTryTotal: 0,
            topWrongAnswer: null,
          },
        ],
      },
    })
    const wrapper = await mountView()
    await flushPromises()
    const text = wrapper.text().replace(/\s+/g, ' ')
    expect(text).toContain('4 students have played, and 2 defeated the boss.')
    expect(text).toContain('75% correct on the first try (3 of 4).')
    expect(text).toContain('Most common wrong answer: "Nine" (1).')
    expect(text).toContain('Not answered yet.')
  })

  it('says when nobody has played', async () => {
    api.getClassroomGame.mockResolvedValue({
      data: { viewer: 'professor', game: readyGame({ status: 'published', version: 1 }) },
    })
    const wrapper = await mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('No students have played this version yet.')
  })
  it('lists each student with their attempts and best result (G11)', async () => {
    api.getClassroomGame.mockResolvedValue({
      data: { viewer: 'professor', game: readyGame({ status: 'published', version: 1 }) },
    })
    api.getClassroomGameResults.mockResolvedValue({
      data: {
        version: 1,
        studentsPlayed: 3,
        studentsDefeatedBoss: 1,
        questions: [],
        students: [
          { name: 'Abe', attempts: 2, best: 'won' },
          { name: 'Bea', attempts: 1, best: 'lost' },
          { name: 'Cal', attempts: 1, best: 'playing' },
          { name: 'Dee', attempts: 0, best: 'not-played' },
        ],
      },
    })
    const wrapper = await mountView()
    await flushPromises()
    const table = wrapper.get('table')
    expect(table.findAll('th[scope="col"]').map((cell) => cell.text())).toEqual([
      'Student',
      'Attempts',
      'Best result',
    ])
    const rows = table
      .findAll('tbody tr')
      .map((row) => row.findAll('td').map((cell) => cell.text()))
    expect(rows).toEqual([
      ['Abe', '2', 'Beat the boss'],
      ['Bea', '1', 'Ran out of hearts'],
      ['Cal', '1', 'Playing now'],
      ['Dee', '0', 'Not played yet'],
    ])
  })
})
