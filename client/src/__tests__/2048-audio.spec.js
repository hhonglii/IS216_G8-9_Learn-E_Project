import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useSlideSound } from '../games/useSlideSound.js'

let wrapper
let hidden

function mountSound({ musicOff = false } = {}) {
  if (musicOff) localStorage.setItem('learn-e-2048-music-muted', 'true')
  let sound
  wrapper = mount(
    defineComponent({
      setup() {
        sound = useSlideSound()
        return () => null
      },
    }),
  )
  return sound
}

function parameter() {
  return {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
}

function mockAudio(initialState = 'running') {
  const oscillators = []
  const sources = []
  const gains = []
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn() })
  const context = {
    state: initialState,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: vi.fn(() => {
      const gain = { ...node(), gain: parameter() }
      gains.push(gain)
      return gain
    }),
    createDynamicsCompressor: vi.fn(() => ({
      ...node(),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter(),
    })),
    createBiquadFilter: vi.fn(() => ({ ...node(), frequency: parameter(), Q: parameter() })),
    createBuffer: vi.fn((channels, length) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: vi.fn(() => {
      const bufferSource = source()
      sources.push(bufferSource)
      return bufferSource
    }),
    createOscillator: vi.fn(() => {
      const oscillator = { ...source(), frequency: parameter() }
      oscillators.push(oscillator)
      return oscillator
    }),
    resume: vi.fn(async () => {
      context.state = 'running'
      context.onstatechange?.()
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const constructor = vi.fn(function () {
    return context
  })
  vi.stubGlobal('AudioContext', constructor)
  vi.stubGlobal('webkitAudioContext', undefined)
  return { context, constructor, oscillators, sources, gains }
}

function deferResume(context) {
  let finish
  context.resume.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => {
          context.state = 'running'
          resolve()
        }
      }),
  )
  return () => finish()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  localStorage.removeItem('learn-e-2048-muted')
  localStorage.removeItem('learn-e-2048-music-muted')
  localStorage.removeItem('learn-e-overclock-muted')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('2048 cyber audio', () => {
  it('defaults both channels on without creating audio or scheduling before a gesture', () => {
    const { constructor } = mockAudio()
    localStorage.setItem('learn-e-overclock-muted', 'true')
    const sound = mountSound()
    expect(sound.muted.value).toBe(false)
    expect(sound.musicMuted.value).toBe(false)
    expect(sound.musicPlaying.value).toBe(false)
    expect(constructor).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts only one music scheduler after repeated activation gestures', async () => {
    const { constructor, oscillators } = mockAudio()
    const sound = mountSound()
    await sound.activate()
    const initialNotes = oscillators.length
    await sound.activate()
    await sound.activate()
    expect(constructor).toHaveBeenCalledOnce()
    expect(sound.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    expect(oscillators).toHaveLength(initialNotes)
    expect(initialNotes).toBeGreaterThan(0)
  })

  it('plays one independent digital sweep for every slide, including consecutive moves', () => {
    const { context, oscillators } = mockAudio()
    const sound = mountSound({ musicOff: true })
    sound.playSlide()
    sound.playSlide()
    sound.playSlide()
    expect(context.createOscillator).toHaveBeenCalledTimes(3)
    for (const oscillator of oscillators) {
      expect(oscillator.type).toBe('triangle')
      expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(650, 0.003)
      expect(oscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        170,
        0.08800000000000001,
      )
      expect(oscillator.start).toHaveBeenCalledOnce()
    }
    expect(sound.musicPlaying.value).toBe(false)
  })

  it('mutes effects and music independently and preserves both preferences', async () => {
    const { oscillators, gains } = mockAudio()
    const sound = mountSound()
    await sound.activate()
    const musicNotes = oscillators.length
    await sound.toggleMute()
    sound.playSlide()
    expect(oscillators).toHaveLength(musicNotes)
    expect(sound.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    expect(gains[1].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    await sound.toggleMute()
    sound.playSlide()
    const effect = oscillators.at(-1)
    await sound.toggleMusic()
    expect(sound.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(effect.stop).toHaveBeenCalledOnce()
    sound.playSlide()
    expect(oscillators).toHaveLength(musicNotes + 2)
    expect(localStorage.getItem('learn-e-2048-muted')).toBe('false')
    expect(localStorage.getItem('learn-e-2048-music-muted')).toBe('true')
    await sound.toggleMusic()
    expect(sound.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('honours saved channel preferences without initializing an unused context', async () => {
    const { constructor } = mockAudio()
    localStorage.setItem('learn-e-2048-muted', 'true')
    const sound = mountSound({ musicOff: true })
    sound.playSlide()
    await sound.activate()
    expect(sound.muted.value).toBe(true)
    expect(sound.musicMuted.value).toBe(true)
    expect(constructor).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the music going when the player switches to another tab', async () => {
    mockAudio()
    const sound = mountSound()
    await sound.activate()
    hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(200)
    expect(sound.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('handles unsupported audio and unavailable storage without throwing', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage denied')
    })
    const sound = mountSound()
    expect(sound.supported.value).toBe(false)
    expect(await sound.activate()).toBe(false)
    expect(() => sound.playSlide()).not.toThrow()
    await expect(sound.toggleMute()).resolves.toBeUndefined()
    await expect(sound.toggleMusic()).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries denied resume on a later gesture and cleans notes, timer, and context', async () => {
    const { context, oscillators } = mockAudio('suspended')
    context.resume.mockRejectedValueOnce(new Error('Autoplay denied'))
    const sound = mountSound()
    expect(await sound.activate()).toBe(false)
    expect(sound.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(context.resume).toHaveBeenCalledOnce()
    sound.playSlide()
    await flushPromises()
    expect(context.resume).toHaveBeenCalledTimes(2)
    expect(sound.musicPlaying.value).toBe(true)
    expect(oscillators.length).toBeGreaterThan(1)
    wrapper.unmount()
    wrapper = null
    expect(sound.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(context.close).toHaveBeenCalledOnce()
    for (const oscillator of oscillators) expect(oscillator.disconnect).toHaveBeenCalledOnce()
    const count = oscillators.length
    sound.playSlide()
    expect(oscillators).toHaveLength(count)
  })

  it('recreates a browser-closed device on a later gesture and resumes both channels', async () => {
    const first = mockAudio()
    const sound = mountSound()
    await sound.activate()
    first.context.state = 'closed'
    first.context.onstatechange()
    expect(sound.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    const replacement = mockAudio()
    first.constructor.mockImplementationOnce(function () {
      return replacement.context
    })
    sound.playSlide()
    expect(first.constructor).toHaveBeenCalledTimes(2)
    expect(sound.supported.value).toBe(true)
    expect(sound.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    expect(
      replacement.oscillators.some(
        (oscillator) => oscillator.frequency.setValueAtTime.mock.calls[0][0] === 650,
      ),
    ).toBe(true)
    expect(first.context.onstatechange).toBeNull()
    for (const node of [...first.oscillators, ...first.sources])
      expect(node.disconnect).toHaveBeenCalledOnce()
  })

  it('keeps a replacement resume pending when an old device finishes resuming late', async () => {
    const first = mockAudio('suspended')
    const finishOld = deferResume(first.context)
    const sound = mountSound()
    const pendingOld = sound.activate()
    first.context.state = 'closed'
    const replacement = mockAudio('suspended')
    const finishNew = deferResume(replacement.context)
    first.constructor.mockImplementationOnce(function () {
      return replacement.context
    })
    const pendingNew = sound.activate()
    finishOld()
    await pendingOld
    const repeated = sound.activate()
    expect(replacement.context.resume).toHaveBeenCalledOnce()
    finishNew()
    await Promise.all([pendingNew, repeated])
    expect(sound.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('cancels a queued slide when effects are muted during resume', async () => {
    const { context, oscillators } = mockAudio('suspended')
    const finish = deferResume(context)
    const sound = mountSound({ musicOff: true })
    sound.playSlide()
    await sound.toggleMute()
    finish()
    await flushPromises()
    expect(oscillators).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    await sound.toggleMute()
    sound.playSlide()
    expect(oscillators).toHaveLength(1)
  })

  it('cancels queued music without cancelling an enabled slide effect', async () => {
    const { context, oscillators } = mockAudio('suspended')
    const finish = deferResume(context)
    const sound = mountSound()
    sound.playSlide()
    await sound.toggleMusic()
    finish()
    await flushPromises()
    expect(sound.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].frequency.setValueAtTime.mock.calls[0][0]).toBe(650)
  })

  it('does not schedule queued effects or music after unmounting during resume', async () => {
    const { context, oscillators } = mockAudio('suspended')
    const finish = deferResume(context)
    const sound = mountSound()
    sound.playSlide()
    wrapper.unmount()
    wrapper = null
    finish()
    await flushPromises()
    expect(oscillators).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('continues music without input while dropping late beats and bounding active voices', async () => {
    const { context, oscillators, sources } = mockAudio()
    const sound = mountSound()
    await sound.activate()
    const initial = oscillators.length
    for (let tick = 1; tick <= 40; tick += 1) {
      context.currentTime = tick * 0.05
      vi.advanceTimersByTime(50)
    }
    expect(oscillators.length).toBeGreaterThan(initial + 5)
    expect(sources.length).toBeGreaterThan(0)
    expect(context.createBuffer).toHaveBeenCalledOnce()
    const beforeLateTick = oscillators.length
    context.currentTime = 300
    vi.advanceTimersByTime(50)
    expect(oscillators.length - beforeLateTick).toBeLessThan(5)
    for (let index = 0; index < 100; index += 1) sound.playSlide()
    expect(
      [...oscillators, ...sources].filter((node) => node.disconnect.mock.calls.length === 0),
    ).toHaveLength(48)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('contains device construction and synchronous resume failures', async () => {
    const { context } = mockAudio('suspended')
    context.resume.mockImplementationOnce(() => {
      throw new Error('Device unavailable')
    })
    const sound = mountSound({ musicOff: true })
    sound.playSlide()
    await flushPromises()
    expect(await sound.activate()).toBe(true)
    sound.dispose()
    wrapper.unmount()
    wrapper = null
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('Device unavailable')
      }),
    )
    const unavailable = mountSound()
    expect(() => unavailable.playSlide()).not.toThrow()
    expect(unavailable.supported.value).toBe(false)
  })
})
