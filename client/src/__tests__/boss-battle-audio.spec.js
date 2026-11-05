// The Boss Battle's sound: the synthesized recipes, the useBattleAudio
// composable (waking the device, muting, background tabs) and the sounds the battle
// plays. The browser's audio device is faked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import BossBattle from '../components/classroom-games/BossBattle.vue'
import {
  BATTLE_SOUNDS,
  createMixer,
  createSynth,
  playBattleSound,
  playMusicStep,
} from '../components/classroom-games/battleSounds.js'
import { useBattleAudio } from '../components/classroom-games/useBattleAudio.js'

// The real recipes, watched, so a test can read which sounds a battle asked for.
vi.mock('../components/classroom-games/battleSounds.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    playBattleSound: vi.fn(actual.playBattleSound),
    playMusicStep: vi.fn(actual.playMusicStep),
  }
})
const soundsPlayed = () => playBattleSound.mock.calls.map(([name]) => name)

const parameter = () => ({
  value: 0,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
})

function fakeContext(initialState = 'running') {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn() })
  const context = {
    state: initialState,
    currentTime: 0,
    sampleRate: 100,
    destination: {},
    oscillators: [],
    gains: [],
    createGain: vi.fn(() => {
      const gain = { ...node(), gain: parameter() }
      context.gains.push(gain)
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
    createBuffer: vi.fn((_channels, length) => ({
      getChannelData: () => new Float32Array(length),
    })),
    createBufferSource: vi.fn(source),
    createOscillator: vi.fn(() => {
      const oscillator = { ...source(), frequency: parameter() }
      context.oscillators.push(oscillator)
      return oscillator
    }),
    resume: vi.fn(async () => {
      context.state = 'running'
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return context
}

function stubAudio(initialState) {
  const context = fakeContext(initialState)
  const constructor = vi.fn(function () {
    return context
  })
  vi.stubGlobal('AudioContext', constructor)
  vi.stubGlobal('webkitAudioContext', undefined)
  return { context, constructor }
}

let wrapper
function mountAudio() {
  let audio
  wrapper = mount(
    defineComponent({
      setup() {
        audio = useBattleAudio()
        return () => null
      },
    }),
  )
  return audio
}

beforeEach(() => {
  playBattleSound.mockClear()
  playMusicStep.mockClear()
  // Sound starts muted (G14), so most tests begin as a student who turned it on.
  localStorage.setItem('learn-e-battle-muted', 'false')
  localStorage.setItem('learn-e-battle-music-muted', 'false')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the battle sound recipes', () => {
  it.each([...BATTLE_SOUNDS])('%s schedules its notes from the time it is given', (name) => {
    const context = fakeContext()
    const mixer = createMixer(context)
    const started = []
    const synth = createSynth(context, mixer.effects, (source, _nodes, start) => {
      started.push(start)
    })
    playBattleSound(name, synth, 5)
    expect(started.length).toBeGreaterThan(0)
    expect(Math.min(...started)).toBeGreaterThanOrEqual(5)
  })
})

describe('useBattleAudio', () => {
  it('creates no audio device until a click asks for one', () => {
    const { constructor } = stubAudio()
    const audio = mountAudio()
    expect(constructor).not.toHaveBeenCalled()
    audio.unlock()
    expect(constructor).toHaveBeenCalledTimes(1)
  })

  it('wakes a suspended device, then plays the sound', async () => {
    const { context } = stubAudio('suspended')
    const audio = mountAudio()
    audio.play('hit')
    expect(context.resume).toHaveBeenCalled()
    expect(context.oscillators).toHaveLength(0)
    await flushPromises()
    expect(context.oscillators.length).toBeGreaterThan(0)
  })

  it('ignores sounds it does not know', () => {
    const { context } = stubAudio()
    const audio = mountAudio()
    audio.play('nonsense')
    expect(context.oscillators).toHaveLength(0)
    expect(soundsPlayed()).toEqual([])
  })

  it('starts muted the first time, before the student has chosen (G14)', () => {
    localStorage.clear()
    const audio = mountAudio()
    expect(audio.muted.value).toBe(true)
    expect(audio.musicMuted.value).toBe(true)
  })

  it('stays silent when effects are muted, and remembers that after a reload', async () => {
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.toggleMute()
    audio.play('hit')
    expect(context.oscillators).toHaveLength(0)
    expect(localStorage.getItem('learn-e-battle-muted')).toBe('true')
    wrapper.unmount()
    wrapper = null
    expect(mountAudio().muted.value).toBe(true)
  })

  it('plays effects again after unmuting, even if the device was slow to wake', async () => {
    localStorage.setItem('learn-e-battle-muted', 'true')
    const { context } = stubAudio('suspended')
    context.resume.mockRejectedValue(new Error('not allowed yet'))
    const audio = mountAudio()
    await audio.toggleMute()
    await flushPromises()
    expect(audio.muted.value).toBe(false)
    // The effects volume is the first gain the mixer makes after master.
    const effectsGain = context.gains[1].gain
    expect(effectsGain.setValueAtTime).toHaveBeenCalledWith(1, 0)
  })

  it('schedules music only while wanted, and stops scheduling when it ends', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    const first = context.oscillators.length
    expect(first).toBeGreaterThan(0)
    context.currentTime = 2
    vi.advanceTimersByTime(50)
    expect(context.oscillators.length).toBeGreaterThan(first)
    await audio.setPlaying(false)
    const stopped = context.oscillators.length
    context.currentTime = 4
    vi.advanceTimersByTime(200)
    expect(context.oscillators).toHaveLength(stopped)
  })

  it('does not start music while it is muted, and picks it up when unmuted', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    localStorage.setItem('learn-e-battle-music-muted', 'true')
    const audio = mountAudio()
    await audio.setPlaying(true)
    expect(context.oscillators).toHaveLength(0)
    await audio.toggleMusic()
    expect(context.oscillators.length).toBeGreaterThan(0)
  })

  it('adds the lead once the monster is at half health', async () => {
    vi.useFakeTimers()
    const notesIn = async (share) => {
      const { context } = stubAudio()
      const audio = mountAudio()
      audio.setHealth(share)
      await audio.setPlaying(true)
      context.currentTime = 8
      vi.advanceTimersByTime(25)
      const squares = context.oscillators.filter((item) => item.type === 'square').length
      wrapper.unmount()
      wrapper = null
      return squares
    }
    expect(await notesIn(1)).toBe(0)
    expect(await notesIn(0.5)).toBeGreaterThan(0)
  })

  it('releases the device when the battle closes', async () => {
    const { context } = stubAudio()
    const audio = mountAudio()
    audio.play('hit')
    wrapper.unmount()
    wrapper = null
    expect(context.close).toHaveBeenCalled()
    audio.play('hit')
    await flushPromises()
  })

  it('reports no support and stays quiet in a browser without audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    const audio = mountAudio()
    expect(audio.supported.value).toBe(false)
    expect(() => audio.play('hit')).not.toThrow()
  })

  it('keeps the music going when only the effects are muted, and the reverse', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    await audio.toggleMute()
    const before = context.oscillators.length
    context.currentTime = 2
    vi.advanceTimersByTime(50)
    expect(context.oscillators.length).toBeGreaterThan(before)

    await audio.toggleMute()
    await audio.toggleMusic()
    playBattleSound.mockClear()
    audio.play('hit')
    expect(soundsPlayed()).toEqual(['hit'])
  })

  it('does not bring the music back after the battle has ended', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    await audio.setPlaying(false)
    await audio.toggleMusic()
    await audio.toggleMusic()
    await flushPromises()
    const before = context.oscillators.length
    context.currentTime = 5
    vi.advanceTimersByTime(200)
    expect(context.oscillators).toHaveLength(before)
  })

  // The sound does not watch the tab, so the music keeps going in the background.
  it('keeps the music playing in a background tab', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const before = context.oscillators.length
    context.currentTime = 5
    vi.advanceTimersByTime(200)
    expect(context.oscillators.length).toBeGreaterThan(before)
  })

  it('stops scheduling music once the battle closes', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    wrapper.unmount()
    wrapper = null
    const before = context.oscillators.length
    context.currentTime = 5
    vi.advanceTimersByTime(200)
    expect(context.oscillators).toHaveLength(before)
  })

  it('does not start music whose start was cancelled while the device woke', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio('suspended')
    const audio = mountAudio()
    const starting = audio.setPlaying(true)
    audio.setPlaying(false)
    await starting
    expect(context.oscillators).toHaveLength(0)
  })

  it('opens a new device when the browser has closed the old one', () => {
    const first = fakeContext()
    const second = fakeContext()
    const constructor = vi.fn().mockImplementationOnce(function () {
      return first
    })
    constructor.mockImplementationOnce(function () {
      return second
    })
    vi.stubGlobal('AudioContext', constructor)
    vi.stubGlobal('webkitAudioContext', undefined)
    const audio = mountAudio()
    audio.play('hit')
    first.state = 'closed'
    audio.play('hit')
    expect(constructor).toHaveBeenCalledTimes(2)
    expect(second.oscillators.length).toBeGreaterThan(0)
  })

  it('never lets more than the voice limit build up', () => {
    const { context } = stubAudio()
    const audio = mountAudio()
    for (let count = 0; count < 40; count += 1) audio.play('fatal')
    const stopped = context.oscillators.filter((item) => item.stop.mock.calls.length > 1).length
    expect(stopped).toBeGreaterThan(0)
  })

  it('still works when the browser refuses storage', async () => {
    stubAudio()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    // With nothing readable it starts muted (G14), and the switch still works.
    const audio = mountAudio()
    expect(audio.muted.value).toBe(true)
    expect(audio.musicMuted.value).toBe(true)
    await audio.toggleMute()
    expect(audio.muted.value).toBe(false)
  })

  it('opens no device for a sound while effects are muted', () => {
    localStorage.setItem('learn-e-battle-muted', 'true')
    const { constructor } = stubAudio()
    mountAudio().play('hit')
    expect(constructor).not.toHaveBeenCalled()
  })

  it('opens no device on a click when both switches are muted', () => {
    localStorage.setItem('learn-e-battle-muted', 'true')
    localStorage.setItem('learn-e-battle-music-muted', 'true')
    const { constructor } = stubAudio()
    mountAudio().unlock()
    expect(constructor).not.toHaveBeenCalled()
  })

  it('keeps the effects volume at zero when the device opens muted', async () => {
    localStorage.setItem('learn-e-battle-muted', 'true')
    const { context } = stubAudio()
    await mountAudio().setPlaying(true)
    expect(context.gains[1].gain.value).toBe(0)
  })

  it('silences the effects volume and what is ringing when muted', async () => {
    const { context } = stubAudio()
    const audio = mountAudio()
    audio.play('fatal')
    await audio.toggleMute()
    expect(context.gains[1].gain.setValueAtTime).toHaveBeenCalledWith(0, 0)
    expect(context.oscillators.every((item) => item.stop.mock.calls.length === 2)).toBe(true)
  })

  it('stops the music when it is muted, and remembers that after a reload', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    await audio.toggleMusic()
    playMusicStep.mockClear()
    context.currentTime = 5
    vi.advanceTimersByTime(200)
    expect(playMusicStep).not.toHaveBeenCalled()
    expect(localStorage.getItem('learn-e-battle-music-muted')).toBe('true')
    wrapper.unmount()
    wrapper = null
    expect(mountAudio().musicMuted.value).toBe(true)
  })

  it('does not start muted music when the device comes back to life', async () => {
    localStorage.setItem('learn-e-battle-music-muted', 'true')
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    audio.play('hit')
    context.onstatechange()
    expect(playMusicStep).not.toHaveBeenCalled()
  })

  it('skips missed notes after a stall instead of playing them all at once', async () => {
    vi.useFakeTimers()
    const { context } = stubAudio()
    const audio = mountAudio()
    await audio.setPlaying(true)
    playMusicStep.mockClear()
    context.currentTime = 100
    vi.advanceTimersByTime(25)
    expect(playMusicStep.mock.calls.length).toBeLessThan(5)
  })

  // Decision H-17: the battle adds no listener to the page.
  it('adds no listener to the page', async () => {
    stubAudio()
    const added = vi.spyOn(document, 'addEventListener')
    const audio = mountAudio()
    await audio.setPlaying(true)
    expect(added).not.toHaveBeenCalled()
  })

  it('survives a device that cannot be created', () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('no device')
      }),
    )
    vi.stubGlobal('webkitAudioContext', undefined)
    const audio = mountAudio()
    expect(() => audio.play('hit')).not.toThrow()
    expect(audio.supported.value).toBe(false)
  })
})

describe('sounds in the battle', () => {
  const game = { title: 'Week 3', bossId: 'memory-kraken', hearts: 2, questionCount: 2 }
  const question = {
    id: 'q1',
    prompt: 'What prints?',
    code: '',
    options: [
      { id: 'a', label: 'One' },
      { id: 'b', label: 'Two' },
    ],
  }
  const play = (overrides = {}) => ({
    id: 'p1',
    status: 'in-progress',
    heartsLeft: 2,
    maxHearts: 2,
    totalQuestions: 2,
    remaining: 2,
    currentQuestion: question,
    missed: [],
    ...overrides,
  })

  async function mountBattle(answerResult, initialPlay = play()) {
    const { context } = stubAudio()
    const engine = {
      start: vi.fn().mockResolvedValue(play()),
      answer: vi.fn().mockResolvedValue(answerResult),
    }
    wrapper = mount(BossBattle, {
      attachTo: document.body,
      props: { game, engine, initialPlay, errorMessage: () => 'failed' },
    })
    await nextTick()
    return { context, engine }
  }

  const answer = async (label) => {
    await wrapper
      .findAll('button')
      .find((item) => item.text() === label)
      .trigger('click')
    await flushPromises()
  }

  it('sends the count of answers it has seen, so an old tab cannot spend a heart', async () => {
    const { engine } = await mountBattle(
      { correct: true, explanation: '', play: play({ remaining: 1, answerCount: 5 }) },
      play({ answerCount: 4 }),
    )
    await answer('One')
    expect(engine.answer).toHaveBeenCalledWith('p1', 'q1', 'a', 4)
  })

  // The answers are aria-disabled rather than disabled, so the focus is not lost.
  it('keeps the focus on the pressed answer while it is marked', async () => {
    await mountBattle({ correct: true, explanation: '', play: play({ remaining: 1 }) })
    const one = wrapper.findAll('button').find((item) => item.text() === 'One')
    one.element.focus()
    await answer('One')
    expect(one.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(one.element)
  })

  it('wakes the device during the Start click, before the server replies', async () => {
    const { constructor } = stubAudio()
    wrapper = mount(BossBattle, {
      props: {
        game,
        engine: { start: () => new Promise(() => {}), answer: vi.fn() },
        errorMessage: () => 'failed',
      },
    })
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'Start battle')
      .trigger('click')
    expect(constructor).toHaveBeenCalledTimes(1)
  })

  it('wakes the device during an answer click, even with the music muted', async () => {
    localStorage.setItem('learn-e-battle-music-muted', 'true')
    const { constructor, context } = stubAudio()
    wrapper = mount(BossBattle, {
      props: {
        game,
        engine: { start: vi.fn(), answer: () => new Promise(() => {}) },
        initialPlay: play(),
        errorMessage: () => 'failed',
      },
    })
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'One')
      .trigger('click')
    expect(constructor).toHaveBeenCalledTimes(1)
    expect(context.oscillators).toHaveLength(0)
  })

  it('sends one answer when two clicks land before the page updates', async () => {
    const { engine } = await mountBattle({ correct: true, explanation: '', play: play() })
    const button = wrapper.findAll('button').find((item) => item.text() === 'One').element
    button.click()
    button.click()
    await flushPromises()
    expect(engine.answer).toHaveBeenCalledTimes(1)
  })

  it('offers both switches, named for screen readers', async () => {
    await mountBattle({ correct: true, explanation: '', play: play() })
    expect(wrapper.find('[aria-label="Mute sound effects"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Mute music"]').exists()).toBe(true)
  })

  it('hides the switches when the browser has no audio', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    wrapper = mount(BossBattle, {
      props: {
        game,
        engine: { start: vi.fn(), answer: vi.fn() },
        initialPlay: play(),
        errorMessage: () => 'failed',
      },
    })
    await nextTick()
    expect(wrapper.find('[aria-label="Mute music"]').exists()).toBe(false)
  })

  it('plays nothing on load, because a resumed battle has had no click yet', async () => {
    const { context } = await mountBattle({ correct: true, explanation: '', play: play() })
    expect(context.oscillators).toHaveLength(0)
    expect(context.createGain).not.toHaveBeenCalled()
  })

  it('holds the impact sound back until the hit lands', async () => {
    vi.useFakeTimers()
    const { context } = await mountBattle({
      correct: true,
      explanation: 'Because.',
      play: play({ remaining: 1 }),
    })
    await answerWithFakeTimers('One')
    const launch = sineCount(context)
    vi.advanceTimersByTime(259)
    expect(sineCount(context)).toBe(launch)
    vi.advanceTimersByTime(1)
    expect(sineCount(context)).toBeGreaterThan(launch)
  })

  it('stays silent through the same answer when effects and music are muted', async () => {
    localStorage.setItem('learn-e-battle-muted', 'true')
    localStorage.setItem('learn-e-battle-music-muted', 'true')
    const { context } = await mountBattle({
      correct: false,
      explanation: 'Because.',
      play: play({ heartsLeft: 1 }),
    })
    await answer('Two')
    expect(context.oscillators).toHaveLength(0)
  })

  it('still marks the answer when the sound system breaks', async () => {
    const { context, engine } = await mountBattle({
      correct: true,
      explanation: 'Because.',
      play: play({ remaining: 1 }),
    })
    context.createOscillator.mockImplementation(() => {
      throw new Error('device lost')
    })
    await answer('One')
    expect(engine.answer).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Direct hit')
  })

  describe('each moment asks for its own sounds', () => {
    const settle = async () => {
      await vi.advanceTimersByTimeAsync(2000)
      await nextTick()
    }
    // Buttons, and the Continue links styled as buttons.
    const press = async (label) => {
      await wrapper
        .findAll('button, a')
        .find((item) => item.text() === label)
        .trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()
    }
    beforeEach(() => vi.useFakeTimers())

    it('a correct answer zaps, then hits', async () => {
      await mountBattle({ correct: true, explanation: '', play: play({ remaining: 1 }) })
      await press('One')
      expect(soundsPlayed()).toEqual(['fire'])
      await settle()
      expect(soundsPlayed()).toEqual(['fire', 'hit'])
    })

    it('a wrong answer snarls, then breaks the heart', async () => {
      await mountBattle({ correct: false, explanation: '', play: play({ heartsLeft: 1 }) })
      await press('Two')
      expect(soundsPlayed()).toEqual(['counter'])
      await settle()
      expect(soundsPlayed()).toEqual(['counter', 'hurt'])
    })

    it('winning ends on the final blow and the fanfare, and stops the music', async () => {
      const { context } = await mountBattle({
        correct: true,
        explanation: '',
        play: play({ status: 'won', remaining: 0, currentQuestion: null }),
      })
      await press('One')
      await settle()
      expect(soundsPlayed()).toEqual(['fire', 'fatal'])
      const before = context.oscillators.length
      context.currentTime = 9
      await settle()
      expect(context.oscillators).toHaveLength(before)
      await press('See how it ended')
      expect(soundsPlayed()).toEqual(['fire', 'fatal', 'victory'])
    })

    it('losing ends on the defeat phrase, and stops the music', async () => {
      const { context } = await mountBattle({
        correct: false,
        explanation: '',
        play: play({ status: 'lost', heartsLeft: 0, currentQuestion: null }),
      })
      await press('Two')
      await settle()
      const before = context.oscillators.length
      context.currentTime = 9
      await settle()
      expect(context.oscillators).toHaveLength(before)
      await press('See how it ended')
      expect(soundsPlayed()).toEqual(['counter', 'hurt', 'defeat'])
    })

    it('skipping ahead before the hit lands plays only the ending', async () => {
      const { context } = await mountBattle({
        correct: true,
        explanation: '',
        play: play({ status: 'won', remaining: 0, currentQuestion: null }),
      })
      await press('One')
      await press('See how it ended')
      await settle()
      expect(soundsPlayed()).toEqual(['fire', 'victory'])
      // Skipping must also stop the music, which the cancelled hit would have done.
      const before = context.oscillators.length
      context.currentTime = 9
      await settle()
      expect(context.oscillators).toHaveLength(before)
    })

    it('skipping ahead on a normal question lets the hit finish', async () => {
      await mountBattle({
        correct: true,
        explanation: '',
        play: play({
          remaining: 1,
          currentQuestion: { ...question, id: 'q2', prompt: 'Second?' },
        }),
      })
      await press('One')
      await press('Continue')
      await settle()
      expect(wrapper.text()).toContain('Second?')
      expect(soundsPlayed()).toEqual(['fire', 'hit'])
    })

    it('starts the music on the first answer of a resumed battle', async () => {
      await mountBattle({ correct: true, explanation: '', play: play({ remaining: 1 }) })
      expect(playMusicStep).not.toHaveBeenCalled()
      await press('One')
      expect(playMusicStep).toHaveBeenCalled()
    })

    it('shows the share of health each hit removes', async () => {
      // Four questions, so the damage (25) cannot be mistaken for the health left (75).
      await mountBattle(
        { correct: true, explanation: '', play: play({ totalQuestions: 4, remaining: 3 }) },
        play({ totalQuestions: 4, remaining: 4 }),
      )
      await press('One')
      await vi.advanceTimersByTimeAsync(300)
      expect(wrapper.find('.boss-impact__label').text()).toBe('−25 HP')
    })

    it('leaves no timer running after the battle closes', async () => {
      await mountBattle({ correct: true, explanation: '', play: play({ remaining: 1 }) })
      await press('One')
      expect(vi.getTimerCount()).toBeGreaterThan(0)
      wrapper.unmount()
      wrapper = null
      expect(vi.getTimerCount()).toBe(0)
    })

    it('a server error plays nothing and lets the student try again', async () => {
      const { engine } = await mountBattle({ correct: true, explanation: '', play: play() })
      engine.answer.mockRejectedValueOnce({ response: { status: 500 } })
      await press('One')
      await settle()
      expect(soundsPlayed()).toEqual([])
      expect(wrapper.text()).toContain('failed')
      await press('One')
      expect(soundsPlayed()).toEqual(['fire'])
    })

    it('leaving mid-attack cancels the sound that was still to come', async () => {
      const { context } = await mountBattle({
        correct: true,
        explanation: '',
        play: play({ remaining: 1 }),
      })
      await press('One')
      wrapper.unmount()
      wrapper = null
      await settle()
      expect(soundsPlayed()).toEqual(['fire'])
      expect(context.close).toHaveBeenCalled()
    })

    it('replaying after a win starts the music and the build-up again', async () => {
      const { context, engine } = await mountBattle({
        correct: true,
        explanation: '',
        play: play({ status: 'won', remaining: 0, currentQuestion: null }),
      })
      await press('One')
      await settle()
      await press('See how it ended')
      playBattleSound.mockClear()
      engine.start.mockResolvedValue(play())
      await press('Play again')
      await settle()
      expect(soundsPlayed()).toEqual(['start'])
      const before = context.oscillators.length
      context.currentTime = 20
      await vi.advanceTimersByTimeAsync(100)
      expect(context.oscillators.length).toBeGreaterThan(before)
    })
  })

  const sineCount = (context) =>
    context.oscillators.filter((item) => item.type === 'sine' || item.type === undefined).length

  async function answerWithFakeTimers(label) {
    const target = wrapper.findAll('button').find((item) => item.text() === label)
    await target.trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
  }
})
