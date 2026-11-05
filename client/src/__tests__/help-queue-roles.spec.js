// The help queue by role: professors follow requests but never ask for help or
// claim one, so the ask form and Claim buttons are only for students. API mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import HelpQueueView from '../views/HelpQueueView.vue'
import { claimHelpRequest, listHelpRequests } from '../services/helpRequestsApi.js'
import { getClassroom } from '../services/classroomsApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
vi.mock('../services/helpRequestsApi.js', () => ({
  listHelpRequests: vi.fn(),
  createHelpRequest: vi.fn(),
  claimHelpRequest: vi.fn(),
  respondToHelpRequest: vi.fn(),
  resolveHelpRequest: vi.fn(),
}))
vi.mock('../services/classroomsApi.js', () => ({ getClassroom: vi.fn() }))

const classroomId = '507f1f77bcf86cd799439106'
const request = {
  id: '507f1f77bcf86cd799439301',
  status: 'open',
  hintType: 'Guiding question',
  actualBehaviour: 'It prints 4.67 instead of 6.0',
  challengeTitle: 'Average of exam scores',
  requesterId: '507f1f77bcf86cd799439401',
  requesterName: 'Marcus Lee',
  canClaim: false,
}
const { currentUser } = useCurrentUser()

beforeEach(() => {
  vi.resetAllMocks()
  listHelpRequests.mockResolvedValue({ data: [request] })
  getClassroom.mockResolvedValue({
    data: { challenges: [{ id: '507f1f77bcf86cd799439201', title: 'Average of exam scores' }] },
  })
})
afterEach(() => {
  currentUser.value = null
})
enableAutoUnmount(afterEach)

async function showQueueAs(role) {
  currentUser.value = { id: '507f1f77bcf86cd799439499', role }
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

const buttonNames = (wrapper) => wrapper.findAll('button').map((button) => button.text())

describe('help queue by role', () => {
  it('shows a professor the requests without the ask form or Claim', async () => {
    const wrapper = await showQueueAs('professor')
    expect(wrapper.find('#ask-heading').exists()).toBe(false)
    expect(wrapper.find('#challenge-pick').exists()).toBe(false)
    expect(wrapper.text()).toContain("Follow your students' help requests")
    expect(wrapper.text()).toContain('It prints 4.67 instead of 6.0')
    expect(buttonNames(wrapper)).toContain('Open request')
    expect(buttonNames(wrapper)).not.toContain('Claim request')
  })

  it('gives a student the ask form, and says why they cannot claim yet instead of a dead button (UX audit item 6)', async () => {
    const wrapper = await showQueueAs('student')
    expect(wrapper.find('#ask-heading').text()).toBe('Ask for help')
    expect(wrapper.find('#challenge-pick').exists()).toBe(true)
    expect(wrapper.text()).toContain('Ask for a targeted hint')
    expect(buttonNames(wrapper)).not.toContain('Claim request')
    expect(wrapper.get('.le-claim-reason').text()).toBe(
      'Finish this challenge and get your diagnosis approved to help here.',
    )
  })

  it('gives a student who may mentor a working Claim button', async () => {
    listHelpRequests.mockResolvedValue({ data: [{ ...request, canClaim: true }] })
    const wrapper = await showQueueAs('student')
    const claim = wrapper.findAll('button').find((button) => button.text() === 'Claim request')
    expect(claim.element.disabled).toBe(false)
    expect(wrapper.find('.le-claim-reason').exists()).toBe(false)

    claimHelpRequest.mockReturnValue(new Promise(() => {}))
    await claim.trigger('click')
    await flushPromises()
    expect(claimHelpRequest).toHaveBeenCalledWith(request.id)
    expect(claim.element.disabled).toBe(true)
    expect(wrapper.find('.le-claim-reason').exists()).toBe(false)
  })

  it('shows neither Claim nor the reason on your own request, or on one already taken', async () => {
    listHelpRequests.mockResolvedValue({
      data: [
        { ...request, requesterId: '507f1f77bcf86cd799439499' },
        { ...request, id: '507f1f77bcf86cd799439302', status: 'claimed' },
      ],
    })
    const wrapper = await showQueueAs('student')
    expect(wrapper.findAll('article')).toHaveLength(2)
    expect(buttonNames(wrapper)).not.toContain('Claim request')
    expect(wrapper.find('.le-claim-reason').exists()).toBe(false)
  })
})
