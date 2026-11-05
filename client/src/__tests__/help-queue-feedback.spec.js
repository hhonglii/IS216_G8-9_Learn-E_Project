// Third-pass audit F and L: the help queue says what the last action did, and
// the caption speaks to whoever has to act next. API mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import HelpQueueView from '../views/HelpQueueView.vue'
import HelpRequestForm from '../components/mentoring/HelpRequestForm.vue'
import {
  listHelpRequests,
  createHelpRequest,
  claimHelpRequest,
  respondToHelpRequest,
} from '../services/helpRequestsApi.js'
import { getClassroom } from '../services/classroomsApi.js'
import { getChallenge } from '../services/challengesApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
vi.mock('../services/helpRequestsApi.js', () => ({
  listHelpRequests: vi.fn(),
  createHelpRequest: vi.fn(),
  claimHelpRequest: vi.fn(),
  respondToHelpRequest: vi.fn(),
  resolveHelpRequest: vi.fn(),
  unclaimHelpRequest: vi.fn(),
  withdrawHelpRequest: vi.fn(),
}))
vi.mock('../services/classroomsApi.js', () => ({ getClassroom: vi.fn() }))
vi.mock('../services/challengesApi.js', () => ({ getChallenge: vi.fn() }))

const classroomId = '507f1f77bcf86cd799439106'
const askerId = '507f1f77bcf86cd799439401'
const mentorId = '507f1f77bcf86cd799439402'
const requestId = '507f1f77bcf86cd799439301'
const { currentUser } = useCurrentUser()

function helpRequest(fields = {}) {
  return {
    id: requestId,
    status: 'open',
    hintType: 'Guiding question',
    expectedBehaviour: 'It prints 6.0',
    actualBehaviour: 'It prints 4.67 instead of 6.0',
    challengeTitle: 'Average of exam scores',
    requesterId: askerId,
    requesterName: 'Marcus Lee',
    mentorId: null,
    reopenCount: 0,
    canClaim: false,
    ...fields,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  getClassroom.mockResolvedValue({ data: { challenges: [] } })
})
afterEach(() => {
  currentUser.value = null
  vi.restoreAllMocks()
})
enableAutoUnmount(afterEach)

async function showQueueAs(userId) {
  currentUser.value = { id: userId, role: 'student' }
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
  return wrapper
}
const button = (wrapper, name) => wrapper.findAll('button').find((b) => b.text() === name)

const caption = (wrapper) => wrapper.get('.le-queue-caption').text()
const status = (wrapper) => wrapper.findAll('[role="status"]').map((node) => node.text())

describe('help queue feedback', () => {
  it('confirms a sent request beside the form', async () => {
    getClassroom.mockResolvedValue({ data: { challenges: [{ id: 'c1', title: 'Loops' }] } })
    listHelpRequests.mockResolvedValue({ data: [] })
    createHelpRequest.mockResolvedValue({ data: {} })
    getChallenge.mockResolvedValue({
      data: {
        questions: [
          { id: 'q1', prompt: 'What prints?' },
          { id: 'q2', prompt: 'Which line?' },
        ],
      },
    })
    const wrapper = await showQueueAs(askerId)
    await wrapper.get('#challenge-pick').setValue('c1')
    await flushPromises()
    await wrapper.get('#question-pick').setValue('q2')
    wrapper
      .getComponent(HelpRequestForm)
      .vm.$emit('submit', { contextType: 'challenge', contextId: 'c1', questionId: 'q2' })
    await flushPromises()
    expect(status(wrapper)).toContain(
      'Sent your help request about question 2 of "Loops". A mentor will pick it up.',
    )
  })

  it('confirms a sent general class help request', async () => {
    listHelpRequests.mockResolvedValue({ data: [] })
    createHelpRequest.mockResolvedValue({ data: {} })
    const wrapper = await showQueueAs(askerId)
    await wrapper.get('#help-kind-general').setValue(true)
    wrapper
      .getComponent(HelpRequestForm)
      .vm.$emit('submit', { contextType: 'classroom', contextId: classroomId })
    await flushPromises()
    expect(status(wrapper)).toContain(
      'Sent your general class help request. A classmate will pick it up.',
    )
  })

  it('opens a claimed request and tells the mentor it is theirs', async () => {
    listHelpRequests.mockResolvedValue({ data: [helpRequest({ canClaim: true })] })
    const wrapper = await showQueueAs(mentorId)
    claimHelpRequest.mockResolvedValue({ data: {} })
    listHelpRequests.mockResolvedValue({ data: [helpRequest({ status: 'claimed', mentorId })] })
    await button(wrapper, 'Claim request').trigger('click')
    await flushPromises()
    expect(wrapper.find('#hint').exists()).toBe(true)
    expect(caption(wrapper)).toBe('You claimed this. Write your hint below.')
    expect(status(wrapper)).toContain('You claimed this request.')
  })

  it('labels a second hint Update hint and says it replaces the first', async () => {
    listHelpRequests.mockResolvedValue({
      data: [helpRequest({ status: 'responded', mentorId, mentorResponse: 'Check i.' })],
    })
    respondToHelpRequest.mockResolvedValue({ data: {} })
    const wrapper = await showQueueAs(mentorId)
    expect(caption(wrapper)).toBe('You sent a hint. Waiting for the asker to say if it helped.')
    await button(wrapper, 'Open request').trigger('click')
    expect(wrapper.get('#hint-count').text()).toContain('Sending again replaces your hint.')
    await wrapper.get('#hint').setValue('Check the last i.')
    await button(wrapper, 'Update hint').trigger('click')
    await flushPromises()
    expect(status(wrapper)).toContain('Updated your hint.')
  })

  it("tells the asker their mentor's hint is waiting on them", async () => {
    listHelpRequests.mockResolvedValue({
      data: [helpRequest({ status: 'responded', mentorId, mentorResponse: 'Check i.' })],
    })
    const wrapper = await showQueueAs(askerId)
    expect(caption(wrapper)).toBe('Your mentor sent a hint. Open it to say if it helped.')
  })
})
