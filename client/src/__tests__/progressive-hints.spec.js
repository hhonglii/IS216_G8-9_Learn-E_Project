// Progressive hints on the challenge page (H-7): the server unlocks one hint per
// wrong answer and sends only those; the page lists them and links to them from
// the wrong-answer message. The API is mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ChallengeView from '../views/ChallengeView.vue'
import { getChallenge, createAttempt } from '../services/challengesApi.js'
vi.mock('../services/challengesApi.js', () => ({
  getChallenge: vi.fn(),
  createAttempt: vi.fn(),
  submitAppliedDiagnosis: vi.fn(),
}))

const challengeId = '507f1f77bcf86cd799439201'
const blank = { template: '<div />' }
const question = {
  id: 'q1',
  type: 'predict-output',
  prompt: 'What does it print?',
  options: [
    { id: 'option-1', label: '4.67' },
    { id: 'option-2', label: '6.0' },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
})
enableAutoUnmount(afterEach)

async function showChallenge({ hintCount = 2, attempt = null } = {}) {
  getChallenge.mockResolvedValue({
    data: {
      id: challengeId,
      classroomId: '507f1f77bcf86cd799439106',
      title: 'Average of exam scores',
      questions: [question],
      hintCount,
      attempt,
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/challenges/:challengeId', name: 'challenge', component: ChallengeView },
      { path: '/classrooms/:classroomId', name: 'classroom', component: blank },
      { path: '/classrooms/:classroomId/help', name: 'help-queue', component: blank },
    ],
  })
  await router.push(`/challenges/${challengeId}`)
  const wrapper = mount(ChallengeView, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { AppliedCaseForm: true } },
  })
  await flushPromises()
  return wrapper
}

const viewHints = (wrapper) => wrapper.findAll('a').filter((link) => link.text() === 'View hints')

describe('progressive hints', () => {
  it('says how hints unlock before any are earned', async () => {
    const wrapper = await showChallenge()
    const hints = wrapper.get('#challenge-hints')
    expect(hints.text()).toContain('0 of 2 unlocked.')
    expect(hints.text()).toContain('A new hint unlocks each time you get a question wrong.')
    expect(hints.find('li').exists()).toBe(false)
  })

  it('shows a hint after a wrong answer, with a link to it', async () => {
    createAttempt.mockResolvedValue({
      data: {
        id: 'a1',
        correct: false,
        questionResults: [{ questionId: 'q1', correct: false }],
        unlockedHints: ['List every value of i.'],
      },
    })
    const wrapper = await showChallenge()
    await wrapper.get('select').setValue('option-1')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Submit answer')
      .trigger('click')
    await flushPromises()

    const hints = wrapper.get('#challenge-hints')
    expect(hints.findAll('li').map((item) => item.text())).toEqual(['List every value of i.'])
    expect(hints.text()).toContain('1 of 2 unlocked.')
    expect(viewHints(wrapper)[0].attributes('href')).toBe('#challenge-hints')
    expect(hints.attributes('tabindex')).toBe('-1')
  })

  it('says when every hint is unlocked', async () => {
    const wrapper = await showChallenge({
      attempt: {
        id: 'a1',
        questionResults: [{ questionId: 'q1', correct: false }],
        unlockedHints: ['First', 'Second'],
      },
    })
    expect(wrapper.get('#challenge-hints').text()).toContain('Every hint is unlocked.')
  })

  it('has no hints card when the challenge has no hints', async () => {
    const wrapper = await showChallenge({ hintCount: 0 })
    expect(wrapper.find('#challenge-hints').exists()).toBe(false)
    expect(viewHints(wrapper)).toHaveLength(0)
  })
})
