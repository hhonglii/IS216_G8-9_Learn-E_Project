// Tests for G16 Step 9 (useCurrentUser and authApi).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '../services/api.js'
import { getMe, login, logout, register } from '../services/authApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
import { getSessionToken, setSessionToken } from '../utils/sessionToken.js'

const alice = { id: 'user-a', username: 'alice.t', displayName: 'Alice', role: 'student' }

// A fake transport on the real api instance, so the token interceptor runs too.
// Each reply is keyed by "METHOD url"; a number answers with that error status.
let sent
let replies
const realAdapter = api.defaults.adapter
function httpError(status, code) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: { code, message: code, details: null } } },
  })
}
beforeEach(() => {
  window.localStorage.clear()
  sent = []
  replies = {}
  api.defaults.adapter = async (config) => {
    sent.push(config)
    const reply = replies[`${config.method.toUpperCase()} ${config.url}`]
    if (reply instanceof Error) throw reply
    return { data: reply ?? null, status: 200, statusText: 'OK', headers: {}, config }
  }
})
afterEach(() => {
  api.defaults.adapter = realAdapter
  useCurrentUser().currentUser.value = null
  window.localStorage.clear()
})

const body = (config) => (config.data === undefined ? undefined : JSON.parse(config.data))

describe('authApi (G16 Step 9)', () => {
  it('register posts the fields as given and returns the reply body', async () => {
    const fields = { username: 'alice.t', displayName: 'Alice', password: 'long enough' }
    replies['POST /auth/register'] = { data: { token: 't', user: alice } }
    expect(await register(fields)).toEqual({ data: { token: 't', user: alice } })
    expect(sent[0].url).toBe('/auth/register')
    expect(body(sent[0])).toEqual(fields)
  })

  it('login posts exactly the username and password', async () => {
    replies['POST /auth/login'] = { data: { token: 't', user: alice } }
    expect(await login('alice.t', 'long enough')).toEqual({ data: { token: 't', user: alice } })
    expect(body(sent[0])).toEqual({ username: 'alice.t', password: 'long enough' })
  })

  it('logout and getMe send the stored token', async () => {
    setSessionToken('tok-1')
    replies['GET /auth/me'] = { data: alice }
    expect(await getMe()).toEqual({ data: alice })
    await logout()
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      'get /auth/me',
      'post /auth/logout',
    ])
    expect(sent.map((config) => config.headers.Authorization)).toEqual([
      'Bearer tok-1',
      'Bearer tok-1',
    ])
  })

  it('passes server errors on to the caller', async () => {
    replies['POST /auth/login'] = httpError(401, 'INVALID_CREDENTIALS')
    await expect(login('alice.t', 'wrong password')).rejects.toMatchObject({
      response: { status: 401 },
    })
  })
})

describe('useCurrentUser (G16 Step 9)', () => {
  it('shares one logged-in user between every caller', () => {
    const first = useCurrentUser()
    const second = useCurrentUser()
    expect(second.currentUser).toBe(first.currentUser)
    expect(second.currentUserId).toBe(first.currentUserId)
    first.currentUser.value = alice
    expect(second.currentUserId.value).toBe('user-a')
  })

  it('starts logged out, with a null id', () => {
    const { currentUser, currentUserId } = useCurrentUser()
    expect(currentUser.value).toBeNull()
    expect(currentUserId.value).toBeNull()
  })

  describe('refresh', () => {
    it('stays logged out without asking the server when there is no token', async () => {
      const { refresh, currentUser } = useCurrentUser()
      currentUser.value = alice
      await refresh()
      expect(currentUser.value).toBeNull()
      expect(sent).toHaveLength(0)
    })

    it('loads the user for a stored token', async () => {
      setSessionToken('tok-1')
      replies['GET /auth/me'] = { data: alice }
      const { refresh, currentUser, currentUserId } = useCurrentUser()
      await refresh()
      expect(sent[0].headers.Authorization).toBe('Bearer tok-1')
      expect(currentUser.value).toEqual(alice)
      expect(currentUserId.value).toBe('user-a')
    })

    it('forgets an expired or revoked token on 401', async () => {
      setSessionToken('tok-old')
      replies['GET /auth/me'] = httpError(401, 'INVALID_SESSION')
      const { refresh, currentUser } = useCurrentUser()
      currentUser.value = alice
      await refresh()
      expect(currentUser.value).toBeNull()
      expect(getSessionToken()).toBeNull()
    })

    it.each([
      ['a server error', httpError(500, 'INTERNAL_ERROR')],
      ['no reply at all', new Error('Network Error')],
    ])('keeps the token through %s, so a later refresh can still work', async (_label, error) => {
      setSessionToken('tok-1')
      replies['GET /auth/me'] = error
      const { refresh, currentUser } = useCurrentUser()
      await expect(refresh()).resolves.toBeUndefined()
      expect(currentUser.value).toBeNull()
      expect(getSessionToken()).toBe('tok-1')
    })
  })

  describe('login and register', () => {
    it.each([
      ['login', (auth) => auth.login('alice.t', 'long enough'), 'POST /auth/login'],
      [
        'register',
        (auth) => auth.register({ username: 'alice.t', displayName: 'Alice', password: 'x' }),
        'POST /auth/register',
      ],
    ])('%s keeps the token and the user from the reply', async (_name, act, route) => {
      replies[route] = { data: { token: 'tok-new', user: alice } }
      const auth = useCurrentUser()
      await act(auth)
      expect(getSessionToken()).toBe('tok-new')
      expect(auth.currentUser.value).toEqual(alice)
      expect(auth.currentUserId.value).toBe('user-a')
      // The very next request carries the new token.
      await api.get('/classrooms/c1')
      expect(sent.at(-1).headers.Authorization).toBe('Bearer tok-new')
    })

    it.each([
      ['login', (auth) => auth.login('alice.t', 'wrong'), 'POST /auth/login', 401],
      ['register', (auth) => auth.register({ username: 'taken' }), 'POST /auth/register', 409],
    ])('%s rethrows a refusal and changes nothing', async (_name, act, route, status) => {
      setSessionToken('tok-before')
      replies[route] = httpError(status, 'REFUSED')
      const auth = useCurrentUser()
      auth.currentUser.value = alice
      await expect(act(auth)).rejects.toMatchObject({ response: { status } })
      expect(getSessionToken()).toBe('tok-before')
      expect(auth.currentUser.value).toEqual(alice)
    })
  })

  describe('logout', () => {
    it('tells the server with the token, then forgets the token and user', async () => {
      setSessionToken('tok-1')
      const { logout: logOut, currentUser, currentUserId } = useCurrentUser()
      currentUser.value = alice
      await logOut()
      expect(sent[0].url).toBe('/auth/logout')
      expect(sent[0].headers.Authorization).toBe('Bearer tok-1')
      expect(getSessionToken()).toBeNull()
      expect(currentUser.value).toBeNull()
      expect(currentUserId.value).toBeNull()
    })

    it.each([
      ['the server is unreachable', new Error('Network Error')],
      ['the session had already ended', httpError(401, 'INVALID_SESSION')],
    ])('still logs out on this device when %s', async (_label, error) => {
      setSessionToken('tok-1')
      replies['POST /auth/logout'] = error
      const { logout: logOut, currentUser } = useCurrentUser()
      currentUser.value = alice
      await expect(logOut()).resolves.toBeUndefined()
      expect(getSessionToken()).toBeNull()
      expect(currentUser.value).toBeNull()
    })
  })
})
