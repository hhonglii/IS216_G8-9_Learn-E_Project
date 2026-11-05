// The two ways back out of the help queue: the asker withdraws a request nobody
// has claimed (UX audit A2), and a mentor gives a claimed request back before
// sending a hint (UX audit A3). API mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import HelpQueueView from '../views/HelpQueueView.vue'
import {
  listHelpRequests,
  unclaimHelpRequest,
  withdrawHelpRequest,
} from '../services/helpRequestsApi.js'
import { getClassroom } from '../services/classroomsApi.js'
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

describe('withdrawing a help request (UX audit A2)', () => {
  it("shows Withdraw only on the asker's own open request", async () => {
    listHelpRequests.mockResolvedValue({ data: [helpRequest()] })
    expect(button(await showQueueAs(askerId), 'Withdraw request')).toBeDefined()
    expect(button(await showQueueAs(mentorId), 'Withdraw request')).toBeUndefined()
    listHelpRequests.mockResolvedValue({
      data: [helpRequest({ status: 'claimed', mentorId })],
    })
    expect(button(await showQueueAs(askerId), 'Withdraw request')).toBeUndefined()
  })

  it('asks first and sends nothing when the asker cancels', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    listHelpRequests.mockResolvedValue({ data: [helpRequest()] })
    const wrapper = await showQueueAs(askerId)
    await button(wrapper, 'Withdraw request').trigger('click')
    expect(confirm).toHaveBeenCalledWith(
      'Withdraw your help request about "Average of exam scores"? This can\'t be undone.',
    )
    expect(withdrawHelpRequest).not.toHaveBeenCalled()
  })

  it('withdraws, reloads so the request and its details are gone, and says what happened', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    withdrawHelpRequest.mockResolvedValue({ data: { id: requestId, withdrawn: true } })
    listHelpRequests.mockResolvedValue({ data: [helpRequest()] })
    const wrapper = await showQueueAs(askerId)
    await button(wrapper, 'Open request').trigger('click')
    expect(wrapper.find(`#request-details-${requestId}`).exists()).toBe(true)
    listHelpRequests.mockResolvedValue({ data: [] })
    await button(wrapper, 'Withdraw request').trigger('click')
    await flushPromises()
    expect(withdrawHelpRequest).toHaveBeenCalledWith(requestId)
    expect(wrapper.find(`#request-details-${requestId}`).exists()).toBe(false)
    expect(wrapper.text()).toContain('No help requests yet.')
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Withdrew your help request about "Average of exam scores".',
    )
  })

  it('explains a refusal when a mentor claimed it first, and reloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    withdrawHelpRequest.mockRejectedValue({ response: { status: 409, data: {} } })
    listHelpRequests.mockResolvedValue({ data: [helpRequest()] })
    const wrapper = await showQueueAs(askerId)
    listHelpRequests.mockResolvedValue({ data: [helpRequest({ status: 'claimed', mentorId })] })
    await button(wrapper, 'Withdraw request').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Someone else got there first, or this request just changed.',
    )
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(button(wrapper, 'Withdraw request')).toBeUndefined()
  })
})

describe('giving a claimed request back (UX audit A3)', () => {
  async function openAsMentor(fields) {
    listHelpRequests.mockResolvedValue({ data: [helpRequest({ mentorId, ...fields })] })
    const wrapper = await showQueueAs(mentorId)
    await button(wrapper, 'Open request').trigger('click')
    return wrapper
  }

  it('offers Give back only while claimed, not once the hint is sent', async () => {
    expect(
      button(await openAsMentor({ status: 'claimed' }), 'Give back to the queue'),
    ).toBeDefined()
    expect(
      button(await openAsMentor({ status: 'responded' }), 'Give back to the queue'),
    ).toBeUndefined()
  })

  it('gives it back, reloads so the hint box goes, and says what happened', async () => {
    unclaimHelpRequest.mockResolvedValue({ data: { id: requestId, status: 'open' } })
    const wrapper = await openAsMentor({ status: 'claimed' })
    listHelpRequests.mockResolvedValue({ data: [helpRequest()] })
    await button(wrapper, 'Give back to the queue').trigger('click')
    await flushPromises()
    expect(unclaimHelpRequest).toHaveBeenCalledWith(requestId)
    expect(wrapper.find('#hint').exists()).toBe(false)
    expect(listHelpRequests).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Gave the request about "Average of exam scores" back to the queue.',
    )
  })

  it('keeps the details open and says why when the server refuses', async () => {
    unclaimHelpRequest.mockRejectedValue({
      response: { status: 403, data: { error: { message: 'Only the mentor who claimed it.' } } },
    })
    const wrapper = await openAsMentor({ status: 'claimed' })
    await button(wrapper, 'Give back to the queue').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Only the mentor who claimed it.')
    expect(wrapper.find('#hint').exists()).toBe(true)
  })
})
