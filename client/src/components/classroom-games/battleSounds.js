// The Boss Battle's sound effects and music, synthesized in the browser with no audio
// files. Everything here works on any Web Audio context, so a test can render the
// same recipes to a file instead of the speakers.

const SILENCE = 0.0001
const NOISE_SECONDS = 2
const noiseBuffers = new WeakMap()

const MASTER_VOLUME = 0.62
export const MUSIC_VOLUME = 0.4

export const BATTLE_SOUNDS = new Set([
  'start',
  'fire',
  'hit',
  'fatal',
  'counter',
  'hurt',
  'victory',
  'defeat',
])

const pitchOf = (midi) => 440 * 2 ** ((midi - 69) / 12)

function noiseFor(context) {
  let buffer = noiseBuffers.get(context)
  if (!buffer) {
    buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
    noiseBuffers.set(context, buffer)
  }
  return buffer
}

/** Effects and music on separate volumes, sharing one compressor and output. */
export function createMixer(context) {
  const master = context.createGain()
  const compressor = context.createDynamicsCompressor()
  const effects = context.createGain()
  const music = context.createGain()
  master.gain.value = MASTER_VOLUME
  effects.gain.value = 1
  music.gain.value = 0
  compressor.threshold.value = -18
  compressor.knee.value = 12
  compressor.ratio.value = 5
  compressor.attack.value = 0.003
  compressor.release.value = 0.14
  effects.connect(compressor)
  music.connect(compressor)
  compressor.connect(master)
  master.connect(context.destination)
  return { master, compressor, effects, music }
}

const startVoice = (source, _nodes, start, duration, offset) => {
  source.start(start, offset)
  source.stop(start + duration + 0.005)
}

/** The two building blocks of every sound. onVoice lets the caller track what is playing. */
export function createSynth(context, output, onVoice = startVoice) {
  function shape(gain, start, duration, volume, attack) {
    gain.setValueAtTime(SILENCE, start)
    gain.exponentialRampToValueAtTime(volume, start + attack)
    gain.exponentialRampToValueAtTime(SILENCE, start + duration)
  }

  function filterFor(type, frequency, to, q, start, duration) {
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    filter.frequency.setValueAtTime(frequency, start)
    if (to !== frequency) filter.frequency.exponentialRampToValueAtTime(to, start + duration)
    return filter
  }

  function tone({
    start,
    duration,
    pitch,
    to = pitch,
    type = 'sine',
    volume = 0.1,
    attack = 0.002,
    cutoff = 4000,
  }) {
    const source = context.createOscillator()
    const gain = context.createGain()
    const filter = filterFor('lowpass', cutoff, cutoff, 0.7, start, duration)
    source.type = type
    source.frequency.setValueAtTime(pitch, start)
    if (to !== pitch) source.frequency.exponentialRampToValueAtTime(to, start + duration)
    shape(gain.gain, start, duration, volume, attack)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(output)
    onVoice(source, [source, filter, gain], start, duration, undefined)
  }

  function noise({
    start,
    duration,
    volume = 0.1,
    attack = 0.002,
    type = 'lowpass',
    frequency = 4000,
    to = frequency,
    q = 0.7,
  }) {
    const source = context.createBufferSource()
    const gain = context.createGain()
    const filter = filterFor(type, frequency, to, q, start, duration)
    source.buffer = noiseFor(context)
    source.loop = true
    shape(gain.gain, start, duration, volume, attack)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(output)
    onVoice(source, [source, filter, gain], start, duration, Math.random() * NOISE_SECONDS)
  }

  return { tone, noise }
}

// Each recipe's duration is matched to what is on screen: fire lasts as long as the
// bolt flies, and the crackles in fatal land on the monster's second and third flash.
// Every low thump also has a mid-range layer, because laptop and phone speakers play
// almost nothing below 200 Hz.
const RECIPES = {
  start({ tone, noise }, at) {
    noise({
      start: at,
      duration: 0.52,
      volume: 0.14,
      attack: 0.42,
      type: 'bandpass',
      frequency: 300,
      to: 3200,
      q: 1,
    })
    tone({
      start: at,
      duration: 0.5,
      pitch: 73,
      to: 147,
      type: 'sawtooth',
      volume: 0.24,
      attack: 0.36,
      cutoff: 1800,
    })
    tone({ start: at + 0.46, duration: 0.5, pitch: 150, to: 42, volume: 0.5 })
    tone({ start: at + 0.46, duration: 0.22, pitch: 440, to: 150, type: 'triangle', volume: 0.3 })
    noise({ start: at + 0.46, duration: 0.3, volume: 0.32, frequency: 3200, to: 300 })
  },
  fire({ tone, noise }, at) {
    noise({
      start: at,
      duration: 0.26,
      volume: 0.34,
      attack: 0.17,
      type: 'bandpass',
      frequency: 500,
      to: 5200,
      q: 1.4,
    })
    tone({
      start: at,
      duration: 0.25,
      pitch: 260,
      to: 1900,
      type: 'sawtooth',
      volume: 0.12,
      attack: 0.16,
      cutoff: 3200,
    })
  },
  hit({ tone, noise }, at) {
    tone({ start: at, duration: 0.26, pitch: 190, to: 48, volume: 0.5 })
    tone({ start: at, duration: 0.16, pitch: 620, to: 170, type: 'triangle', volume: 0.42 })
    noise({
      start: at,
      duration: 0.09,
      volume: 0.6,
      type: 'bandpass',
      frequency: 2600,
      to: 900,
      q: 0.6,
    })
    noise({ start: at, duration: 0.2, volume: 0.24, frequency: 5200, to: 500 })
    tone({
      start: at,
      duration: 0.08,
      pitch: 880,
      to: 210,
      type: 'square',
      volume: 0.1,
      cutoff: 2600,
    })
  },
  fatal({ tone, noise }, at) {
    // The long rumble tail runs past the animation, because a fade this shape loses
    // most of its level early and a short one reads as a drum rather than a blast.
    tone({ start: at, duration: 1.4, pitch: 130, to: 30, volume: 0.55 })
    noise({ start: at, duration: 2.1, volume: 0.9, frequency: 2600, to: 120 })
    noise({
      start: at,
      duration: 0.7,
      volume: 0.3,
      type: 'bandpass',
      frequency: 900,
      to: 260,
      q: 0.5,
    })
    tone({
      start: at + 0.04,
      duration: 1.2,
      pitch: 520,
      to: 46,
      type: 'sawtooth',
      volume: 0.1,
      cutoff: 1500,
    })
    ;[0.49, 0.99].forEach((delay) => {
      noise({
        start: at + delay,
        duration: 0.12,
        volume: 0.2,
        type: 'bandpass',
        frequency: 1500,
        q: 0.6,
      })
    })
    tone({ start: at + 1.09, duration: 0.8, pitch: 100, to: 30, volume: 0.4 })
    noise({ start: at + 1.09, duration: 1.4, volume: 0.65, frequency: 1800, to: 100 })
  },
  // Notes a few semitones apart beat against each other about 30 times a second, which
  // is what makes the lunge rough, like a growl, instead of one clean bass note.
  counter({ tone, noise }, at) {
    ;[
      [110, 60],
      [147, 82],
      [175, 92],
    ].forEach(([pitch, to]) => {
      tone({
        start: at,
        duration: 0.38,
        pitch,
        to,
        type: 'sawtooth',
        volume: 0.2,
        attack: 0.06,
        cutoff: 1500,
      })
    })
    noise({
      start: at,
      duration: 0.34,
      volume: 0.1,
      attack: 0.08,
      type: 'bandpass',
      frequency: 900,
      to: 420,
      q: 2,
    })
  },
  hurt({ tone, noise }, at) {
    tone({ start: at, duration: 0.2, pitch: 130, to: 52, volume: 0.42 })
    tone({ start: at, duration: 0.32, pitch: 560, to: 130, type: 'triangle', volume: 0.3 })
    noise({ start: at, duration: 0.13, volume: 0.3, type: 'highpass', frequency: 3000 })
    ;[2640, 1980, 2310].forEach((pitch, index) => {
      tone({ start: at + 0.03 + index * 0.038, duration: 0.11, pitch, volume: 0.05 })
    })
  },
  victory({ tone }, at) {
    ;[69, 73, 76].forEach((midi, index) => {
      tone({
        start: at + index * 0.11,
        duration: 0.15,
        pitch: pitchOf(midi),
        type: 'square',
        volume: 0.08,
        cutoff: 3000,
      })
    })
    ;[57, 69, 73, 76, 81].forEach((midi) => {
      tone({
        start: at + 0.33,
        duration: 0.95,
        pitch: pitchOf(midi),
        type: 'triangle',
        volume: 0.1,
      })
    })
    tone({ start: at + 0.33, duration: 0.3, pitch: 110, to: 55, volume: 0.32 })
  },
  defeat({ tone }, at) {
    ;[57, 53, 50, 45].forEach((midi, index) => {
      tone({
        start: at + index * 0.3,
        duration: index === 3 ? 1.1 : 0.42,
        pitch: pitchOf(midi),
        type: 'sawtooth',
        volume: 0.18,
        attack: 0.04,
        cutoff: 1300,
      })
    })
    tone({ start: at + 0.9, duration: 0.7, pitch: 90, to: 38, volume: 0.36 })
  },
}

export function playBattleSound(name, synth, at) {
  RECIPES[name](synth, at)
}

// An original four-bar loop in A minor. The lead joins once the monster is at half
// health, so the music climbs as the student gets closer to winning.
export const MUSIC_BPM = 138
export const MUSIC_STEPS = 64
const ROOTS = [45, 45, 41, 40]
const BASS_STEPS = new Set([0, 3, 6, 8, 11, 14])
const KICK_STEPS = new Set([0, 6, 8])
const STAB_STEPS = new Set([2, 10])
const LEAD = new Map([
  [0, 12],
  [3, 15],
  [6, 19],
  [8, 17],
  [11, 15],
  [14, 12],
])

export function playMusicStep({ tone, noise }, index, at, climbing) {
  const step = index % 16
  const root = ROOTS[Math.floor(index / 16) % ROOTS.length]
  const sixteenth = 60 / MUSIC_BPM / 4
  if (BASS_STEPS.has(step)) {
    tone({
      start: at,
      duration: sixteenth * 1.5,
      pitch: pitchOf(root),
      type: 'sawtooth',
      volume: 0.22,
      cutoff: 1500,
    })
  }
  // A minor chord on every root keeps the loop dark, including over the last two bars.
  if (STAB_STEPS.has(step)) {
    ;[12, 15, 19].forEach((interval) => {
      tone({
        start: at,
        duration: sixteenth * 1.4,
        pitch: pitchOf(root + interval),
        type: 'sawtooth',
        volume: 0.06,
        cutoff: 1800,
      })
    })
  }
  if (KICK_STEPS.has(step)) {
    tone({ start: at, duration: 0.13, pitch: 120, to: 44, volume: 0.3 })
    tone({ start: at, duration: 0.03, pitch: 900, to: 300, type: 'triangle', volume: 0.1 })
  }
  if (step === 4 || step === 12) {
    noise({ start: at, duration: 0.11, volume: 0.18, type: 'bandpass', frequency: 1900 })
  }
  if (step % 2 === 0) {
    noise({ start: at, duration: 0.03, volume: 0.05, type: 'highpass', frequency: 7000 })
  }
  if (climbing && LEAD.has(step)) {
    tone({
      start: at,
      duration: sixteenth * 1.7,
      pitch: pitchOf(root + 12 + LEAD.get(step)),
      type: 'square',
      volume: 0.07,
      cutoff: 2400,
    })
  }
}
