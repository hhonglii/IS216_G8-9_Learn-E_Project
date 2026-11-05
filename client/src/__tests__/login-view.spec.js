// Tests for G16 Step 10 (LoginView and the router guard).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import appRouter, { routes } from '../router/index.js'
import { login, register } from '../services/authApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
import { getSessionToken, setSessionToken } from '../utils/sessionToken.js'

vi.mock('../services/authApi.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}))

const alice = { id: 'user-a', username: 'alice.t', displayName: 'Alice', role: 'student' }
const issued = { data: { token: 'tok-new', user: alice } }
function refusal(status, message) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: { code: 'REFUSED', message, details: null } } },
  })
}
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const mounted = []
async function openLogin(path = '/login', options = {}) {
  // Only the login page is real; every other page is a stub, so a redirect is visible as the route.
  const page = { template: '<p>page</p>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: routes.map((route) => (route.name === 'login' ? route : { ...route, component: page })),
  })
  await router.push(path)
  const wrapper = mount(LoginView, { global: { plugins: [router] }, ...options })
  mounted.push(wrapper)
  return { wrapper, router }
}
const loginCard = (wrapper) => wrapper.get('section[aria-labelledby="login-heading"]')
const createCard = (wrapper) => wrapper.get('section[aria-labelledby="create-heading"]')

async function fillLogin(wrapper, username = 'alice.t', password = 'long enough') {
  await wrapper.get('#login-username').setValue(username)
  await wrapper.get('#login-password').setValue(password)
}
async function fillCreate(wrapper) {
  await wrapper.get('#create-username').setValue('alice.t')
  await wrapper.get('#create-display-name').setValue('Alice')
  await wrapper.get('#create-role').setValue('professor')
  await wrapper.get('#create-professor-code').setValue('class-code')
  await wrapper.get('#create-password').setValue('long enough')
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  useCurrentUser().currentUser.value = null
  window.localStorage.clear()
})

describe('LoginView (G16 Step 10)', () => {
  it('labels every field and asks the browser for the right kind of password', async () => {
    const { wrapper } = await openLogin()
    const ids = [
      'login-username',
      'login-password',
      'create-username',
      'create-display-name',
      'create-role',
      'create-password',
    ]
    // Listing the misses names the broken field when this fails.
    const unlabelled = ids.filter(
      (id) => !wrapper.find(`label[for="${id}"]`).exists() || !wrapper.find(`#${id}`).exists(),
    )
    expect(unlabelled).toEqual([])
    expect(wrapper.get('#login-password').attributes()).toMatchObject({
      type: 'password',
      autocomplete: 'current-password',
    })
    expect(wrapper.get('#create-password').attributes()).toMatchObject({
      type: 'password',
      autocomplete: 'new-password',
    })
    expect(
      wrapper
        .get('#create-role')
        .findAll('option')
        .map((option) => option.element.value),
    ).toEqual(['student', 'professor'])
  })

  it('logs in with exactly the typed username and password, keeps the session and follows the redirect', async () => {
    login.mockResolvedValue(issued)
    const { wrapper, router } = await openLogin('/login?redirect=/classrooms/c1%3Ftab%3D2')
    await fillLogin(wrapper)
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(login).toHaveBeenCalledExactlyOnceWith('alice.t', 'long enough')
    expect(getSessionToken()).toBe('tok-new')
    expect(useCurrentUser().currentUserId.value).toBe('user-a')
    expect(router.currentRoute.value.fullPath).toBe('/classrooms/c1?tab=2')
  })

  it('creates an account from all four fields and follows the redirect', async () => {
    register.mockResolvedValue(issued)
    const { wrapper, router } = await openLogin('/login?redirect=/take-a-break')
    await fillCreate(wrapper)
    await wrapper.get('#create-password').element.form.requestSubmit()
    await flushPromises()
    expect(register).toHaveBeenCalledExactlyOnceWith({
      username: 'alice.t',
      displayName: 'Alice',
      role: 'professor',
      password: 'long enough',
      professorCode: 'class-code',
    })
    expect(getSessionToken()).toBe('tok-new')
    expect(router.currentRoute.value.fullPath).toBe('/take-a-break')
  })

  it.each([
    ['no redirect', '/login'],
    ['another site', '/login?redirect=https://evil.com'],
    ['a protocol-relative link', '/login?redirect=//evil.com'],
    ['a relative path', '/login?redirect=classrooms/c1'],
    ['the login page', '/login?redirect=/login'],
    ['the login page with a query', '/login?redirect=%2Flogin%3Fredirect%3D%2Fx'],
    ['two redirects', '/login?redirect=/a&redirect=/b'],
  ])('goes to the dashboard when given %s', async (_label, path) => {
    login.mockResolvedValue(issued)
    const { wrapper, router } = await openLogin(path)
    await fillLogin(wrapper)
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('shows a refused login under Log in only, clears just the password and stays put', async () => {
    login.mockRejectedValue(refusal(401, 'Username or password is incorrect.'))
    const { wrapper, router } = await openLogin('/login?redirect=/take-a-break')
    await fillLogin(wrapper, 'alice.t', 'wrong password')
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(loginCard(wrapper).get('[role="alert"]').text()).toContain(
      'Username or password is incorrect.',
    )
    expect(createCard(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('#login-username').element.value).toBe('alice.t')
    expect(wrapper.get('#login-password').element.value).toBe('')
    expect(getSessionToken()).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it("closes each form's error with its Dismiss alert button", async () => {
    login.mockRejectedValue(refusal(401, 'Username or password is incorrect.'))
    register.mockRejectedValue(refusal(409, 'That username is taken.'))
    const { wrapper } = await openLogin()
    await fillLogin(wrapper, 'alice.t', 'wrong password')
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    await loginCard(wrapper).get('button[aria-label="Dismiss alert"]').trigger('click')
    expect(loginCard(wrapper).find('[role="alert"]').exists()).toBe(false)

    await fillCreate(wrapper)
    await wrapper.get('#create-password').element.form.requestSubmit()
    await flushPromises()
    await createCard(wrapper).get('button[aria-label="Dismiss alert"]').trigger('click')
    expect(createCard(wrapper).find('[role="alert"]').exists()).toBe(false)
  })

  it('shows a refused account under Create account only, keeping everything but the password', async () => {
    register.mockRejectedValue(refusal(409, 'That username is taken.'))
    const { wrapper, router } = await openLogin()
    await fillCreate(wrapper)
    await wrapper.get('#create-password').element.form.requestSubmit()
    await flushPromises()
    expect(createCard(wrapper).get('[role="alert"]').text()).toContain('That username is taken.')
    expect(loginCard(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('#create-username').element.value).toBe('alice.t')
    expect(wrapper.get('#create-display-name').element.value).toBe('Alice')
    expect(wrapper.get('#create-role').element.value).toBe('professor')
    expect(wrapper.get('#create-password').element.value).toBe('')
    expect(router.currentRoute.value.name).toBe('login')
  })

  // H3 Step 6 (option B): the professor sign-up code.
  it('asks for the professor sign-up code only when Professor is chosen', async () => {
    const { wrapper } = await openLogin()
    expect(wrapper.find('#create-professor-code').exists()).toBe(false)
    await wrapper.get('#create-role').setValue('professor')
    const code = wrapper.get('#create-professor-code')
    expect(code.attributes('type')).toBe('password')
    expect(wrapper.get('label[for="create-professor-code"]').text()).toBe('Professor sign-up code')
    await wrapper.get('#create-role').setValue('student')
    expect(wrapper.find('#create-professor-code').exists()).toBe(false)
  })

  it('lists every field the server refused, outlined and linked, not just "Check the highlighted fields." (UX audit items 2 and 4)', async () => {
    const refused = refusal(400, 'Check the highlighted fields.')
    refused.response.data.error.details = [
      {
        field: 'username',
        message: 'Username must be 3 to 30 letters, numbers, dots, dashes or underscores.',
      },
      { field: 'professorCode', message: 'Professor accounts need the professor sign-up code.' },
    ]
    register.mockRejectedValue(refused)
    const { wrapper } = await openLogin('/login', { attachTo: document.body })
    await fillCreate(wrapper)
    await wrapper.get('#create-password').element.form.requestSubmit()
    await flushPromises()
    const summary = createCard(wrapper).get('.le-error-summary')
    expect(summary.text()).not.toContain('Check the highlighted fields.')
    const links = summary.findAll('a')
    expect(links.map((link) => [link.text(), link.attributes('href')])).toEqual([
      [
        'Username must be 3 to 30 letters, numbers, dots, dashes or underscores.',
        '#create-username',
      ],
      ['Professor accounts need the professor sign-up code.', '#create-professor-code'],
    ])
    expect(summary.attributes('role')).toBe('alert')
    // It sits just above the Create account button.
    expect(summary.element.nextElementSibling.textContent).toBe('Create account')
    for (const id of ['#create-username', '#create-professor-code']) {
      expect(wrapper.get(id).classes()).toContain('is-invalid')
      expect(wrapper.get(id).attributes('aria-invalid')).toBe('true')
    }
    expect(wrapper.get('#create-display-name').attributes('aria-invalid')).toBeUndefined()
  })

  it('shows the username and password rules before anyone tries (UX audit item 2)', async () => {
    const { wrapper } = await openLogin()
    for (const [id, rule] of [
      ['#create-username', '3 to 30 characters: letters, numbers, dots, dashes or underscores.'],
      ['#create-password', '8 to 128 characters.'],
    ]) {
      const hint = wrapper.get(`#${wrapper.get(id).attributes('aria-describedby')}`)
      expect(hint.text()).toBe(rule)
    }
  })

  it('says the server could not be reached when there is no reply', async () => {
    login.mockRejectedValue(new Error('Network Error'))
    const { wrapper } = await openLogin()
    await fillLogin(wrapper)
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(loginCard(wrapper).get('[role="alert"]').text()).toContain('Could not reach the server.')
  })

  it('disables both buttons while a request is out, then clears the old error on retry', async () => {
    const first = deferred()
    login.mockReturnValueOnce(first.promise.then(() => Promise.reject(refusal(401, 'Nope.'))))
    const { wrapper } = await openLogin()
    await fillLogin(wrapper)
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.element.disabled)).toEqual([true, true])
    first.resolve()
    await flushPromises()
    expect(buttons.map((button) => button.element.disabled)).toEqual([false, false])
    expect(loginCard(wrapper).text()).toContain('Nope.')

    login.mockReturnValueOnce(new Promise(() => {}))
    await wrapper.get('#login-password').setValue('second try')
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(loginCard(wrapper).find('[role="alert"]').exists()).toBe(false)
  })

  it('names each blank log-in field under it and sends nothing (fifth pass W4)', async () => {
    const { wrapper } = await openLogin()
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(login).not.toHaveBeenCalled()
    expect(wrapper.get('#login-username-error').text()).toBe('Enter your username.')
    expect(wrapper.get('#login-password-error').text()).toBe('Enter your password.')
    const username = wrapper.get('#login-username')
    expect(username.classes()).toContain('is-invalid')
    expect(username.attributes('aria-invalid')).toBe('true')
    expect(username.attributes('aria-describedby')).toBe('login-username-error')

    await wrapper.get('#login-username').setValue('alice.t')
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(wrapper.find('#login-username-error').exists()).toBe(false)
    expect(wrapper.get('#login-username').attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.get('#login-password-error').exists()).toBe(true)
  })

  it("clears one form's messages when the other form is used (fifth pass W5)", async () => {
    login.mockRejectedValue(refusal(401, 'Username or password is incorrect.'))
    register.mockRejectedValue(refusal(409, 'That username is taken.'))
    const { wrapper } = await openLogin()
    await fillLogin(wrapper)
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(loginCard(wrapper).text()).toContain('Username or password is incorrect.')

    await fillCreate(wrapper)
    await wrapper.get('#create-password').element.form.requestSubmit()
    await flushPromises()
    expect(createCard(wrapper).text()).toContain('That username is taken.')
    expect(loginCard(wrapper).find('[role="alert"]').exists()).toBe(false)

    await fillLogin(wrapper)
    await wrapper.get('#login-password').element.form.requestSubmit()
    await flushPromises()
    expect(createCard(wrapper).find('[role="alert"]').exists()).toBe(false)
  })
})

describe('router guard (G16 Step 10)', () => {
  afterEach(async () => {
    window.localStorage.clear()
    await appRouter.push('/login')
  })

  it('sends a logged-out visitor to login, remembering the full address', async () => {
    await appRouter.push('/classrooms/c1?tab=2')
    expect(appRouter.currentRoute.value.name).toBe('login')
    expect(appRouter.currentRoute.value.query).toEqual({ redirect: '/classrooms/c1?tab=2' })
  })

  it.each(['/', '/take-a-break', '/profiles/u1', '/no-such-page'])(
    'guards %s too',
    async (path) => {
      await appRouter.push(path)
      expect(appRouter.currentRoute.value.name).toBe('login')
      expect(appRouter.currentRoute.value.query.redirect).toBe(path)
    },
  )

  it('lets anyone open the login page itself', async () => {
    await appRouter.push('/login?redirect=/take-a-break')
    expect(appRouter.currentRoute.value.fullPath).toBe('/login?redirect=/take-a-break')
  })

  it('lets a visitor with a token through, and checks again on every navigation', async () => {
    setSessionToken('tok-1')
    await appRouter.push('/classrooms/c1')
    expect(appRouter.currentRoute.value.fullPath).toBe('/classrooms/c1')
    window.localStorage.clear()
    await appRouter.push('/take-a-break')
    expect(appRouter.currentRoute.value.name).toBe('login')
  })
})
