// Tests for the dashboard's New classroom and Join classroom forms (UX audit fifth pass W6, W7).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import { routes } from '../router/index.js'
import { getProfile } from '../services/usersApi.js'
import { createClassroom, getWaitingOnMe, joinClassroom } from '../services/classroomsApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'

vi.mock('../services/usersApi.js', () => ({ getProfile: vi.fn() }))
vi.mock('../services/classroomsApi.js', () => ({
  getWaitingOnMe: vi.fn(),
  createClassroom: vi.fn(),
  joinClassroom: vi.fn(),
}))

const { currentUser } = useCurrentUser()
function logIn(role) {
  currentUser.value = { id: 'u1', username: 'u1', displayName: 'U', role }
}
function refusal(status, message, details = null) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: { code: 'REFUSED', message, details } } },
  })
}
async function mountDashboard() {
  const page = { template: '<p>page</p>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: routes.map((route) => ({ ...route, component: page })),
  })
  const wrapper = mount(DashboardView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const joinInput = (wrapper) =>
  wrapper.get('section[aria-labelledby="join-classroom-heading"] input')
const toast = (wrapper) => wrapper.find('.le-toasts [role="alert"]')

beforeEach(() => {
  vi.resetAllMocks()
  getProfile.mockResolvedValue({ data: { classrooms: [{ id: 'c1', name: 'Loops audit' }] } })
  getWaitingOnMe.mockResolvedValue({ data: [] })
})
enableAutoUnmount(afterEach)
afterEach(() => {
  currentUser.value = null
})

describe('New classroom', () => {
  it("shows the server's name error under the field, marked and linked, not in the toast", async () => {
    logIn('professor')
    createClassroom.mockRejectedValue(refusal(400, 'Enter a classroom name.', { field: 'name' }))
    const wrapper = await mountDashboard()
    await wrapper.get('#new-classroom-name').element.form.requestSubmit()
    await flushPromises()
    const name = wrapper.get('#new-classroom-name')
    expect(wrapper.get('#new-classroom-name-error').text()).toBe('Enter a classroom name.')
    expect(name.classes()).toContain('is-invalid')
    expect(name.attributes('aria-invalid')).toBe('true')
    expect(name.attributes('aria-describedby')).toBe('new-classroom-name-error')
    expect(toast(wrapper).exists()).toBe(false)
  })

  it('keeps other failures in the toast and clears the field error on the next try', async () => {
    logIn('professor')
    createClassroom
      .mockRejectedValueOnce(refusal(400, 'Enter a classroom name.', { field: 'name' }))
      .mockRejectedValueOnce(new Error('Network Error'))
    const wrapper = await mountDashboard()
    await wrapper.get('#new-classroom-name').element.form.requestSubmit()
    await flushPromises()
    await wrapper.get('#new-classroom-name').setValue('Loops')
    await wrapper.get('#new-classroom-name').element.form.requestSubmit()
    await flushPromises()
    expect(wrapper.find('#new-classroom-name-error').exists()).toBe(false)
    expect(wrapper.get('#new-classroom-name').attributes('aria-invalid')).toBeUndefined()
    expect(toast(wrapper).text()).toBe('Could not reach the server.')
  })
})

// Decision G-10: the professor picks a cover when creating a classroom.
describe('the cover picker', () => {
  it('offers every cover as a labelled radio, with the default chosen', async () => {
    logIn('professor')
    const wrapper = await mountDashboard()
    const picker = wrapper.get('section[aria-labelledby="new-classroom-heading"] fieldset')
    expect(picker.get('legend').text()).toBe('Cover')
    const radios = picker.findAll('input[type="radio"]')
    expect(radios).toHaveLength(13)
    expect(radios.every((radio) => radio.attributes('name') === 'new-classroom-cover')).toBe(true)
    expect(picker.get('#new-classroom-cover-default').element.checked).toBe(true)
    expect(picker.get('label[for="new-classroom-cover-teal-loop"]').text()).toBe('Teal, loop arrow')
    expect(picker.find('img').exists()).toBe(false)
  })

  it('sends the chosen cover and goes back to the default afterwards', async () => {
    logIn('professor')
    createClassroom.mockResolvedValue({ data: { id: 'c2', name: 'Arrays' } })
    const wrapper = await mountDashboard()
    await wrapper.get('#new-classroom-name').setValue('Arrays')
    await wrapper.get('#new-classroom-cover-amber-nodes').setValue(true)
    expect(wrapper.get('fieldset .form-text').text()).toBe('Amber, connected nodes')
    await wrapper.get('#new-classroom-name').element.form.requestSubmit()
    await flushPromises()
    expect(createClassroom).toHaveBeenCalledWith({
      name: 'Arrays',
      description: '',
      coverId: 'amber-nodes',
    })
    expect(wrapper.get('#new-classroom-cover-default').element.checked).toBe(true)
  })
})

describe('Join classroom', () => {
  it('shows a wrong code under the field, marked and linked', async () => {
    logIn('student')
    joinClassroom.mockRejectedValue(
      refusal(404, 'No classroom uses that join code. Check it with your professor.', {
        field: 'joinCode',
      }),
    )
    const wrapper = await mountDashboard()
    await joinInput(wrapper).setValue('ZZZZZZ')
    await joinInput(wrapper).element.form.requestSubmit()
    await flushPromises()
    const input = joinInput(wrapper)
    const error = wrapper.get(`#${input.attributes('aria-describedby')}`)
    expect(error.text()).toBe('No classroom uses that join code. Check it with your professor.')
    expect(input.classes()).toContain('is-invalid')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(toast(wrapper).exists()).toBe(false)
  })

  it('says "Joined" for a new classroom', async () => {
    logIn('student')
    joinClassroom.mockResolvedValue({
      data: { classroomId: 'c2', classroom: { id: 'c2', name: 'Arrays' } },
    })
    const wrapper = await mountDashboard()
    await joinInput(wrapper).setValue('NEW123')
    await joinInput(wrapper).element.form.requestSubmit()
    await flushPromises()
    expect(wrapper.get('.le-toasts').text()).toContain('Joined Arrays')
  })

  it("says you're already in a classroom you had joined before", async () => {
    logIn('student')
    joinClassroom.mockResolvedValue({
      data: { classroomId: 'c1', classroom: { id: 'c1', name: 'Loops audit' } },
    })
    const wrapper = await mountDashboard()
    await joinInput(wrapper).setValue('4FQ6G9')
    await joinInput(wrapper).element.form.requestSubmit()
    await flushPromises()
    const toasts = wrapper.get('.le-toasts').text()
    expect(toasts).toContain("You're already in Loops audit")
    expect(toasts).not.toContain('Joined')
  })
})
