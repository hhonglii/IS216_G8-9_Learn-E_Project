// Tests for G13 (decision G-13): the ring and its sentence in ProfileView.vue.
// getProfile is mocked, so only
// what the page does with the server's numbers is under test.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProfileView from '../views/ProfileView.vue'
import { getProfile } from '../services/usersApi.js'
vi.mock('../services/usersApi.js', () => ({ getProfile: vi.fn() }))

const aliceId = '507f1f77bcf86cd799439101'
const base = {
  id: aliceId,
  displayName: 'Alice Tan',
  role: 'student',
  classrooms: [],
  completedChallenges: [],
  projects: [],
}

async function showProfile(fields) {
  getProfile.mockResolvedValue({ data: { ...base, ...fields } })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/profiles/:userId', name: 'profile', component: ProfileView }],
  })
  await router.push(`/profiles/${aliceId}`)
  const wrapper = mount(ProfileView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const fillDash = (wrapper) => wrapper.get('.le-ring-fill').attributes('stroke-dasharray')

beforeEach(() => vi.resetAllMocks())

describe('milestone ring (G13)', () => {
  it('writes "3 of 5" and draws 60 of the ring for 3 hints toward Helpful Five', async () => {
    const wrapper = await showProfile({
      helpfulCount: 3,
      milestones: ['First Assist'],
      nextMilestone: { label: 'Helpful Five', threshold: 5 },
    })
    const row = wrapper.get('.le-ring-row')
    expect(row.text()).toBe('3 of 5 helpful hints toward Helpful Five')
    expect(fillDash(wrapper)).toBe('60 100')
    // The picture is hidden from screen readers; the sentence says it all.
    expect(row.get('svg').attributes('aria-hidden')).toBe('true')
    expect(row.findAll('circle')).toHaveLength(2)
    // A stroke starts at 3 o'clock; a quarter turn back starts it at 12.
    expect(row.get('.le-ring-fill').attributes('transform')).toBe('rotate(-90 18 18)')
  })

  it.each([
    [
      0,
      { label: 'First Assist', threshold: 1 },
      '0 100',
      '0 of 1 helpful hints toward First Assist',
    ],
    [
      9,
      { label: 'Challenge Guide', threshold: 10 },
      '90 100',
      '9 of 10 helpful hints toward Challenge Guide',
    ],
  ])('draws %i hints from the server numbers', async (count, nextMilestone, dash, text) => {
    const wrapper = await showProfile({ helpfulCount: count, milestones: [], nextMilestone })
    expect(fillDash(wrapper)).toBe(dash)
    expect(wrapper.get('.le-ring-row').text()).toBe(text)
  })

  it('shows "Every milestone reached" and no ring when nextMilestone is null', async () => {
    const wrapper = await showProfile({
      helpfulCount: 10,
      milestones: ['First Assist', 'Helpful Five', 'Challenge Guide'],
      nextMilestone: null,
    })
    expect(wrapper.get('.le-ring-row').text()).toBe('Every milestone reached')
    expect(wrapper.find('.le-ring-row svg').exists()).toBe(false)
  })

  it('shows no ring on a professor profile, whose count is always 0', async () => {
    const wrapper = await showProfile({
      role: 'professor',
      helpfulCount: 0,
      milestones: [],
      nextMilestone: { label: 'First Assist', threshold: 1 },
    })
    expect(wrapper.find('.le-ring-row').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('helpful hints toward')
  })

  it('keeps the earned milestone badges beside the ring', async () => {
    const wrapper = await showProfile({
      helpfulCount: 6,
      milestones: ['First Assist', 'Helpful Five'],
      nextMilestone: { label: 'Challenge Guide', threshold: 10 },
    })
    expect(wrapper.get('[aria-label="Milestones"]').text()).toContain('Helpful Five')
    expect(wrapper.get('.le-ring-row').text()).toBe('6 of 10 helpful hints toward Challenge Guide')
  })
})
