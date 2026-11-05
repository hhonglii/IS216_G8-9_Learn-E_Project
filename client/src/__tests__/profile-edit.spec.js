// Tests for G16 Step 11 (editing your own name and password on the profile
// page): the forms in ProfileView.vue. The usersApi.js wrappers are mocked, so
// only what the page does with the server's answers is under test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProfileView from '../views/ProfileView.vue'
import { getProfile, updateMe, changePassword } from '../services/usersApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
vi.mock('../services/usersApi.js', () => ({
  getProfile: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
}))

const aliceId = '507f1f77bcf86cd799439101'
const bobId = '507f1f77bcf86cd799439102'
const alice = { id: aliceId, username: 'alice.t', displayName: 'Alice', role: 'student' }
const { currentUser } = useCurrentUser()

const profileOf = (id, displayName) => ({
  data: {
    id,
    displayName,
    role: 'student',
    helpfulCount: 0,
    milestones: [],
    nextMilestone: null,
    classrooms: [],
    completedChallenges: [],
    projects: [],
  },
})
// The shape axios rejects with when the server answers with an error body.
function serverError(status, code, message, details = null) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: { code, message, details } } },
  })
}
function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

async function showProfile(id, { as = alice, name = 'Alice' } = {}) {
  currentUser.value = as
  getProfile.mockResolvedValue(profileOf(id, name))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/profiles/:userId', name: 'profile', component: ProfileView }],
  })
  await router.push(`/profiles/${id}`)
  const wrapper = mount(ProfileView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const nameCard = (wrapper) => wrapper.find('section[aria-labelledby="edit-name-heading"]')
const passwordCard = (wrapper) => wrapper.find('section[aria-labelledby="change-password-heading"]')
const heading = (wrapper) => wrapper.get('#profile-heading').text()
const fields = (wrapper) =>
  ['#current-password', '#new-password', '#confirm-password'].map(
    (id) => wrapper.get(id).element.value,
  )
async function fillPassword(wrapper, current, next, confirm = next) {
  await wrapper.get('#current-password').setValue(current)
  await wrapper.get('#new-password').setValue(next)
  await wrapper.get('#confirm-password').setValue(confirm)
}

beforeEach(() => vi.resetAllMocks())
enableAutoUnmount(afterEach)
afterEach(() => {
  currentUser.value = null
})

describe('who sees the forms (G16 Step 11)', () => {
  it('shows both forms on your own profile, with the name filled in', async () => {
    const wrapper = await showProfile(aliceId)
    expect(nameCard(wrapper).get('h2').text()).toBe('Edit profile')
    expect(passwordCard(wrapper).get('h2').text()).toBe('Change password')
    expect(wrapper.get('#edit-display-name').element.value).toBe('Alice')
    expect(wrapper.get('label[for="edit-display-name"]').text()).toBe('Display name')
  })

  it.each([
    ["someone else's profile", bobId, alice],
    ['a profile when logged out', aliceId, null],
  ])('shows neither form on %s', async (_label, id, as) => {
    const wrapper = await showProfile(id, { as })
    expect(heading(wrapper)).toBe('Alice')
    expect(nameCard(wrapper).exists()).toBe(false)
    expect(passwordCard(wrapper).exists()).toBe(false)
  })

  it('lets the browser check lengths and offer saved or new passwords', async () => {
    const wrapper = await showProfile(aliceId)
    const name = wrapper.get('#edit-display-name').attributes()
    expect(name).toMatchObject({ maxlength: '60' })
    expect(name).toHaveProperty('required')
    expect(wrapper.get('#current-password').attributes()).toMatchObject({
      type: 'password',
      autocomplete: 'current-password',
    })
    for (const id of ['#new-password', '#confirm-password']) {
      expect(wrapper.get(id).attributes()).toMatchObject({
        type: 'password',
        autocomplete: 'new-password',
        minlength: '8',
        maxlength: '128',
      })
    }
    for (const id of ['current-password', 'new-password', 'confirm-password']) {
      expect(wrapper.find(`label[for="${id}"]`).exists()).toBe(true)
    }
  })
})

describe('saving a new name (G16 Step 11)', () => {
  it('sends the trimmed name, then updates the heading, the field and the logged-in user', async () => {
    const wrapper = await showProfile(aliceId)
    updateMe.mockResolvedValue({ data: { ...alice, displayName: 'Alice Tan' } })
    await wrapper.get('#edit-display-name').setValue('  Alice Tan  ')
    // The heading keeps the saved name while the person types.
    expect(heading(wrapper)).toBe('Alice')

    await wrapper.get('section[aria-labelledby="edit-name-heading"] form').trigger('submit')
    await flushPromises()
    expect(updateMe).toHaveBeenCalledExactlyOnceWith('Alice Tan')
    expect(heading(wrapper)).toBe('Alice Tan')
    expect(wrapper.get('#edit-display-name').element.value).toBe('Alice Tan')
    // The top bar chip reads this, so it follows without asking the server again.
    expect(currentUser.value).toEqual({ ...alice, displayName: 'Alice Tan' })
    expect(nameCard(wrapper).get('[role="status"]').text()).toBe('Name saved.')
    expect(nameCard(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(getProfile).toHaveBeenCalledOnce()
  })

  it('locks the button while saving and unlocks it after', async () => {
    const wrapper = await showProfile(aliceId)
    const reply = deferred()
    updateMe.mockReturnValue(reply.promise)
    const button = nameCard(wrapper).get('button[type="submit"]')
    expect(button.attributes()).not.toHaveProperty('disabled')
    await nameCard(wrapper).get('form').trigger('submit')
    expect(button.attributes()).toHaveProperty('disabled')

    reply.resolve({ data: { ...alice, displayName: 'Alice' } })
    await flushPromises()
    expect(button.attributes()).not.toHaveProperty('disabled')
  })

  it.each([
    [
      'the field message from a refusal',
      serverError(400, 'VALIDATION_FAILED', 'Request validation failed.', [
        { field: 'displayName', message: 'Display name must be 1 to 60 characters.' },
      ]),
      'Display name must be 1 to 60 characters.',
    ],
    [
      'the error message when there are no details',
      serverError(500, 'INTERNAL_ERROR', 'Something went wrong.'),
      'Something went wrong.',
    ],
    ['a plain message when offline', new Error('Network Error'), 'Could not reach the server.'],
  ])('shows %s, keeps the draft, and changes nothing else', async (_label, failure, message) => {
    const wrapper = await showProfile(aliceId)
    updateMe.mockRejectedValue(failure)
    await wrapper.get('#edit-display-name').setValue('Alice Tan')
    await nameCard(wrapper).get('form').trigger('submit')
    await flushPromises()
    expect(nameCard(wrapper).get('[role="alert"]').text()).toBe(message)
    expect(nameCard(wrapper).find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('#edit-display-name').element.value).toBe('Alice Tan')
    expect(heading(wrapper)).toBe('Alice')
    expect(currentUser.value).toEqual(alice)
    expect(nameCard(wrapper).get('button[type="submit"]').attributes()).not.toHaveProperty(
      'disabled',
    )
  })

  it('clears an earlier result when the next save starts', async () => {
    const wrapper = await showProfile(aliceId)
    updateMe.mockRejectedValueOnce(new Error('Network Error'))
    await nameCard(wrapper).get('form').trigger('submit')
    await flushPromises()
    expect(nameCard(wrapper).find('[role="alert"]').exists()).toBe(true)

    const reply = deferred()
    updateMe.mockReturnValueOnce(reply.promise)
    await nameCard(wrapper).get('form').trigger('submit')
    expect(nameCard(wrapper).find('[role="alert"]').exists()).toBe(false)
    reply.resolve({ data: alice })
    await flushPromises()
    expect(nameCard(wrapper).find('[role="status"]').exists()).toBe(true)

    updateMe.mockRejectedValueOnce(new Error('Network Error'))
    await nameCard(wrapper).get('form').trigger('submit')
    await flushPromises()
    // Never "Name saved." beside an error.
    expect(nameCard(wrapper).find('[role="status"]').exists()).toBe(false)
    expect(nameCard(wrapper).find('[role="alert"]').exists()).toBe(true)
  })
})

describe('changing the password (G16 Step 11)', () => {
  const submitPassword = (wrapper) => passwordCard(wrapper).get('form').trigger('submit')

  it('stops before sending when the new passwords differ, keeping what was typed', async () => {
    const wrapper = await showProfile(aliceId)
    await fillPassword(wrapper, 'old-pass-1', 'new-pass-12', 'new-pass-13')
    await submitPassword(wrapper)
    await flushPromises()
    expect(changePassword).not.toHaveBeenCalled()
    expect(passwordCard(wrapper).get('[role="alert"]').text()).toBe(
      'The new passwords do not match.',
    )
    expect(fields(wrapper)).toEqual(['old-pass-1', 'new-pass-12', 'new-pass-13'])
  })

  it('sends the current and new password, then clears the form and says so', async () => {
    const wrapper = await showProfile(aliceId)
    const reply = deferred()
    changePassword.mockReturnValue(reply.promise)
    await fillPassword(wrapper, 'old-pass-1', 'new-pass-12')
    await submitPassword(wrapper)
    const button = passwordCard(wrapper).get('button[type="submit"]')
    expect(button.attributes()).toHaveProperty('disabled')

    reply.resolve(undefined)
    await flushPromises()
    expect(changePassword).toHaveBeenCalledExactlyOnceWith('old-pass-1', 'new-pass-12')
    expect(fields(wrapper)).toEqual(['', '', ''])
    expect(passwordCard(wrapper).get('[role="status"]').text()).toBe(
      'Password changed. Your other devices have been logged out.',
    )
    expect(button.attributes()).not.toHaveProperty('disabled')
    expect(currentUser.value).toEqual(alice)
  })

  it('clears only the current password when it is wrong, and stays logged in', async () => {
    const wrapper = await showProfile(aliceId)
    changePassword.mockRejectedValue(
      serverError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.'),
    )
    await fillPassword(wrapper, 'wrong-pass', 'new-pass-12')
    await submitPassword(wrapper)
    await flushPromises()
    expect(passwordCard(wrapper).get('[role="alert"]').text()).toBe(
      'Current password is incorrect.',
    )
    expect(fields(wrapper)).toEqual(['', 'new-pass-12', 'new-pass-12'])
    expect(currentUser.value).toEqual(alice)
    expect(passwordCard(wrapper).get('button[type="submit"]').attributes()).not.toHaveProperty(
      'disabled',
    )

    // Retyping only the current password is enough, and the old error goes.
    changePassword.mockResolvedValue(undefined)
    await wrapper.get('#current-password').setValue('old-pass-1')
    await submitPassword(wrapper)
    await flushPromises()
    expect(changePassword).toHaveBeenLastCalledWith('old-pass-1', 'new-pass-12')
    expect(passwordCard(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(passwordCard(wrapper).find('[role="status"]').exists()).toBe(true)
  })

  it.each([
    [
      'the field message for a too-short password',
      serverError(400, 'VALIDATION_FAILED', 'Request validation failed.', [
        { field: 'newPassword', message: 'Password must be 8 to 128 characters.' },
      ]),
      'Password must be 8 to 128 characters.',
    ],
    ['a plain message when offline', new Error('Network Error'), 'Could not reach the server.'],
  ])('shows %s', async (_label, failure, message) => {
    const wrapper = await showProfile(aliceId)
    changePassword.mockRejectedValue(failure)
    await fillPassword(wrapper, 'old-pass-1', 'short-pw')
    await submitPassword(wrapper)
    await flushPromises()
    expect(passwordCard(wrapper).get('[role="alert"]').text()).toBe(message)
    expect(passwordCard(wrapper).find('[role="status"]').exists()).toBe(false)
  })

  it('clears an earlier success when the next attempt fails', async () => {
    const wrapper = await showProfile(aliceId)
    changePassword.mockResolvedValueOnce(undefined)
    await fillPassword(wrapper, 'old-pass-1', 'new-pass-12')
    await submitPassword(wrapper)
    await flushPromises()
    expect(passwordCard(wrapper).find('[role="status"]').exists()).toBe(true)

    await fillPassword(wrapper, 'new-pass-12', 'new-pass-13', 'new-pass-14')
    await submitPassword(wrapper)
    await flushPromises()
    expect(passwordCard(wrapper).find('[role="status"]').exists()).toBe(false)
    expect(passwordCard(wrapper).get('[role="alert"]').text()).toBe(
      'The new passwords do not match.',
    )
  })

  it('keeps each form to its own messages', async () => {
    const wrapper = await showProfile(aliceId)
    await fillPassword(wrapper, 'old-pass-1', 'new-pass-12', 'other-pass')
    await submitPassword(wrapper)
    updateMe.mockResolvedValue({ data: alice })
    await nameCard(wrapper).get('form').trigger('submit')
    await flushPromises()
    expect(nameCard(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(passwordCard(wrapper).find('[role="status"]').exists()).toBe(false)
    expect(passwordCard(wrapper).find('[role="alert"]').exists()).toBe(true)
    expect(nameCard(wrapper).find('[role="status"]').exists()).toBe(true)
  })
})
