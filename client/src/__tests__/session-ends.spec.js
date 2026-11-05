// Tests for G16 Step 10 (the session-ended interceptor and main.js start-up).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { flushPromises } from '@vue/test-utils'

// Each test loads fresh copies of api.js (and main.js), so a handler registered by one
// test, and the app it mounted, cannot leak into the next.
let api
let replies
const okReply = (config, data = []) => ({
  data: { data },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
})
function errorReply(config, status, code) {
  const data = { error: { code, message: code, details: null } }
  const response = { status, data, headers: {}, config }
  const message = `Request failed with status code ${status}`
  return new AxiosError(message, 'ERR_BAD_REQUEST', config, null, response)
}
async function loadApi() {
  const module = await import('../services/api.js')
  api = module.api
  // A fake transport: a reply keyed by URL is [status, code], a function, or an Error.
  api.defaults.adapter = async (config) => {
    const reply = replies[config.url]
    if (typeof reply === 'function') return reply(config)
    if (reply instanceof Error) throw reply
    if (reply) throw errorReply(config, ...reply)
    return okReply(config)
  }
  return module
}

beforeEach(() => {
  vi.resetModules()
  replies = {}
  window.localStorage.clear()
})
afterEach(() => {
  window.localStorage.clear()
  document.body.innerHTML = ''
})

describe('session-ended interceptor (G16 Step 10)', () => {
  it.each([['INVALID_SESSION'], ['UNAUTHENTICATED']])(
    'calls the handler once on 401 %s and still rejects with the server error',
    async (code) => {
      const { whenSessionEnds } = await loadApi()
      const ended = vi.fn()
      whenSessionEnds(ended)
      replies['/classrooms/c1'] = [401, code]
      await expect(api.get('/classrooms/c1')).rejects.toMatchObject({
        response: { status: 401, data: { error: { code } } },
      })
      expect(ended).toHaveBeenCalledOnce()
    },
  )

  it.each([
    ['a wrong current password', 401, 'INVALID_CREDENTIALS'],
    ['a refusal', 403, 'FORBIDDEN'],
    ['a missing record', 404, 'NOT_FOUND'],
    ['a server error that reuses the code', 500, 'INVALID_SESSION'],
  ])('leaves the session alone on %s', async (_label, status, code) => {
    const { whenSessionEnds } = await loadApi()
    const ended = vi.fn()
    whenSessionEnds(ended)
    replies['/x'] = [status, code]
    await expect(api.get('/x')).rejects.toMatchObject({ response: { status } })
    expect(ended).not.toHaveBeenCalled()
  })

  it('leaves the session alone when a 401 has no error body or there is no reply', async () => {
    const { whenSessionEnds } = await loadApi()
    const ended = vi.fn()
    whenSessionEnds(ended)
    replies['/bare'] = (config) => {
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, null, {
        status: 401,
        data: '',
        headers: {},
        config,
      })
    }
    replies['/offline'] = new AxiosError('Network Error', 'ERR_NETWORK')
    await expect(api.get('/bare')).rejects.toMatchObject({ response: { status: 401 } })
    await expect(api.get('/offline')).rejects.toThrow('Network Error')
    expect(ended).not.toHaveBeenCalled()
  })

  it('does nothing extra before a handler is registered, and passes good replies through', async () => {
    await loadApi()
    replies['/classrooms/c1'] = [401, 'INVALID_SESSION']
    await expect(api.get('/classrooms/c1')).rejects.toMatchObject({ response: { status: 401 } })
    await expect(api.get('/health')).resolves.toMatchObject({ status: 200 })
  })

  it('uses only the latest handler', async () => {
    const { whenSessionEnds } = await loadApi()
    const first = vi.fn()
    const second = vi.fn()
    whenSessionEnds(first)
    whenSessionEnds(second)
    replies['/x'] = [401, 'INVALID_SESSION']
    await api.get('/x').catch(() => {})
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})

describe('main.js start-up and session end (G16 Step 10)', () => {
  // Boots the real main.js at the given address, then hands back the same module copies it uses.
  async function boot(path) {
    window.history.replaceState(null, '', path)
    document.body.innerHTML = '<div id="app"></div>'
    await loadApi()
    await import('../main.js')
    const router = (await import('../router/index.js')).default
    const { useCurrentUser } = await import('../composables/useCurrentUser.js')
    const { getSessionToken } = await import('../utils/sessionToken.js')
    return { router, useCurrentUser, getSessionToken }
  }
  const alice = { id: 'user-a', username: 'alice.t', displayName: 'Alice', role: 'student' }

  it('mounts only after the stored session has been checked', async () => {
    window.localStorage.setItem('learn-e.sessionToken', 'tok-1')
    let answer
    replies['/auth/me'] = (config) =>
      new Promise((resolve) => {
        answer = () => resolve(okReply(config, alice))
      })
    const { router, useCurrentUser } = await boot('/take-a-break')
    await flushPromises()
    expect(document.getElementById('app').innerHTML).toBe('')
    expect(router.currentRoute.value.matched).toEqual([])

    answer()
    await flushPromises()
    await router.isReady()
    expect(useCurrentUser().currentUserId.value).toBe('user-a')
    expect(router.currentRoute.value.fullPath).toBe('/take-a-break')
    expect(document.getElementById('app').innerHTML).not.toBe('')
  })

  it('starts on login, without errors, when the stored session has expired', async () => {
    window.localStorage.setItem('learn-e.sessionToken', 'tok-old')
    replies['/auth/me'] = [401, 'INVALID_SESSION']
    const { router, getSessionToken } = await boot('/classrooms/c1')
    await flushPromises()
    await router.isReady()
    expect(getSessionToken()).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/classrooms/c1' })
  })

  it('logs out and sends the person to login, remembering the full address, when the session ends', async () => {
    const { router, useCurrentUser, getSessionToken } = await boot('/login')
    await flushPromises()
    await router.isReady()
    window.localStorage.setItem('learn-e.sessionToken', 'tok-1')
    useCurrentUser().currentUser.value = alice
    await router.push('/classrooms/c1?tab=2')

    replies['/classrooms/c1'] = [401, 'INVALID_SESSION']
    await expect(api.get('/classrooms/c1')).rejects.toMatchObject({ response: { status: 401 } })
    await flushPromises()
    expect(getSessionToken()).toBeNull()
    expect(useCurrentUser().currentUser.value).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/classrooms/c1?tab=2' })
    expect(window.location.pathname + window.location.search).toBe(
      '/login?redirect=/classrooms/c1?tab=2',
    )
  })

  it('stays on the login page, keeping its redirect, when the session ends there', async () => {
    const { router, getSessionToken } = await boot('/login?redirect=/take-a-break')
    await flushPromises()
    await router.isReady()
    window.localStorage.setItem('learn-e.sessionToken', 'tok-1')
    replies['/x'] = [401, 'UNAUTHENTICATED']
    await api.get('/x').catch(() => {})
    await flushPromises()
    expect(getSessionToken()).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/take-a-break')
  })

  it('keeps the person logged in after a wrong current password', async () => {
    const { router, useCurrentUser, getSessionToken } = await boot('/login')
    await flushPromises()
    await router.isReady()
    window.localStorage.setItem('learn-e.sessionToken', 'tok-1')
    useCurrentUser().currentUser.value = alice
    await router.push('/take-a-break')
    replies['/auth/password'] = [401, 'INVALID_CREDENTIALS']
    await api.put('/auth/password').catch(() => {})
    await flushPromises()
    expect(getSessionToken()).toBe('tok-1')
    expect(useCurrentUser().currentUserId.value).toBe('user-a')
    expect(router.currentRoute.value.fullPath).toBe('/take-a-break')
  })
})
