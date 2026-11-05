import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router/index.js'
import { api } from '../services/api.js'
import { logout as logoutRequest } from '../services/authApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
import { usePageClassroom } from '../composables/usePageClassroom.js'
import { getSessionToken, setSessionToken } from '../utils/sessionToken.js'
vi.mock('../services/api.js', () => ({ api: { get: vi.fn() } }))
vi.mock('../services/authApi.js', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))
// App reads the current route for the sidebar links (G11), so it needs a real
// router. The pages themselves are stubbed: only the shell is under test.
let router
const options = () => {
  const page = { template: '<p>page</p>' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: routes.map((route) => ({ ...route, component: page })),
  })
  return { global: { plugins: [router] } }
}
beforeEach(() => vi.resetAllMocks())
// Every App shares the current-user ref (G12, G16), so an App left mounted by an
// earlier test would also react to it and use up that test's mocked replies.
enableAutoUnmount(afterEach)
describe('shell', () => {
  // H3 Step 7: the "Server: ok" pill was removed, so the shell asks the server nothing.
  it('shows no server status and makes no request of its own', async () => {
    const wrapper = mount(App, options())
    await flushPromises()
    expect(api.get).not.toHaveBeenCalled()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Server|Checking server/)
  })
  it('closes the mobile menu after a navigation link is chosen', async () => {
    api.get.mockResolvedValue({ data: { data: { status: 'ok' } } })
    // The menu is only there when someone is logged in (dead links removed 2026-10-29).
    useCurrentUser().currentUser.value = {
      id: 'u1',
      username: 'u',
      displayName: 'U',
      role: 'student',
    }
    const wrapper = mount(App, options())
    const toggler = wrapper.get('button.navbar-toggler')
    const menu = wrapper.get('#primary-navigation')
    await toggler.trigger('click')
    expect(menu.classes()).toContain('show')
    expect(toggler.attributes('aria-expanded')).toBe('true')
    await wrapper.get('#primary-navigation a').trigger('click')
    expect(menu.classes()).not.toContain('show')
    expect(toggler.attributes('aria-expanded')).toBe('false')
    useCurrentUser().currentUser.value = null
  })
})

// Tests for G11 (decision G-11).
describe('sidebar links (G11)', () => {
  const sidebarLinks = (wrapper) =>
    wrapper.findAll('.app-sidebar a').map((a) => `${a.text()} ${a.attributes('href')}`)
  const menuLinks = (wrapper) =>
    wrapper.findAll('#primary-navigation a').map((a) => `${a.text()} ${a.attributes('href')}`)
  const globalLinks = ['Dashboard /', 'Take a break /take-a-break']
  // Logged out there is no sidebar or menu (2026-10-29), so these run logged in and
  // every list ends with the Account group's profile link.
  const { currentUser } = useCurrentUser()
  const { pageClassroomId } = usePageClassroom()
  const accountLinks = ['Your profile /profiles/u1']
  const classroomC1 = ['Classroom /classrooms/c1', 'Help queue /classrooms/c1/help']
  afterEach(() => {
    currentUser.value = null
    pageClassroomId.value = ''
  })

  async function shellAt(path, { loggedIn = true } = {}) {
    currentUser.value = loggedIn
      ? { id: 'u1', username: 'u', displayName: 'U', role: 'student' }
      : null
    api.get.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(App, options())
    await router.push(path)
    await flushPromises()
    return wrapper
  }

  it.each([
    ['/', []],
    ['/classrooms/c1', classroomC1],
    ['/classrooms/c1/help', classroomC1],
    ['/classrooms/c1/review', classroomC1],
    ['/classrooms/c1/games', classroomC1],
    // Before the page has loaded its classroom (H3 Step 11).
    ['/challenges/ch1', []],
    ['/mini-projects/mp1', []],
    ['/profiles/u1', []],
    ['/no-such-page', []],
  ])('on %s shows the global links plus %j', async (path, classroomLinks) => {
    const wrapper = await shellAt(path)
    const expected = [...globalLinks, ...classroomLinks, ...accountLinks]
    expect(sidebarLinks(wrapper)).toEqual(expected)
    // Phones get the same list through the menu button.
    expect(menuLinks(wrapper)).toEqual(expected)
  })

  // H3 Step 11 (decision G-11, revised 2026-11-02). The stubbed
  // pages load nothing, so each test sets the id the real page would set.
  it.each(['/challenges/ch1', '/mini-projects/mp1'])(
    'on %s shows the classroom links once the page knows its classroom',
    async (path) => {
      const wrapper = await shellAt(path)
      pageClassroomId.value = 'c1'
      await flushPromises()
      const expected = [
        ...globalLinks,
        'Classroom /classrooms/c1',
        'Help queue /classrooms/c1/help',
        ...accountLinks,
      ]
      expect(sidebarLinks(wrapper)).toEqual(expected)
      expect(menuLinks(wrapper)).toEqual(expected)
      expect(groupLabels(wrapper)).toEqual(['Overview', 'This classroom', 'Account'])
      expect(wrapper.find('a[href="/classrooms/c1/review"]').exists()).toBe(false)
    },
  )

  it.each(['/', '/profiles/u1', '/no-such-page'])(
    'on %s ignores a classroom left behind by an earlier page',
    async (path) => {
      pageClassroomId.value = 'c1'
      const wrapper = await shellAt(path)
      expect(sidebarLinks(wrapper)).toEqual([...globalLinks, ...accountLinks])
    },
  )

  it('lets the address win over the page classroom on classroom routes', async () => {
    pageClassroomId.value = 'c1'
    const wrapper = await shellAt('/classrooms/c2/help')
    expect(sidebarLinks(wrapper)).toContain('Classroom /classrooms/c2')
    expect(sidebarLinks(wrapper)).not.toContain('Classroom /classrooms/c1')
  })

  it('drops the classroom links when the page clears its classroom for a new load', async () => {
    const wrapper = await shellAt('/challenges/ch1')
    pageClassroomId.value = 'c1'
    await flushPromises()
    pageClassroomId.value = ''
    await flushPromises()
    expect(sidebarLinks(wrapper)).toEqual([...globalLinks, ...accountLinks])
  })

  it('never links to Professor Review, which only the classroom page can show to its owner', async () => {
    const wrapper = await shellAt('/classrooms/c1/review')
    expect(wrapper.find('a[href="/classrooms/c1/review"]').exists()).toBe(false)
  })

  it('follows the address when moving to another classroom', async () => {
    const wrapper = await shellAt('/classrooms/c1')
    await router.push('/classrooms/c2/help')
    await flushPromises()
    expect(sidebarLinks(wrapper)).toEqual([
      ...globalLinks,
      'Classroom /classrooms/c2',
      'Help queue /classrooms/c2/help',
      ...accountLinks,
    ])
    await router.push('/')
    await flushPromises()
    expect(sidebarLinks(wrapper)).toEqual([...globalLinks, ...accountLinks])
  })

  it('shows the sidebar from 768px and the menu button below it, both named Primary navigation', async () => {
    const wrapper = await shellAt('/')
    const sidebar = wrapper.get('.app-sidebar')
    expect(sidebar.classes()).toEqual(expect.arrayContaining(['d-none', 'd-md-block']))
    expect(sidebar.get('nav').attributes('aria-label')).toBe('Primary navigation')
    const topNav = wrapper.get('header nav')
    expect(topNav.classes()).toContain('d-md-none')
    expect(topNav.attributes('aria-label')).toBe('Primary navigation')
  })

  it('marks only the current page, with aria-current', async () => {
    const wrapper = await shellAt('/classrooms/c1/help')
    const current = wrapper.findAll('.app-sidebar [aria-current="page"]')
    expect(current.map((link) => link.text())).toEqual(['Help queue'])
  })

  it.each([
    ['/classrooms/c1', 'section-challenges'],
    ['/classrooms/c1/help', 'section-help'],
    ['/mini-projects/mp1', 'section-projects'],
    ['/profiles/u1', 'section-progress'],
  ])(
    'gives the layout on %s the class %s, so the sidebar matches the page',
    async (path, section) => {
      const wrapper = await shellAt(path)
      expect(wrapper.get('.app-layout').classes()).toContain(section)
    },
  )

  it('gives the layout no section class on a page without one', async () => {
    const wrapper = await shellAt('/')
    expect(
      wrapper
        .get('.app-layout')
        .classes()
        .filter((name) => name.startsWith('section-')),
    ).toEqual([])
  })
  // UI refresh 3.
  const groupLabels = (wrapper) =>
    wrapper.findAll('.app-sidebar .app-nav-label').map((p) => p.text())

  it.each([
    ['/', ['Overview', 'Account']],
    ['/classrooms/c1', ['Overview', 'This classroom', 'Account']],
    ['/challenges/ch1', ['Overview', 'Account']],
  ])('logged in on %s, shows the groups %j', async (path, labels) => {
    const wrapper = await shellAt(path)
    expect(groupLabels(wrapper)).toEqual(labels)
  })

  // Login is the only page a logged-out person can reach, so links to the other
  // pages, or to login itself, would only lead back there (2026-10-29).
  it('logged out, shows no sidebar, menu button or chip, and the wordmark at every width', async () => {
    const wrapper = await shellAt('/login', { loggedIn: false })
    expect(wrapper.find('.app-sidebar').exists()).toBe(false)
    expect(wrapper.find('button.navbar-toggler').exists()).toBe(false)
    expect(wrapper.find('header a').exists()).toBe(false)
    expect(wrapper.findAll('.app-wordmark')).toHaveLength(1)
    expect(wrapper.get('.app-wordmark').classes()).not.toContain('d-md-none')
    expect(wrapper.get('.app-layout').classes()).toContain('app-layout-solo')
  })

  it('labels each sidebar list by its group heading', async () => {
    const wrapper = await shellAt('/classrooms/c1')
    for (const list of wrapper.findAll('.app-sidebar ul')) {
      const label = wrapper.get(`#${list.attributes('aria-labelledby')}`)
      expect(label.classes()).toContain('app-nav-label')
    }
  })

  it('gives every link an icon that is hidden from screen readers', async () => {
    const wrapper = await shellAt('/classrooms/c1')
    for (const link of wrapper.findAll('.app-sidebar a, #primary-navigation a')) {
      expect(link.get('svg.le-icon').attributes('aria-hidden')).toBe('true')
    }
  })
})

// Tests for G12 (decision G-12), moved to the logged-in user in G16 Step 9
// and to that user's own name in Step 11.
describe('profile chip (G12)', () => {
  const aliceId = '507f1f77bcf86cd799439101'
  const bobId = '507f1f77bcf86cd799439102'
  const { currentUser } = useCurrentUser()
  // Sets who is logged in, as useCurrentUser does after login or refresh.
  const logIn = (id, displayName) => {
    currentUser.value = id ? { id, username: 'someone', displayName, role: 'student' } : null
  }
  const chip = (wrapper) => wrapper.find('header a.app-chip')
  // The chip takes the name from the logged-in user, so the shell asks the server nothing.
  const noRequests = () => expect(api.get).not.toHaveBeenCalled()

  async function shellWith(id, displayName) {
    logIn(id, displayName)
    api.get.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(App, options())
    await router.push('/')
    await flushPromises()
    return wrapper
  }

  afterEach(() => logIn(null))

  it('when logged out, shows no chip, since login is the only page there is', async () => {
    const wrapper = await shellWith(null)
    expect(chip(wrapper).exists()).toBe(false)
    noRequests()
  })

  it("shows the logged-in user's avatar and name at once, linking to their profile", async () => {
    const wrapper = await shellWith(aliceId, 'Alice Tan')
    expect(chip(wrapper).attributes('href')).toBe(`/profiles/${aliceId}`)
    expect(chip(wrapper).get('.app-chip-name').text()).toBe('Alice Tan')
    const img = chip(wrapper).get('img')
    expect(img.attributes('src')).toBe(`https://api.dicebear.com/10.x/thumbs/svg?seed=${aliceId}`)
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes('style')).toBe('width: 2rem; height: 2rem;')
    noRequests()
  })

  it('comes before the menu button, so Tab reaches it first on phones', async () => {
    const wrapper = await shellWith(aliceId, 'Alice Tan')
    const bar = [...wrapper.get('.app-bar-inner').element.children].map((el) => el.className)
    expect(bar.findIndex((name) => name.includes('app-chip'))).toBeLessThan(
      bar.findIndex((name) => name.includes('app-nav-wrap')),
    )
  })

  it('shows a new name as soon as the profile page saves it', async () => {
    const wrapper = await shellWith(aliceId, 'Alice')
    // What ProfileView does after PUT /users/me answers (G16 Step 11).
    currentUser.value = { ...currentUser.value, displayName: 'Alice Tan' }
    await flushPromises()
    expect(chip(wrapper).get('.app-chip-name').text()).toBe('Alice Tan')
    expect(chip(wrapper).attributes('href')).toBe(`/profiles/${aliceId}`)
    noRequests()
  })

  it('follows a login as someone else, and a logout, without a reload', async () => {
    const wrapper = await shellWith(aliceId, 'Alice Tan')
    logIn(bobId, 'Bob Lim')
    await flushPromises()
    expect(chip(wrapper).get('.app-chip-name').text()).toBe('Bob Lim')
    expect(chip(wrapper).attributes('href')).toBe(`/profiles/${bobId}`)
    expect(chip(wrapper).get('img').attributes('src')).toContain(`seed=${bobId}`)

    logIn(null)
    await flushPromises()
    expect(chip(wrapper).exists()).toBe(false)
    noRequests()
  })
})

// Tests for G16 Step 10 (Log out).
describe('Log out (G16 Step 10)', () => {
  const { currentUser } = useCurrentUser()
  // Since UI refresh 3, Log out sits at the bottom of the sidebar from 768px.
  const barButton = (wrapper) => wrapper.find('.app-sidebar button.app-logout')
  const menuButton = (wrapper) => wrapper.find('#primary-navigation button')
  function deferred() {
    let resolve, reject
    const promise = new Promise((ok, fail) => {
      resolve = ok
      reject = fail
    })
    return { promise, resolve, reject }
  }

  async function loggedInShell() {
    setSessionToken('tok-1')
    currentUser.value = { id: 'user-a', username: 'alice.t', displayName: 'Alice', role: 'student' }
    api.get.mockReturnValue(new Promise(() => {}))
    logoutRequest.mockResolvedValue(undefined)
    const wrapper = mount(App, options())
    await router.push('/classrooms/c1?tab=2')
    await flushPromises()
    return wrapper
  }

  afterEach(() => {
    currentUser.value = null
    window.localStorage.clear()
  })

  it('has no Log out button anywhere when logged out', async () => {
    api.get.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(App, options())
    await router.push('/')
    await flushPromises()
    expect(barButton(wrapper).exists()).toBe(false)
    expect(menuButton(wrapper).exists()).toBe(false)
  })

  it('offers Log out in the sidebar and the phone menu, as buttons outside any link, and not in the bar', async () => {
    const wrapper = await loggedInShell()
    for (const button of [barButton(wrapper), menuButton(wrapper)]) {
      expect(button.text()).toBe('Log out')
      expect(button.attributes('type')).toBe('button')
      expect(button.element.closest('a')).toBeNull()
    }
    expect(wrapper.find('.app-bar-inner > button').exists()).toBe(false)
    expect(wrapper.get('header a.app-chip').text()).toBe('Alice')
  })

  it('is the last control in the sidebar and in the phone menu, so Tab reaches it after every page link', async () => {
    const wrapper = await loggedInShell()
    for (const list of ['.app-sidebar nav', '#primary-navigation']) {
      const controls = wrapper.get(list).findAll('a, button')
      expect(controls.at(-1).text()).toBe('Log out')
      expect(controls.at(-2).text()).toBe('Your profile')
    }
  })

  it('logged in on a classroom page, shows Overview, This classroom and Account, with the profile link last before Log out', async () => {
    const wrapper = await loggedInShell()
    expect(wrapper.findAll('.app-sidebar .app-nav-label').map((p) => p.text())).toEqual([
      'Overview',
      'This classroom',
      'Account',
    ])
    expect(
      wrapper.findAll('.app-sidebar a').map((a) => `${a.text()} ${a.attributes('href')}`),
    ).toEqual([
      'Dashboard /',
      'Take a break /take-a-break',
      'Classroom /classrooms/c1',
      'Help queue /classrooms/c1/help',
      'Your profile /profiles/user-a',
    ])
  })

  it('leaves for login with no redirect, then tells the server and forgets the session', async () => {
    const wrapper = await loggedInShell()
    const reply = deferred()
    let pageAtLogout = ''
    logoutRequest.mockImplementation(() => {
      pageAtLogout = router.currentRoute.value.fullPath
      return reply.promise
    })
    await barButton(wrapper).trigger('click')
    await flushPromises()
    expect(logoutRequest).toHaveBeenCalledOnce()
    // The page must be gone first: a page that reloads when the user changes
    // would otherwise reload with no token, and the 401 ends on /login?redirect=.
    expect(pageAtLogout).toBe('/login')
    expect(getSessionToken()).not.toBeNull()

    reply.resolve()
    await flushPromises()
    expect(getSessionToken()).toBeNull()
    expect(currentUser.value).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/login')
    expect(wrapper.find('header a.app-chip').exists()).toBe(false)
    expect(barButton(wrapper).exists()).toBe(false)
  })

  it('logs out from the phone menu and closes it', async () => {
    const wrapper = await loggedInShell()
    await wrapper.get('button.navbar-toggler').trigger('click')
    expect(wrapper.get('#primary-navigation').classes()).toContain('show')
    await menuButton(wrapper).trigger('click')
    await flushPromises()
    // Logged out the menu is gone; it is still closed when the next person logs in.
    expect(wrapper.find('#primary-navigation').exists()).toBe(false)
    expect(getSessionToken()).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/login')
    currentUser.value = { id: 'user-b', username: 'bob', displayName: 'Bob', role: 'student' }
    await flushPromises()
    expect(wrapper.get('#primary-navigation').classes()).not.toContain('show')
    expect(wrapper.get('button.navbar-toggler').attributes('aria-expanded')).toBe('false')
  })

  it('still logs out on this device when the server cannot be reached', async () => {
    const wrapper = await loggedInShell()
    logoutRequest.mockRejectedValue(new Error('Network Error'))
    await barButton(wrapper).trigger('click')
    await flushPromises()
    expect(getSessionToken()).toBeNull()
    expect(currentUser.value).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})
