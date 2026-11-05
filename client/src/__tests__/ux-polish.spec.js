// UX audit priority 4 (polish), items 24, 25, 28, 30 and 31: plurals, dates,
// the diagnosis button, the dashboard's empty state and example hints. The
// API is mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { formatDate, formatDateTime } from '../utils/formatDate.js'
import AppliedCaseForm from '../components/challenges/AppliedCaseForm.vue'
import MiniProjectBuilder from '../components/projects/MiniProjectBuilder.vue'
import ProfessorReviewView from '../views/ProfessorReviewView.vue'
import DashboardView from '../views/DashboardView.vue'
import HelpQueueView from '../views/HelpQueueView.vue'
import { routes } from '../router/index.js'
import { getInsights, getClassroom, getWaitingOnMe } from '../services/classroomsApi.js'
import { getProfile } from '../services/usersApi.js'
import { listHelpRequests } from '../services/helpRequestsApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
vi.mock('../services/classroomsApi.js', () => ({
  getInsights: vi.fn(),
  getClassroom: vi.fn(),
  getWaitingOnMe: vi.fn(),
  createClassroom: vi.fn(),
  joinClassroom: vi.fn(),
}))
vi.mock('../services/challengesApi.js', () => ({ reviewAttempt: vi.fn() }))
vi.mock('../services/groupsApi.js', () => ({ reviewGroup: vi.fn() }))
vi.mock('../services/usersApi.js', () => ({ getProfile: vi.fn() }))
vi.mock('../services/helpRequestsApi.js', () => ({ listHelpRequests: vi.fn() }))

const classroomId = '507f1f77bcf86cd799439106'
const { currentUser } = useCurrentUser()
const blank = { template: '<div />' }

beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  currentUser.value = null
})
enableAutoUnmount(afterEach)

describe('dates (UX audit 25)', () => {
  it('names the month, so 4 November cannot be read as April 11', () => {
    expect(formatDateTime(new Date(2026, 10, 4, 9, 53, 47).toISOString())).toBe(
      '4 Nov 2026, 9:53 am',
    )
    expect(formatDateTime(new Date(2026, 10, 4, 21, 5))).toBe('4 Nov 2026, 9:05 pm')
    expect(formatDate(new Date(2026, 10, 4, 9, 53).toISOString())).toBe('4 Nov 2026')
  })

  it('shows nothing for a missing or unreadable date', () => {
    for (const value of [undefined, null, '', 'not a date']) {
      expect(formatDateTime(value)).toBe('')
      expect(formatDate(value)).toBe('')
    }
  })
})

describe('the diagnosis button (UX audit 28)', () => {
  it('says Submit until a diagnosis is sent, then Update', async () => {
    const wrapper = mount(AppliedCaseForm, { props: { appliedCase: 'A case' } })
    expect(wrapper.get('button').text()).toBe('Submit diagnosis')
    await wrapper.setProps({ sent: true })
    expect(wrapper.get('button').text()).toBe('Update diagnosis')
  })
})

describe('the review page (UX audits 23, 24 and 25)', () => {
  const attempt = (id) => ({
    id,
    studentId: `s-${id}`,
    studentName: `Student ${id}`,
    challengeTitle: 'Loops',
    submittedAt: new Date(2026, 10, 4, 9, 53, 47).toISOString(),
  })
  const group = (id) => ({ id, name: `Team ${id}`, miniProjectTitle: 'Cart', members: [] })

  async function showReview(pendingAppliedAttempts, pendingGroups) {
    getInsights.mockResolvedValue({
      data: { classroomId, pendingAppliedAttempts, pendingGroups, summary: null },
    })
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
  const counts = (wrapper) =>
    wrapper
      .findAll('p.text-muted')
      .map((p) => p.text())
      .filter((text) => /^\d/.test(text))

  it('uses real plurals for the counts', async () => {
    expect(counts(await showReview([attempt('a')], [group('g')]))).toEqual([
      '1 pending submission',
      '1 group project waiting for review',
    ])
    expect(
      counts(await showReview([attempt('a'), attempt('b')], [group('g'), group('h')])),
    ).toEqual(['2 pending submissions', '2 group projects waiting for review'])
    expect(counts(await showReview([], []))).toEqual([
      '0 pending submissions',
      '0 group projects waiting for review',
    ])
  })

  it('dates a submission with the month as a word', async () => {
    const wrapper = await showReview([attempt('a')], [])
    expect(wrapper.text()).toContain('Last updated: 4 Nov 2026, 9:53 am')
  })

  it('labels the decisions in sentence case', async () => {
    const wrapper = await showReview([attempt('a')], [])
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Review')
      .trigger('click')
    expect(wrapper.get('label[for="approveDecision"]').text()).toBe('Approve diagnosis')
    expect(wrapper.get('label[for="returnDecision"]').text()).toBe('Return for corrections')
    expect(wrapper.get('label[for="professorFeedback"]').text()).toBe('Professor feedback')
  })
})

describe("the dashboard's empty state (UX audit 30)", () => {
  async function emptyDashboardAs(role) {
    currentUser.value = { id: 'u1', username: 'u1', displayName: 'U', role }
    getProfile.mockResolvedValue({ data: { classrooms: [] } })
    getWaitingOnMe.mockResolvedValue({ data: [] })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes.map((route) => ({ ...route, component: blank })),
    })
    const wrapper = mount(DashboardView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper.get('.le-empty')
  }

  it('tells a professor to create a classroom', async () => {
    const empty = await emptyDashboardAs('professor')
    expect(empty.get('h3').text()).toBe('No classrooms yet')
    expect(empty.get('p').text()).toBe(
      'Create your first classroom in New classroom above, then give students its join code.',
    )
  })

  it('tells a student to ask for a join code', async () => {
    const empty = await emptyDashboardAs('student')
    expect(empty.get('p').text()).toBe(
      'Ask your professor for a join code and enter it in Join classroom above.',
    )
  })
})

describe('a reopened help request (UX audit 24)', () => {
  it.each([
    [1, 'Reopened 1 time.'],
    [3, 'Reopened 3 times.'],
  ])('reads naturally with a reopen count of %i', async (reopenCount, text) => {
    currentUser.value = { id: 'asker', role: 'student' }
    getClassroom.mockResolvedValue({ data: { challenges: [] } })
    listHelpRequests.mockResolvedValue({
      data: [
        {
          id: 'r1',
          status: 'open',
          hintType: 'Guiding question',
          challengeTitle: 'Loops',
          requesterId: 'asker',
          requesterName: 'Ana',
          reopenCount,
        },
      ],
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/classrooms/:classroomId/help', component: HelpQueueView },
        { path: '/profiles/:userId', name: 'profile', component: { template: '<p />' } },
      ],
    })
    await router.push(`/classrooms/${classroomId}/help`)
    const wrapper = mount(HelpQueueView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Open request')
      .trigger('click')
    expect(
      wrapper
        .findAll('p')
        .find((p) => p.text().startsWith('Reopened'))
        .text(),
    ).toBe(text)
  })
})

describe('acceptance criteria example (UX audit 31)', () => {
  it('shows an example and reads it with every criterion box', () => {
    const wrapper = mount(MiniProjectBuilder)
    expect(wrapper.get('#acceptance-criteria-hint').text()).toBe(
      'One checkable statement per box. For example: "Adding an item updates the cart total."',
    )
    expect(wrapper.get('#acceptance-criterion-0').attributes('aria-describedby')).toBe(
      'acceptance-criteria-hint',
    )
  })
})
