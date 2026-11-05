import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../services/api.js'
import { clearSessionToken, getSessionToken, setSessionToken } from '../utils/sessionToken.js'

const key = 'learn-e.sessionToken'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

function blockStorage() {
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('Storage is blocked', 'SecurityError')
    })
  }
}

describe('sessionToken (G16 Step 8)', () => {
  it('returns null when nothing is stored', () => {
    expect(getSessionToken()).toBeNull()
  })

  it('stores the trimmed token under its own key and nothing else', () => {
    setSessionToken('  tok-1  ')
    expect(getSessionToken()).toBe('tok-1')
    expect(window.localStorage.length).toBe(1)
    expect(window.localStorage.getItem(key)).toBe('tok-1')
  })

  it('treats a blank stored value as no token', () => {
    window.localStorage.setItem(key, '   ')
    expect(getSessionToken()).toBeNull()
  })

  it.each(['', '   ', undefined, null, 12, { token: 'tok-2' }])(
    'rejects %j loudly and keeps the previous token',
    (bad) => {
      setSessionToken('tok-1')
      expect(() => setSessionToken(bad)).toThrow(
        new TypeError('Session token must be a non-empty string'),
      )
      expect(getSessionToken()).toBe('tok-1')
    },
  )

  it('clears the token', () => {
    setSessionToken('tok-1')
    clearSessionToken()
    expect(getSessionToken()).toBeNull()
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('never throws when storage is blocked, and reads as logged out', () => {
    blockStorage()
    expect(getSessionToken()).toBeNull()
    expect(() => setSessionToken('tok-1')).not.toThrow()
    expect(() => clearSessionToken()).not.toThrow()
  })
})

describe('api request interceptor (G16 Step 8)', () => {
  // A fake transport records each request's final config instead of sending it.
  let sent
  const adapter = async (config) => {
    sent.push(config)
    return { data: { data: null }, status: 200, statusText: 'OK', headers: {}, config }
  }
  beforeEach(() => {
    sent = []
  })

  it('sends no Authorization header when there is no token', async () => {
    await api.get('/classrooms/c1', { adapter })
    expect(sent[0].headers.Authorization).toBeUndefined()
  })

  it('sends the stored token as a Bearer header', async () => {
    setSessionToken('tok-1')
    await api.post('/classrooms/join', { joinCode: 'ABC' }, { adapter })
    expect(sent[0].headers.Authorization).toBe('Bearer tok-1')
  })

  it('reads the token fresh on every request, so login and logout apply at once', async () => {
    await api.get('/x', { adapter })
    setSessionToken('tok-1')
    await api.get('/x', { adapter })
    setSessionToken('tok-2')
    await api.get('/x', { adapter })
    clearSessionToken()
    await api.get('/x', { adapter })
    expect(sent.map((config) => config.headers.Authorization)).toEqual([
      undefined,
      'Bearer tok-1',
      'Bearer tok-2',
      undefined,
    ])
  })

  it('keeps per-request options such as the Gemini timeout', async () => {
    setSessionToken('tok-1')
    await api.post('/challenges/q1/hint-drafts', {}, { adapter, timeout: 35000 })
    expect(sent[0].timeout).toBe(35000)
    expect(sent[0].headers.Authorization).toBe('Bearer tok-1')
  })

  it('never sends the id the old user switcher stored', async () => {
    window.localStorage.setItem('learn-e.prototypeUserId', 'user-1')
    setSessionToken('tok-1')
    await api.get('/x', { adapter })
    expect(JSON.stringify(sent[0].headers)).not.toContain('user-1')
  })

  it('still lets a page load when storage is blocked', async () => {
    blockStorage()
    await api.get('/x', { adapter })
    expect(sent).toHaveLength(1)
    expect(sent[0].headers.Authorization).toBeUndefined()
  })
})
