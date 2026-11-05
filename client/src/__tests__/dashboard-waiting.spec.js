// Tests for H3 Step 12, "Waiting on you".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import { routes } from '../router/index.js'
import { getProfile } from '../services/usersApi.js'
import { getWaitingOnMe } from '../services/classroomsApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'

vi.mock('../services/usersApi.js', () => ({ getProfile: vi.fn() }))
vi.mock('../services/classroomsApi.js', () => ({
  getWaitingOnMe: vi.fn(),
  createClassroom: vi.fn(),
  joinClassroom: vi.fn(),
}))

const { currentUser } = useCurrentUser()
function logIn(id, role = 'professor') {
  currentUser.value = { id, username: id, displayName: id, role }
}
function row(fields) {
  return {
    classroomId: 'c1',
    classroomName: 'Loops',
    pendingDiagnoses: 0,
    pendingGroups: 0,
    openHelpRequests: 0,
    oldestWaitingAt: null,
    ...fields,
  }
}
function mountDashboard() {
  const page = { template: '<p>page</p>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: routes.map((route) => ({ ...route, component: page })),
  })
  return mount(DashboardView, { global: { plugins: [router] } })
}
const section = (wrapper) => wrapper.find('section[aria-labelledby="waiting-heading"]')
const links = (wrapper) =>
  section(wrapper)
    .findAll('a')
    .map((a) => `${a.text()} -> ${a.attributes('href')}`)

beforeEach(() => {
  vi.resetAllMocks()
  getProfile.mockResolvedValue({ data: { classrooms: [] } })
})
enableAutoUnmount(afterEach)
afterEach(() => {
  currentUser.value = null
})

describe('Waiting on you', () => {
  it('shows a student their returned work and the hints waiting on their verdict', async () => {
    logIn('s1', 'student')
    getWaitingOnMe.mockResolvedValue({
      data: [
        {
          classroomId: 'c1',
          classroomName: 'Loops',
          returnedDiagnoses: [{ challengeId: 'ch1', title: 'Off by one' }],
          returnedProjects: [{ miniProjectId: 'm1', title: 'Loop kit' }],
          hintsToCheck: 2,
          oldestWaitingAt: '2026-10-04T00:00:00.000Z',
        },
      ],
    })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(links(wrapper)).toEqual([
      'Loops: your diagnosis for "Off by one" was returned. Fix it and send it again. -> /challenges/ch1',
      'Loops: your group\'s work on "Loop kit" was returned. Fix it and submit again. -> /mini-projects/m1',
      'Loops: mentors sent you 2 hints. Say if they helped. -> /classrooms/c1/help',
    ])
  })

  // UX audit item 10: what is new for a student, after what needs fixing.
  it('tells a student about new challenges, approvals and classmates they can help', async () => {
    logIn('s1', 'student')
    getWaitingOnMe.mockResolvedValue({
      data: [
        {
          classroomId: 'c1',
          classroomName: 'Loops',
          returnedDiagnoses: [],
          returnedProjects: [],
          hintsToCheck: 0,
          requestsToHelp: 2,
          newChallenges: [{ challengeId: 'ch2', title: 'Fence posts' }],
          approvedDiagnoses: [{ challengeId: 'ch1', title: 'Off by one' }],
          oldestWaitingAt: '2026-10-02T00:00:00.000Z',
        },
        {
          classroomId: 'c2',
          classroomName: 'Arrays',
          returnedDiagnoses: [],
          returnedProjects: [],
          hintsToCheck: 0,
          requestsToHelp: 1,
          newChallenges: [],
          approvedDiagnoses: [],
          oldestWaitingAt: '2026-10-03T00:00:00.000Z',
        },
      ],
    })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(links(wrapper)).toEqual([
      'Loops: 2 classmates asked about challenges you finished. You can help. -> /classrooms/c1/help',
      'Loops: new challenge "Fence posts". You haven\'t started it yet. -> /challenges/ch2',
      'Loops: your diagnosis for "Off by one" was approved. You can now help classmates with it. -> /classrooms/c1/help',
      'Arrays: a classmate asked about a challenge you finished. You can help. -> /classrooms/c2/help',
    ])
  })

  it('tells a student when nothing is waiting on them', async () => {
    logIn('s1', 'student')
    getWaitingOnMe.mockResolvedValue({
      data: [
        {
          classroomId: 'c1',
          classroomName: 'Loops',
          returnedDiagnoses: [],
          returnedProjects: [],
          hintsToCheck: 0,
          oldestWaitingAt: null,
        },
      ],
    })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(section(wrapper).text()).toContain('Nothing is waiting on you.')
  })

  it('shows Loading... until the list arrives', async () => {
    logIn('p1')
    getWaitingOnMe.mockReturnValue(new Promise(() => {}))
    const wrapper = mountDashboard()
    await flushPromises()
    expect(section(wrapper).get('h3').text()).toBe('Waiting on you')
    expect(section(wrapper).text()).toContain('Loading...')
  })

  it('gives each waiting kind its own row and link, in the order the server sent', async () => {
    logIn('p1')
    getWaitingOnMe.mockResolvedValue({
      data: [
        row({
          classroomId: 'c2',
          classroomName: 'Arrays',
          pendingDiagnoses: 1,
          openHelpRequests: 3,
        }),
        row({ pendingDiagnoses: 2, pendingGroups: 1 }),
      ],
    })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(links(wrapper)).toEqual([
      'Arrays: 1 applied diagnosis to review -> /classrooms/c2/review',
      'Arrays: 3 open help requests -> /classrooms/c2/help',
      'Loops: 2 applied diagnoses to review -> /classrooms/c1/review',
      'Loops: 1 group project submitted -> /classrooms/c1/review',
    ])
  })

  it('uses the singular and plural for groups and help requests', async () => {
    logIn('p1')
    getWaitingOnMe.mockResolvedValue({ data: [row({ pendingGroups: 2, openHelpRequests: 1 })] })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(links(wrapper)).toEqual([
      'Loops: 2 group projects submitted -> /classrooms/c1/review',
      'Loops: 1 open help request -> /classrooms/c1/help',
    ])
  })

  it.each([
    ['no classrooms', []],
    ['classrooms with nothing waiting', [row({}), row({ classroomId: 'c2' })]],
  ])('says nothing is waiting when there are %s', async (_, data) => {
    logIn('p1')
    getWaitingOnMe.mockResolvedValue({ data })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(section(wrapper).text()).toContain('Nothing is waiting on you.')
    expect(section(wrapper).find('ul').exists()).toBe(false)
  })

  it("shows the server's message as an alert when the list fails", async () => {
    logIn('p1')
    getWaitingOnMe.mockRejectedValue({
      response: { data: { error: { message: 'Log in to see what is waiting on you.' } } },
    })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(section(wrapper).get('[role="alert"]').text()).toBe(
      'Log in to see what is waiting on you.',
    )
    expect(section(wrapper).text()).not.toContain('Loading...')
  })

  it('falls back to its own message when the server sends none', async () => {
    logIn('p1')
    getWaitingOnMe.mockRejectedValue({ response: { status: 500, data: {} } })
    const wrapper = mountDashboard()
    await flushPromises()
    expect(section(wrapper).get('[role="alert"]').text()).toBe(
      "Couldn't load what is waiting on you.",
    )
  })

  it('says the server could not be reached when no answer came back', async () => {
    logIn('p1')
    getWaitingOnMe.mockRejectedValue(new Error('Network Error'))
    const wrapper = mountDashboard()
    await flushPromises()
    expect(section(wrapper).get('[role="alert"]').text()).toBe('Could not reach the server.')
  })

  it("never shows an earlier professor's list after someone else logs in", async () => {
    let answerFirst
    getWaitingOnMe
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce({ data: [row({ classroomName: 'Second', openHelpRequests: 1 })] })
    logIn('p1')
    const wrapper = mountDashboard()
    await flushPromises()
    logIn('p2')
    await flushPromises()
    answerFirst({ data: [row({ classroomName: 'First', pendingDiagnoses: 4 })] })
    await flushPromises()
    expect(links(wrapper)).toEqual(['Second: 1 open help request -> /classrooms/c1/help'])
    expect(getWaitingOnMe).toHaveBeenCalledTimes(2)
  })
})
