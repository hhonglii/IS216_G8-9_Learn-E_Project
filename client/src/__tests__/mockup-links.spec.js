// Tests for the 2026-10-30 redesign mockup changes: the answer
// result region and its Ask a classmate link, the remaining-answers line on the
// challenge page, and the back link on Professor Review. The API is mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ChallengeView from '../views/ChallengeView.vue'
import ProfessorReviewView from '../views/ProfessorReviewView.vue'
import { getChallenge } from '../services/challengesApi.js'
import { getInsights } from '../services/classroomsApi.js'
vi.mock('../services/challengesApi.js', () => ({
  getChallenge: vi.fn(),
  createAttempt: vi.fn(),
  submitAppliedDiagnosis: vi.fn(),
  reviewAttempt: vi.fn(),
}))
vi.mock('../services/classroomsApi.js', () => ({ getInsights: vi.fn() }))
vi.mock('../services/groupsApi.js', () => ({ reviewGroup: vi.fn() }))

const classroomId = '507f1f77bcf86cd799439106'
const challengeId = '507f1f77bcf86cd799439201'
const blank = { template: '<div />' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/challenges/:challengeId', name: 'challenge', component: ChallengeView },
      { path: '/classrooms/:classroomId', name: 'classroom', component: blank },
      { path: '/classrooms/:classroomId/help', name: 'help-queue', component: blank },
      { path: '/classrooms/:classroomId/review', component: ProfessorReviewView },
    ],
  })
}

async function showChallenge(attempt) {
  getChallenge.mockResolvedValue({
    data: {
      id: challengeId,
      classroomId,
      title: 'Off-by-one in the score loop',
      questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
      attempt,
    },
  })
  const router = makeRouter()
  await router.push(`/challenges/${challengeId}`)
  const wrapper = mount(ChallengeView, {
    global: {
      plugins: [router],
      stubs: { QuestionRenderer: true, ChallengeProgress: true, AppliedCaseForm: true },
    },
  })
  await flushPromises()
  return wrapper
}

const attemptWith = (questionResults, structuredScore) => ({
  id: 'a1',
  reviewStatus: 'not-submitted',
  structuredScore,
  structuredComplete: false,
  questionResults,
})

beforeEach(() => vi.resetAllMocks())
enableAutoUnmount(afterEach)

describe('answer result on the challenge page', () => {
  it('keeps one status region per question, even before any answer', async () => {
    const wrapper = await showChallenge(null)
    expect(wrapper.findAll('[role="status"]')).toHaveLength(3)
    expect(wrapper.text()).not.toContain('Ask a classmate')
  })

  it('offers Ask a classmate after a wrong answer, with this challenge and question in the address', async () => {
    const wrapper = await showChallenge(attemptWith([{ questionId: 'q1', correct: false }], 0))
    const link = wrapper.get('a.alert-link')
    expect(link.text()).toBe('Ask a classmate for a hint')
    expect(link.attributes('href')).toBe(
      `/classrooms/${classroomId}/help?challenge=${challengeId}&question=q1`,
    )
  })

  it('does not offer it after a correct answer', async () => {
    const wrapper = await showChallenge(attemptWith([{ questionId: 'q1', correct: true }], 1))
    expect(wrapper.text()).toContain('Correct answer!')
    expect(wrapper.find('a.alert-link').exists()).toBe(false)
  })
})

describe('locked applied diagnosis', () => {
  it.each([
    [0, 'Unlocks after 3 more correct answers.'],
    [2, 'Unlocks after 1 more correct answer.'],
  ])('with %i correct says %s', async (score, sentence) => {
    const wrapper = await showChallenge(attemptWith([], score))
    expect(wrapper.text()).toContain(sentence)
  })
})

describe('Professor Review header', () => {
  it('links back to its classroom', async () => {
    getInsights.mockResolvedValue({
      data: { classroomId, pendingAppliedAttempts: [], pendingGroups: [], summary: null },
    })
    const router = makeRouter()
    await router.push(`/classrooms/${classroomId}/review`)
    const wrapper = mount(ProfessorReviewView, { global: { plugins: [router] } })
    await flushPromises()
    const back = wrapper.get('a.le-back-link')
    expect(back.text()).toBe('Back to classroom')
    expect(back.attributes('href')).toBe(`/classrooms/${classroomId}`)
  })
})
