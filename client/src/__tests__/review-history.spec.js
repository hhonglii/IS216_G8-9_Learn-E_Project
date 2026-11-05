// UX audit item 14: the review page shows what a diagnosis is compared
// against, what approving does, and the decisions already made. API mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProfessorReviewView from '../views/ProfessorReviewView.vue'
import { getInsights } from '../services/classroomsApi.js'
vi.mock('../services/classroomsApi.js', () => ({ getInsights: vi.fn() }))
vi.mock('../services/challengesApi.js', () => ({ reviewAttempt: vi.fn() }))
vi.mock('../services/groupsApi.js', () => ({ reviewGroup: vi.fn() }))

const classroomId = '507f1f77bcf86cd799439106'
const blank = { template: '<div />' }
const pending = {
  id: 'p1',
  studentId: 's1',
  studentName: 'Bob',
  challengeTitle: 'Loops',
  appliedCasePrompt: 'A shop loop skips the last item. Why?',
  officialExplanation: 'The loop stops one early.',
  appliedDiagnosis: 'Use <=',
  submittedAt: '2026-11-04T01:00:00.000Z',
}
const reviewedAttempts = [
  {
    id: 'a1',
    studentId: 's2',
    studentName: 'Alice',
    challengeTitle: 'Loops',
    appliedDiagnosis: 'The bound is one short.',
    feedback: '',
    reviewStatus: 'approved',
    reviewedAt: '2026-11-03T01:00:00.000Z',
  },
  {
    id: 'a2',
    studentId: 's3',
    studentName: 'Cara',
    challengeTitle: 'Loops',
    appliedDiagnosis: 'Something with the loop',
    feedback: 'Say which comparison is wrong.',
    reviewStatus: 'returned',
    reviewedAt: '2026-11-02T01:00:00.000Z',
  },
]
const reviewedGroups = [
  {
    id: 'g1',
    name: 'Team Magma',
    miniProjectTitle: 'Cart',
    members: [{ id: 's1', displayName: 'Bob' }],
    feedback: 'Great tests.',
    submissionStatus: 'approved',
    reviewedAt: '2026-11-03T01:00:00.000Z',
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  getInsights.mockResolvedValue({
    data: {
      classroomId,
      pendingAppliedAttempts: [pending],
      pendingGroups: [],
      reviewedAttempts,
      reviewedGroups,
      summary: null,
    },
  })
})
enableAutoUnmount(afterEach)

async function showReview() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/classrooms/:classroomId/review', component: ProfessorReviewView },
      { path: '/classrooms/:classroomId', name: 'classroom', component: blank },
    ],
  })
  await router.push(`/classrooms/${classroomId}/review`)
  const wrapper = mount(ProfessorReviewView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const button = (wrapper, text) => wrapper.findAll('button').find((b) => b.text().startsWith(text))

describe('reviewing a diagnosis (UX audit item 14)', () => {
  it('shows the prompt and the official explanation beside the diagnosis', async () => {
    const wrapper = await showReview()
    await button(wrapper, 'Review').trigger('click')
    const text = wrapper.text()
    expect(text).toContain('Applied-case prompt')
    expect(text).toContain('A shop loop skips the last item. Why?')
    expect(text).toContain('Official explanation')
    expect(text).toContain('The loop stops one early.')
    expect(text).toContain('Use <=')
  })

  it('says what approving does, under the decision', async () => {
    const wrapper = await showReview()
    await button(wrapper, 'Review').trigger('click')
    const approve = wrapper.get('#approveDecision').element.closest('.form-check')
    expect(approve.textContent).toContain(
      "Completes the challenge for them, and lets them answer classmates' questions on it",
    )
  })
})

describe('the decisions already made (UX audit item 14)', () => {
  it('counts both lists and starts on the waiting ones', async () => {
    const wrapper = await showReview()
    expect(wrapper.get('label[for="diagnoses-waiting"]').text()).toBe('Waiting (1)')
    expect(wrapper.get('label[for="diagnoses-reviewed"]').text()).toBe('Reviewed (2)')
    expect(wrapper.get('label[for="groups-reviewed"]').text()).toBe('Reviewed (1)')
    expect(wrapper.text()).toContain('1 pending submission')
    expect(wrapper.text()).not.toContain('Cara')
  })

  it('lists reviewed diagnoses with their decision and opens one read-only', async () => {
    const wrapper = await showReview()
    await wrapper.get('#diagnoses-reviewed').setValue(true)
    expect(wrapper.text()).not.toContain('1 pending submission')
    const rows = wrapper.findAll('.le-row')
    expect(rows.map((row) => row.get('.badge').text())).toEqual([
      'Decision: Approved',
      'Decision: Returned',
    ])

    const show = button(rows[1], 'Show')
    expect(show.attributes('aria-expanded')).toBe('false')
    await show.trigger('click')
    expect(show.attributes('aria-expanded')).toBe('true')
    const card = wrapper.get('section[aria-labelledby="reviewed-diagnosis-heading"]')
    expect(card.text()).toContain('Cara, Loops')
    expect(card.text()).toContain(
      'It moves back to Waiting when the student sends a new diagnosis.',
    )
    expect(card.text()).toContain('Say which comparison is wrong.')
    expect(card.find('textarea').exists()).toBe(false)

    await button(rows[1], 'Hide').trigger('click')
    expect(wrapper.find('section[aria-labelledby="reviewed-diagnosis-heading"]').exists()).toBe(
      false,
    )
  })

  it('says "No feedback given." when there was none', async () => {
    const wrapper = await showReview()
    await wrapper.get('#diagnoses-reviewed').setValue(true)
    await button(wrapper.findAll('.le-row')[0], 'Show').trigger('click')
    expect(wrapper.get('section[aria-labelledby="reviewed-diagnosis-heading"]').text()).toContain(
      'No feedback given.',
    )
  })

  it('lists reviewed group projects with their members and feedback', async () => {
    const wrapper = await showReview()
    await wrapper.get('#groups-reviewed').setValue(true)
    await button(wrapper, 'Show').trigger('click')
    const text = wrapper.text()
    expect(text).toContain('Team Magma, Cart')
    expect(text).toContain('Bob')
    expect(text).toContain('Great tests.')
  })
})
