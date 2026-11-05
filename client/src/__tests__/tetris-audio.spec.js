import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useTetrisAudio } from '../games/tetris/useTetrisAudio.js'

let wrapper
let clock
let hidden

function mountAudio() {
  let audio
  wrapper = mount(
    defineComponent({
      setup() {
        audio = useTetrisAudio()
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
  const gains = []
  const filters = []
  const sources = []
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
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
      const source = { ...node(), start: vi.fn(), stop: vi.fn() }
      sources.push(source)
      return source
    }),
    createOscillator: vi.fn(() => {
      const oscillator = { ...node(), frequency: parameter(), start: vi.fn(), stop: vi.fn() }
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
  return { context, constructor, oscillators, gains, filters, sources }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  localStorage.removeItem('learn-e-tetris-muted')
  localStorage.removeItem('learn-e-tetris-music-muted')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Tetris arcade audio', () => {
  it('defaults to audible but creates no context until a known sound is requested', () => {
    const { constructor } = mockAudio()
    const audio = mountAudio()
    expect(audio.muted.value).toBe(false)
    expect(audio.musicMuted.value).toBe(false)
    expect(audio.musicPlaying.value).toBe(false)
    expect(audio.bpm.value).toBe(128)
    expect(vi.getTimerCount()).toBe(0)
    audio.play('unknown')
    expect(constructor).not.toHaveBeenCalled()
    audio.play('start')
    expect(constructor).toHaveBeenCalledOnce()
  })

  it.each([
    ['move', 'square', [[320, 260]]],
    ['rotate', 'sine', [[360, 720]]],
    ['drop', 'triangle', [[100, 38]]],
    ['lock', 'square', [[200, 150]]],
    [
      'hold',
      'sine',
      [
        [720, 420],
        [420, 720],
      ],
    ],
    [
      'clear',
      'sine',
      [
        [523.25, 523.25],
        [659.25, 659.25],
        [783.99, 783.99],
        [1046.5, 1046.5],
      ],
    ],
    [
      'over',
      'sawtooth',
      [
        [220, 220],
        [174.61, 174.61],
        [130.81, 130.81],
        [65.41, 65.41],
      ],
    ],
    [
      'start',
      'triangle',
      [
        [220, 220],
        [440, 440],
        [660, 660],
      ],
    ],
  ])('synthesizes %s with its expected waveforms and pitch progression', (name, wave, pitches) => {
    const { oscillators, filters, gains } = mockAudio()
    const audio = mountAudio()
    audio.play(name)
    expect(oscillators).toHaveLength(pitches.length)
    oscillators.forEach((oscillator, index) => {
      expect(oscillator.type).toBe(wave)
      expect(oscillator.frequency.setValueAtTime.mock.calls[0][0]).toBe(pitches[index][0])
      expect(oscillator.frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBe(
        pitches[index][1],
      )
      expect(oscillator.start).toHaveBeenCalledOnce()
      expect(oscillator.stop).toHaveBeenCalledOnce()
    })
    expect(filters.every((filter) => filter.type === 'lowpass')).toBe(true)
    expect(
      gains
        .slice(1)
        .every((gain) =>
          gain.gain.exponentialRampToValueAtTime.mock.calls.every(([value]) => value > 0),
        ),
    ).toBe(true)
  })

  it('throttles move ticks at 35ms without throttling rotations or drops', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('move')
    clock.mockReturnValue(1034)
    audio.play('move')
    audio.play('rotate')
    clock.mockReturnValue(1035)
    audio.play('move')
    audio.play('drop')
    expect(oscillators).toHaveLength(4)
  })

  it('stops voices on pause while allowing later sound without changing mute', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('clear')
    audio.stop()
    expect(audio.muted.value).toBe(false)
    for (const oscillator of oscillators) expect(oscillator.stop).toHaveBeenCalledTimes(2)
    audio.play('rotate')
    expect(oscillators).toHaveLength(5)
  })

  it('mutes immediately, persists the setting, and restores sound on unmute', async () => {
    const { oscillators, gains } = mockAudio()
    const audio = mountAudio()
    audio.play('rotate')
    await audio.toggleMute()
    audio.play('clear')
    expect(localStorage.getItem('learn-e-tetris-muted')).toBe('true')
    expect(gains[1].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].stop).toHaveBeenCalledTimes(2)
    await audio.toggleMute()
    audio.play('rotate')
    expect(oscillators).toHaveLength(2)
    expect(localStorage.getItem('learn-e-tetris-muted')).toBe('false')
  })

  it('respects a stored mute without creating an audio context', () => {
    const { constructor } = mockAudio()
    localStorage.setItem('learn-e-tetris-muted', 'true')
    const audio = mountAudio()
    audio.play('start')
    expect(audio.muted.value).toBe(true)
    expect(constructor).not.toHaveBeenCalled()
  })

  it('retries a denied resume on the next player action', async () => {
    const { context, oscillators } = mockAudio('suspended')
    context.resume.mockRejectedValueOnce(new Error('Autoplay denied'))
    const audio = mountAudio()
    audio.play('rotate')
    await flushPromises()
    expect(oscillators).toHaveLength(0)
    audio.play('rotate')
    await flushPromises()
    expect(context.resume).toHaveBeenCalledTimes(2)
    expect(oscillators).toHaveLength(1)
  })

  it.each(['stop', 'mute'])(
    'cancels queued sounds on %s during a pending resume',
    async (action) => {
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
      audio.play('clear')
      if (action === 'mute') await audio.toggleMute()
      else audio.stop()
      allowResume()
      await flushPromises()
      expect(oscillators).toHaveLength(0)
    },
  )

  it('keeps playing effects when the player switches to another tab', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('hold')
    const before = oscillators.length
    hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    audio.play('clear')
    expect(oscillators.length).toBeGreaterThan(before)
    expect(oscillators[0].stop).toHaveBeenCalledOnce()
  })

  it('bounds rapid sound bursts and releases finished nodes', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('rotate')
    oscillators[0].onended()
    for (let count = 0; count < 50; count += 1) audio.play('clear')
    expect(
      oscillators.filter((oscillator) => oscillator.disconnect.mock.calls.length === 0),
    ).toHaveLength(40)
    wrapper.unmount()
    wrapper = null
    expect(oscillators[0].disconnect).toHaveBeenCalledOnce()
  })

  it('recreates a closed output device on a later action', () => {
    const first = mockAudio()
    const audio = mountAudio()
    audio.play('rotate')
    first.context.state = 'closed'
    const replacement = mockAudio()
    first.constructor.mockImplementationOnce(function () {
      return replacement.context
    })
    audio.play('rotate')
    expect(first.constructor).toHaveBeenCalledTimes(2)
    expect(replacement.oscillators).toHaveLength(1)
    expect(first.oscillators[0].disconnect).toHaveBeenCalledOnce()
  })

  it('cleans its graph and context on unmount', () => {
    const { context, oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('clear')
    wrapper.unmount()
    wrapper = null
    expect(context.close).toHaveBeenCalledOnce()
    for (const oscillator of oscillators) expect(oscillator.disconnect).toHaveBeenCalledOnce()
    audio.play('over')
    expect(oscillators).toHaveLength(4)
  })

  it('cleans stopped voices once even if their queued ended callbacks arrive later', () => {
    const { oscillators } = mockAudio()
    const audio = mountAudio()
    audio.play('clear')
    const ended = oscillators.map((oscillator) => oscillator.onended)
    audio.stop()
    ended.forEach((callback) => callback())
    wrapper.unmount()
    wrapper = null
    expect(oscillators.map((oscillator) => oscillator.disconnect.mock.calls.length)).toEqual([
      1, 1, 1, 1,
    ])
    expect(oscillators.every((oscillator) => oscillator.onended === null)).toBe(true)
  })

  it('handles unavailable audio and denied preference storage safely', async () => {
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
    expect(() => audio.play('clear')).not.toThrow()
    await expect(audio.toggleMute()).resolves.toBeUndefined()
    await expect(audio.toggleMute()).resolves.toBeUndefined()
    expect(() => audio.stop()).not.toThrow()
  })
})

describe('Tetris original synth music', () => {
  it('starts one ongoing rhythm only after the run starts, with no further input needed', async () => {
    const { context, constructor, oscillators, sources } = mockAudio()
    const audio = mountAudio()
    audio.play('rotate')
    expect(audio.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await audio.setPlaying(true)
    const initialNotes = oscillators.length
    await audio.setPlaying(true)
    await audio.activate()
    expect(constructor).toHaveBeenCalledOnce()
    expect(audio.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    expect(oscillators).toHaveLength(initialNotes)
    for (let tick = 1; tick <= 32; tick += 1) {
      context.currentTime = tick * 0.025
      vi.advanceTimersByTime(25)
    }
    expect(oscillators.length).toBeGreaterThan(initialNotes + 5)
    expect(sources.length).toBeGreaterThan(1)
    expect(context.createBuffer).toHaveBeenCalledOnce()
  })

  it('keeps effects and music controls independent and persists each preference', async () => {
    const { oscillators, gains } = mockAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    const musicNotes = oscillators.length
    await audio.toggleMute()
    expect(audio.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    audio.play('rotate')
    expect(oscillators).toHaveLength(musicNotes)
    expect(gains[1].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    await audio.toggleMute()
    audio.play('rotate')
    const effect = oscillators.at(-1)
    await audio.toggleMusic()
    expect(audio.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(gains[2].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    expect(effect.stop).toHaveBeenCalledOnce()
    audio.play('rotate')
    expect(oscillators).toHaveLength(musicNotes + 2)
    expect(localStorage.getItem('learn-e-tetris-muted')).toBe('false')
    expect(localStorage.getItem('learn-e-tetris-music-muted')).toBe('true')
    await audio.toggleMusic()
    expect(audio.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('runs music with muted effects and stays silent when both saved preferences are muted', async () => {
    const { constructor } = mockAudio()
    localStorage.setItem('learn-e-tetris-muted', 'true')
    localStorage.setItem('learn-e-tetris-music-muted', 'true')
    const audio = mountAudio()
    await audio.setPlaying(true)
    expect(constructor).not.toHaveBeenCalled()
    expect(audio.musicPlaying.value).toBe(false)
    await audio.toggleMusic()
    expect(constructor).toHaveBeenCalledOnce()
    expect(audio.musicPlaying.value).toBe(true)
    expect(audio.muted.value).toBe(true)
  })

  it('uses128 BPM at level1, adds3 per level and caps at164 BPM', async () => {
    const { context, oscillators } = mockAudio()
    const audio = mountAudio()
    audio.setLevel(1)
    expect(audio.bpm.value).toBe(128)
    audio.setLevel(2)
    expect(audio.bpm.value).toBe(131)
    audio.setLevel(8)
    expect(audio.bpm.value).toBe(149)
    audio.setLevel(100)
    expect(audio.bpm.value).toBe(164)
    audio.setLevel(NaN)
    expect(audio.bpm.value).toBe(164)
    await audio.setPlaying(true)
    const firstGate = oscillators[0].stop.mock.calls[0][0] - oscillators[0].start.mock.calls[0][0]
    expect(firstGate).toBeCloseTo((60 / 164 / 4) * 0.76 + 0.005)
    const alreadyScheduled = oscillators.length
    audio.setLevel(1)
    context.currentTime = 0.2
    vi.advanceTimersByTime(25)
    const nextArpeggio = oscillators.find(
      (oscillator, index) => index >= alreadyScheduled && oscillator.type === 'triangle',
    )
    const nextGate = nextArpeggio.stop.mock.calls[0][0] - nextArpeggio.start.mock.calls[0][0]
    expect(nextGate).toBeCloseTo((60 / 128 / 4) * 0.76 + 0.005)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stops music on pause without cutting effects, and stop cancels the whole run intent', async () => {
    const { context, oscillators } = mockAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    audio.play('rotate')
    const effect = oscillators.at(-1)
    await audio.setPlaying(false)
    expect(effect.stop).toHaveBeenCalledOnce()
    expect(audio.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await audio.setPlaying(true)
    expect(audio.musicPlaying.value).toBe(true)
    audio.stop()
    expect(audio.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(effect.stop).toHaveBeenCalledTimes(2)
    const count = oscillators.length
    context.currentTime = 50
    vi.advanceTimersByTime(5000)
    await audio.activate()
    expect(audio.musicPlaying.value).toBe(false)
    expect(oscillators).toHaveLength(count)
  })

  it('keeps the music going when the player switches to another tab', async () => {
    mockAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(audio.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('keeps denied music inactive and retries on a subsequent start gesture', async () => {
    const { context } = mockAudio('suspended')
    context.resume.mockRejectedValueOnce(new Error('Autoplay denied'))
    const audio = mountAudio()
    expect(await audio.setPlaying(true)).toBe(false)
    expect(audio.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(context.resume).toHaveBeenCalledOnce()
    expect(await audio.setPlaying(true)).toBe(true)
    expect(context.resume).toHaveBeenCalledTimes(2)
    expect(audio.musicPlaying.value).toBe(true)
  })

  it.each(['stop', 'pause', 'mute'])('cancels music awaiting resume after %s', async (action) => {
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
    const pending = audio.setPlaying(true)
    if (action === 'stop') audio.stop()
    else if (action === 'pause') await audio.setPlaying(false)
    else await audio.toggleMusic()
    allowResume()
    await pending
    expect(audio.musicPlaying.value).toBe(false)
    expect(oscillators).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops late beats instead of generating an unbounded catch-up burst', async () => {
    const { context, oscillators } = mockAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    const initialNotes = oscillators.length
    context.currentTime = 300
    vi.advanceTimersByTime(25)
    expect(oscillators.length - initialNotes).toBeLessThan(8)
    for (let index = 0; index < 25; index += 1) audio.play('clear')
    expect(
      oscillators.filter((oscillator) => oscillator.disconnect.mock.calls.length === 0).length,
    ).toBeLessThanOrEqual(40)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('replaces closed devices during an active run and cleans the music graph on unmount', async () => {
    const first = mockAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    first.context.state = 'closed'
    first.context.onstatechange()
    expect(vi.getTimerCount()).toBe(0)
    const replacement = mockAudio()
    first.constructor.mockImplementationOnce(function () {
      return replacement.context
    })
    await audio.setPlaying(true)
    expect(audio.musicPlaying.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    wrapper = null
    expect(audio.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(replacement.context.close).toHaveBeenCalledOnce()
    for (const node of [...replacement.oscillators, ...replacement.sources]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
  })

  it('cannot start music or effects after unmount while the device is still resuming', async () => {
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
    const pending = audio.setPlaying(true)
    audio.play('clear')
    wrapper.unmount()
    wrapper = null
    allowResume()
    await pending
    await flushPromises()
    expect(context.close).toHaveBeenCalledOnce()
    expect(oscillators).toHaveLength(0)
    expect(audio.musicPlaying.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
