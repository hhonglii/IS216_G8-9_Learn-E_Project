import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useRetroAudio } from '../games/rootkit/useRetroAudio.js'

let wrapper
let clock

function mountAudio() {
  let audio
  wrapper = mount(
    defineComponent({
      setup() {
        audio = useRetroAudio()
        return () => null
      },
    }),
  )
  return audio
}

const parameter = () => ({
  value: 0,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
})

function mockAudio(initialState = 'running') {
  const oscillators = []
  const sources = []
  const filters = []
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
    createBiquadFilter: vi.fn(() => {
      const filter = { ...node(), frequency: parameter(), Q: parameter() }
      filters.push(filter)
      return filter
    }),
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
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const constructor = vi.fn(function () {
    return context
  })
  vi.stubGlobal('AudioContext', constructor)
  vi.stubGlobal('webkitAudioContext', undefined)
  return { context, constructor, oscillators, sources, filters, gains }
}

beforeEach(() => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  localStorage.removeItem('learn-e-rootkit-muted')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RootKitOS procedural audio', () => {
  it('defaults to audible with no context created on mount', () => {
    const { constructor } = mockAudio()
    const audio = mountAudio()
    expect(audio.muted.value).toBe(false)
    expect(constructor).not.toHaveBeenCalled()
  })

  it('uses a short bandpass noise click and square transient with bounded pitch variation', () => {
    const { oscillators, sources, filters } = mockAudio()
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const audio = mountAudio()
    audio.play('key')
    random.mockReturnValue(1)
    clock.mockReturnValue(1020)
    audio.play('key')
    expect(sources).toHaveLength(2)
    expect(oscillators).toHaveLength(2)
    expect(oscillators.map((oscillator) => oscillator.type)).toEqual(['square', 'square'])
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(1700 * 0.92, 0.003)
    expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1700 * 1.08, 0.003)
    expect(filters.map((filter) => filter.type)).toEqual(['bandpass', 'bandpass'])
    expect(filters[0].frequency.setValueAtTime).toHaveBeenCalledWith(2200 * 0.92, 0.003)
    expect(sources[0].stop.mock.calls[0][0]).toBeCloseTo(0.034)
  })

  it('throttles only rapid key bursts while normal typing keeps its own click', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('key')
    clock.mockReturnValue(1010)
    audio.play('key')
    clock.mockReturnValue(1018)
    audio.play('key')
    expect(oscillators).toHaveLength(2)
    audio.play('open')
    expect(oscillators).toHaveLength(4)
  })

  it.each([
    [
      'open',
      [
        [400, 800],
        [600, 1200],
      ],
    ],
    [
      'minimize',
      [
        [800, 400],
        [1200, 600],
      ],
    ],
  ])('plays %s as two short sine sweeps', (name, pitches) => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play(name)
    expect(oscillators).toHaveLength(2)
    oscillators.forEach((oscillator, index) => {
      expect(oscillator.type).toBe('sine')
      expect(oscillator.frequency.setValueAtTime.mock.calls[0][0]).toBe(pitches[index][0])
      expect(oscillator.frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBe(
        pitches[index][1],
      )
      expect(oscillator.stop.mock.calls[0][0] - oscillator.start.mock.calls[0][0]).toBeCloseTo(
        0.105,
      )
    })
  })

  it('plays an error as two filtered 110Hz sawtooth pulses', () => {
    const { oscillators, filters } = mockAudio()
    const audio = mountAudio()
    audio.play('error')
    expect(oscillators).toHaveLength(2)
    for (const oscillator of oscillators) {
      expect(oscillator.type).toBe('sawtooth')
      expect(oscillator.frequency.setValueAtTime.mock.calls[0][0]).toBe(110)
    }
    expect(
      oscillators[1].start.mock.calls[0][0] - oscillators[0].start.mock.calls[0][0],
    ).toBeCloseTo(0.11)
    expect(filters.every((filter) => filter.type === 'lowpass')).toBe(true)
  })

  it('plays the win sound as C5 E5 G5 C6 square-wave arpeggio', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('win')
    expect(oscillators).toHaveLength(4)
    const pitches = [523.251, 659.255, 783.991, 1046.502]
    oscillators.forEach((oscillator, index) => {
      expect(oscillator.type).toBe('square')
      expect(oscillator.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(pitches[index])
      expect(oscillator.start.mock.calls[0][0]).toBeCloseTo(0.003 + index * 0.085)
    })
  })

  it('stops existing voices instantly on mute and saves the preference', async () => {
    const { oscillators, sources, gains } = mockAudio()
    const audio = mountAudio()
    audio.play('key')
    await audio.toggleMute()
    audio.play('win')
    expect(audio.muted.value).toBe(true)
    expect(localStorage.getItem('learn-e-rootkit-muted')).toBe('true')
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].stop).toHaveBeenCalledTimes(2)
    expect(sources[0].stop).toHaveBeenCalledTimes(2)
    expect(gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
  })

  it('honours an existing mute preference without initializing audio', () => {
    const { constructor } = mockAudio()
    localStorage.setItem('learn-e-rootkit-muted', 'true')
    const audio = mountAudio()
    audio.play('open')
    expect(audio.muted.value).toBe(true)
    expect(constructor).not.toHaveBeenCalled()
  })

  it('handles denied autoplay and retries on the next user action', async () => {
    const { context, oscillators } = mockAudio('suspended')
    context.resume.mockRejectedValueOnce(new Error('Autoplay denied'))
    const audio = mountAudio()
    audio.play('open')
    await flushPromises()
    expect(oscillators).toHaveLength(0)
    audio.play('open')
    await flushPromises()
    expect(context.resume).toHaveBeenCalledTimes(2)
    expect(oscillators).toHaveLength(2)
  })

  it('cancels a sound queued during resume when the player mutes', async () => {
    const { context, oscillators } = mockAudio('suspended')
    let allowResume
    context.resume.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          allowResume = () => {
            context.state = 'running'
            resolve()
          }
        }),
    )
    const audio = mountAudio()
    audio.play('open')
    await audio.toggleMute()
    allowResume()
    await flushPromises()
    expect(oscillators).toHaveLength(0)
    await audio.toggleMute()
    audio.play('open')
    expect(oscillators).toHaveLength(2)
  })

  it('recreates a closed device context on the next action', () => {
    const first = mockAudio()
    const audio = mountAudio()
    audio.play('open')
    first.context.state = 'closed'
    const replacement = mockAudio()
    first.constructor.mockImplementationOnce(function () {
      return replacement.context
    })
    audio.play('open')
    expect(first.constructor).toHaveBeenCalledTimes(2)
    expect(replacement.oscillators).toHaveLength(2)
    expect(first.oscillators[0].disconnect).toHaveBeenCalledOnce()
  })

  it('keeps playing when the player switches to another tab', () => {
    const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('open')
    expect(oscillators).toHaveLength(2)
    visibility.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(oscillators.every((oscillator) => oscillator.stop.mock.calls.length === 1)).toBe(true)
    audio.play('win')
    expect(oscillators.length).toBeGreaterThan(2)
  })

  it('never plays a resumed promise after unmounting the game', async () => {
    const { context, oscillators } = mockAudio('suspended')
    let allowResume
    context.resume.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          allowResume = () => {
            context.state = 'running'
            resolve()
          }
        }),
    )
    const audio = mountAudio()
    audio.play('win')
    wrapper.unmount()
    wrapper = null
    allowResume()
    await flushPromises()
    expect(context.close).toHaveBeenCalledOnce()
    expect(oscillators).toHaveLength(0)
  })

  it('disables unavailable audio devices without throwing into a game action', () => {
    const { constructor } = mockAudio()
    constructor.mockImplementationOnce(function () {
      throw new Error('Output device unavailable')
    })
    const audio = mountAudio()
    expect(() => audio.play('open')).not.toThrow()
    expect(audio.supported.value).toBe(false)
    expect(() => audio.play('win')).not.toThrow()
    expect(constructor).toHaveBeenCalledOnce()
  })

  it('releases finished nodes and bounds the ledger during a large input burst', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('open')
    oscillators[0].onended()
    expect(oscillators[0].disconnect).toHaveBeenCalledOnce()
    for (let count = 0; count < 50; count += 1) audio.play('open')
    expect(
      oscillators.filter((oscillator) => oscillator.disconnect.mock.calls.length === 0),
    ).toHaveLength(48)
    wrapper.unmount()
    wrapper = null
    expect(oscillators[0].disconnect).toHaveBeenCalledOnce()
  })

  it('closes the sole context on unmount', () => {
    const { context, oscillators, sources } = mockAudio()
    const audio = mountAudio()
    audio.play('key')
    wrapper.unmount()
    wrapper = null
    expect(context.close).toHaveBeenCalledOnce()
    expect(oscillators[0].disconnect).toHaveBeenCalledOnce()
    expect(sources[0].disconnect).toHaveBeenCalledOnce()
    audio.play('win')
    expect(oscillators).toHaveLength(1)
  })

  it('degrades gracefully without audio or storage support', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage denied')
    })
    const audio = mountAudio()
    expect(audio.supported.value).toBe(false)
    expect(() => audio.play('win')).not.toThrow()
    await expect(audio.toggleMute()).resolves.toBeUndefined()
    await expect(audio.toggleMute()).resolves.toBeUndefined()
  })
})
