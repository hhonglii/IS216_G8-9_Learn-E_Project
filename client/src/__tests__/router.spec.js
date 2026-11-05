import { it, expect } from 'vitest'
import { routes } from '../router/index.js'

it('gives every feature page a section colour and leaves global pages and not-found neutral', () => {
  const sections = Object.fromEntries(routes.map((route) => [route.name, route.meta?.section]))
  expect(sections).toStrictEqual({
    dashboard: undefined,
    'take-a-break': undefined,
    classroom: 'challenges',
    challenge: 'challenges',
    'help-queue': 'help',
    'classroom-games': 'games',
    'mini-project': 'projects',
    'professor-review': 'progress',
    profile: 'progress',
    login: undefined,
    'not-found': undefined,
  })
})

// G16 Step 10: the guard lets only public routes through without a token. If the login page
// lost its flag, the guard would redirect /login to /login forever.
it('marks only the login page public', () => {
  expect(routes.filter((route) => route.meta?.public).map((route) => route.name)).toEqual(['login'])
})

// Third-pass audit: a new page starts at the top, and Back returns to the saved spot.
it('scrolls a new page to the top and restores the position on Back', async () => {
  const { default: router } = await import('../router/index.js')
  const scroll = router.options.scrollBehavior
  expect(scroll({ path: '/profile' }, { path: '/' }, null)).toEqual({ top: 0 })
  expect(scroll({ path: '/' }, { path: '/profile' }, { left: 0, top: 640 })).toEqual({
    left: 0,
    top: 640,
  })
})

// An #id link (View code snippet, the error summary, the ready checklist) stays on
// the same path. The browser has already moved there, so the router must not reset it.
it('leaves the scroll alone for an #id link on the same page', async () => {
  const { default: router } = await import('../router/index.js')
  const scroll = router.options.scrollBehavior
  expect(scroll({ path: '/challenges/c1' }, { path: '/challenges/c1' }, null)).toBe(false)
})
