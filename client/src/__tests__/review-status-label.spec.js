// Tests for H3 Step 1: the review status labels in ChallengeView.vue. The API is
// mocked.
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ChallengeView from '../views/ChallengeView.vue'
import AppliedCaseForm from '../components/challenges/AppliedCaseForm.vue'
import { getChallenge } from '../services/challengesApi.js'
vi.mock('../services/challengesApi.js', () => ({
  getChallenge: vi.fn(),
  createAttempt: vi.fn(),
  submitAppliedDiagnosis: vi.fn(),
}))

const challengeId = '507f1f77bcf86cd799439201'
const blank = { template: '<div />' }

async function showChallenge(attempt) {
  getChallenge.mockResolvedValue({
    data: {
      id: challengeId,
      classroomId: '507f1f77bcf86cd799439106',
      title: 'Off-by-one in the score loop',
      questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
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
    global: { plugins: [router], stubs: { QuestionRenderer: true, AppliedCaseForm: true } },
  })
  await flushPromises()
  return wrapper
}

// The progress line, "<score> of <total> questions · <status>".
const progressLine = async (attempt) =>
  (await showChallenge(attempt))
    .findAll('p')
    .find((p) => p.text().includes('questions ·'))
    .text()

const attempt = (reviewStatus) => ({
  id: 'a1',
  reviewStatus,
  structuredScore: 3,
  structuredComplete: true,
  questionResults: [],
})

beforeEach(() => vi.resetAllMocks())
enableAutoUnmount(afterEach)

it.each([
  ['not-submitted', 'No diagnosis sent yet.'],
  ['pending', 'Diagnosis sent, waiting for the professor.'],
  ['approved', 'Approved, challenge is complete.'],
  ['returned', 'Diagnosis submission has been returned with feedback.'],
])('shows the %s review status as words, not the stored code', async (code, label) => {
  expect(await progressLine(attempt(code))).toBe(`3 of 3 questions · ${label}`)
})

it('shows the not-submitted words before the student has an attempt', async () => {
  expect(await progressLine(null)).toBe('0 of 3 questions · No diagnosis sent yet.')
})

it('falls back to the stored code for a status it has no words for', async () => {
  expect(await progressLine(attempt('archived'))).toBe('3 of 3 questions · archived')
})

// The labels are for display only: the page must still compare the stored codes.
it('still locks the answers while a diagnosis is pending', async () => {
  const wrapper = await showChallenge(attempt('pending'))
  expect(wrapper.text()).toContain('Structured answers are locked while your diagnosis is pending')
  const fieldsets = wrapper.findAll('fieldset')
  expect(fieldsets).toHaveLength(3)
  for (const fieldset of fieldsets) {
    expect(fieldset.attributes('disabled')).toBeDefined()
  }
})

// UX audit 28: once a diagnosis is sent, the form's button says Update.
it.each([
  ['not-submitted', false],
  ['pending', true],
  ['returned', true],
])('tells the diagnosis form it was sent when the status is %s: %s', async (code, sent) => {
  const wrapper = await showChallenge(attempt(code))
  expect(wrapper.findComponent(AppliedCaseForm).props('sent')).toBe(sent)
})
