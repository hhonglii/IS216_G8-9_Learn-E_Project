// A tab opened before a redeploy asks for page files the new build no longer
// has. reloadForNewBuild reloads once to fetch the new build, but not again
// within a few seconds, so a real outage can't reload forever.
import { describe, expect, it, vi } from 'vitest'
import { RELOAD_GAP_MS, reloadForNewBuild } from '../utils/staleBuild.js'

function memoryStorage() {
  const items = {}
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value
    },
  }
}
const loadFailure = () => new Event('vite:preloadError', { cancelable: true })

describe('reloadForNewBuild', () => {
  it('reloads and stops the error when a page file fails to load', () => {
    const reload = vi.fn()
    const event = loadFailure()
    reloadForNewBuild(event, { storage: memoryStorage(), reload, now: 50_000 })
    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('lets the error through if it already reloaded moments ago', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    reloadForNewBuild(loadFailure(), { storage, reload, now: 50_000 })
    const again = loadFailure()
    reloadForNewBuild(again, { storage, reload, now: 50_000 + RELOAD_GAP_MS - 1 })
    expect(reload).toHaveBeenCalledTimes(1)
    expect(again.defaultPrevented).toBe(false)
  })

  it('reloads again for a later redeploy', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    reloadForNewBuild(loadFailure(), { storage, reload, now: 50_000 })
    reloadForNewBuild(loadFailure(), { storage, reload, now: 50_000 + RELOAD_GAP_MS })
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it("doesn't reload when the browser blocks storage, since it couldn't stop a loop", () => {
    const reload = vi.fn()
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const event = loadFailure()
    reloadForNewBuild(event, { storage: blocked, reload, now: 50_000 })
    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
