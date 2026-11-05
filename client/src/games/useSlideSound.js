import { onBeforeUnmount, ref } from 'vue'

const EFFECTS_KEY = 'learn-e-2048-muted'
const MUSIC_KEY = 'learn-e-2048-music-muted'
const SILENCE = 0.0001
const EFFECTS_VOLUME = 0.24
const MUSIC_VOLUME = 0.2
// Eighth notes at 92 BPM; the audio clock keeps notes steady when the UI timer drifts.
const STEP_DURATION = 60 / 92 / 2
const CHORDS = [
  { bass: 45, notes: [57, 60, 64, 67] },
  { bass: 41, notes: [53, 57, 60, 64] },
  { bass: 38, notes: [53, 57, 60, 62] },
  { bass: 40, notes: [55, 59, 62, 64] },
]
const ARPEGGIO = [0, 2, 1, 3, 2, 1, 0, 2]
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12)

function readMuted(key) {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function storeMuted(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Sound remains usable when private/embedded sessions deny storage.
  }
}

/** Original procedural silicon ambience and one digital note per successful slide. */
export function useSlideSound() {
  const AudioContextClass =
    typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext
  const supported = ref(Boolean(AudioContextClass))
  const muted = ref(readMuted(EFFECTS_KEY))
  const musicMuted = ref(readMuted(MUSIC_KEY))
  const musicPlaying = ref(false)
  let context = null
  let master = null
  let compressor = null
  let effectsBus = null
  let musicBus = null
  let noiseBuffer = null
  let resumePromise = null
  let musicTimer = null
  let musicStep = 0
  let nextStepTime = 0
  let disposed = false
  let activated = false
  let hasUnlocked = false
  let effectsEpoch = 0
  const voices = new Set()

  function disconnect(node) {
    try {
      node?.disconnect()
    } catch {
      // Device teardown can disconnect a node before its scheduled onended callback.
    }
  }

  function removeVoice(voice, stop = false) {
    if (stop) {
      try {
        voice.source.stop()
      } catch {
        // A scheduled source may already have finished.
      }
    }
    voice.nodes.forEach(disconnect)
    voices.delete(voice)
  }

  function stopVoices(kind) {
    for (const voice of voices) {
      if (!kind || voice.kind === kind) removeVoice(voice, true)
    }
  }

  function setBus(gain, value) {
    if (!context || !gain) return
    gain.gain.cancelScheduledValues(context.currentTime)
    gain.gain.setValueAtTime(value, context.currentTime)
  }

  function stopMusic() {
    if (musicTimer !== null) clearInterval(musicTimer)
    musicTimer = null
    musicPlaying.value = false
    nextStepTime = 0
    setBus(musicBus, 0)
    stopVoices('music')
  }

  function createContext() {
    if (disposed || !supported.value) return null
    if (context?.state === 'closed') {
      // A closed context cannot resume. Replace it only inside a new player gesture.
      effectsEpoch += 1
      stopMusic()
      stopVoices()
      context.onstatechange = null
      ;[effectsBus, musicBus, compressor, master].forEach(disconnect)
      context = null
      noiseBuffer = null
      resumePromise = null
      hasUnlocked = false
    }
    if (context) return context
    try {
      context = new AudioContextClass()
      master = context.createGain()
      compressor = context.createDynamicsCompressor()
      effectsBus = context.createGain()
      musicBus = context.createGain()
      master.gain.value = 0.55
      effectsBus.gain.value = muted.value ? 0 : EFFECTS_VOLUME
      musicBus.gain.value = 0
      compressor.threshold.value = -16
      compressor.knee.value = 16
      compressor.ratio.value = 4
      compressor.attack.value = 0.004
      compressor.release.value = 0.18
      // Independent buses keep either mute switch from cutting the other channel.
      effectsBus.connect(compressor)
      musicBus.connect(compressor)
      compressor.connect(master)
      master.connect(context.destination)
      context.onstatechange = () => {
        if (context?.state !== 'running') stopMusic()
        else if (hasUnlocked && activated) startMusic()
      }
      return context
    } catch {
      supported.value = false
      dispose()
      return null
    }
  }

  function resumeContext(currentContext) {
    if (currentContext.state === 'running') {
      hasUnlocked = true
      return Promise.resolve(true)
    }
    if (currentContext.state === 'closed') return Promise.resolve(false)
    if (resumePromise) return resumePromise
    try {
      const attempt = Promise.resolve(currentContext.resume())
        .then(() => {
          const ready =
            !disposed && context === currentContext && currentContext.state === 'running'
          if (ready) hasUnlocked = true
          return ready
        })
        .catch(() => false)
        .finally(() => {
          // An older device's late resume must not clear its replacement's pending resume.
          if (resumePromise === attempt) resumePromise = null
        })
      resumePromise = attempt
      return attempt
    } catch {
      return Promise.resolve(false)
    }
  }

  function registerSource(source, nodes, kind, start, duration) {
    // Finished nodes are removed onended; this extra bound also protects rapid input bursts.
    if (voices.size >= 48) removeVoice(voices.values().next().value, true)
    const voice = { source, nodes, kind }
    voices.add(voice)
    source.onended = () => removeVoice(voice)
    source.start(start)
    source.stop(start + duration + 0.008)
  }

  function tone({
    kind,
    start,
    duration,
    pitch,
    to = pitch,
    type = 'triangle',
    volume = 0.1,
    cutoff = 1800,
    attack = 0.006,
  }) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const filter = context.createBiquadFilter()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(pitch, start)
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff, start)
    filter.Q.value = kind === 'effects' ? 1.4 : 0.6
    // Exponential envelopes require positive endpoints; the small floor avoids clicks.
    gain.gain.setValueAtTime(SILENCE, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + attack)
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + duration)
    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(kind === 'music' ? musicBus : effectsBus)
    registerSource(oscillator, [oscillator, filter, gain], kind, start, duration)
  }

  function hiHat(start) {
    const duration = 0.035
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * duration),
        context.sampleRate,
      )
      const samples = noiseBuffer.getChannelData(0)
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
    }
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = noiseBuffer
    filter.type = 'highpass'
    filter.frequency.value = 5500
    gain.gain.setValueAtTime(0.025, start)
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(musicBus)
    registerSource(source, [source, filter, gain], 'music', start, duration)
  }

  function scheduleMusic() {
    if (disposed || musicMuted.value || context?.state !== 'running') {
      stopMusic()
      return
    }
    // Never catch up a background timer by scheduling an unbounded backlog.
    if (nextStepTime < context.currentTime) nextStepTime = context.currentTime + 0.025
    while (nextStepTime < context.currentTime + 0.12) {
      const chord = CHORDS[Math.floor(musicStep / 16) % CHORDS.length]
      tone({
        kind: 'music',
        start: nextStepTime,
        duration: STEP_DURATION * 0.82,
        pitch: frequency(chord.notes[ARPEGGIO[musicStep % ARPEGGIO.length]]),
        volume: musicStep % 2 ? 0.07 : 0.095,
        cutoff: 1450,
        attack: 0.012,
      })
      if (musicStep % 4 === 0) {
        tone({
          kind: 'music',
          start: nextStepTime,
          duration: STEP_DURATION * 3.7,
          pitch: frequency(chord.bass),
          type: 'sine',
          volume: 0.19,
          cutoff: 340,
          attack: 0.035,
        })
        tone({
          kind: 'music',
          start: nextStepTime,
          duration: 0.14,
          pitch: 75,
          to: 38,
          type: 'sine',
          volume: 0.12,
          cutoff: 300,
        })
      }
      if (musicStep % 2 === 1) hiHat(nextStepTime)
      musicStep = (musicStep + 1) % (16 * CHORDS.length)
      nextStepTime += STEP_DURATION
    }
  }

  function startMusic() {
    if (disposed || !activated || !hasUnlocked || musicMuted.value || context?.state !== 'running')
      return
    if (musicTimer !== null) return
    setBus(musicBus, MUSIC_VOLUME)
    nextStepTime = context.currentTime + 0.035
    try {
      scheduleMusic()
      musicPlaying.value = true
      musicTimer = setInterval(() => {
        try {
          scheduleMusic()
        } catch {
          stopMusic()
        }
      }, 50)
    } catch {
      stopMusic()
    }
  }

  // Safe to call repeatedly from pointerdown, keydown, and a successful slide.
  function activate() {
    if (disposed || !supported.value) return Promise.resolve(false)
    activated = true
    if (muted.value && musicMuted.value) return Promise.resolve(false)
    const currentContext = createContext()
    if (!currentContext) return Promise.resolve(false)
    if (currentContext.state === 'running') {
      hasUnlocked = true
      startMusic()
      return Promise.resolve(true)
    }
    return resumeContext(currentContext).then((ready) => {
      if (ready) startMusic()
      return ready
    })
  }

  function playSlide() {
    if (disposed || !supported.value) return
    const ready = activate()
    if (muted.value) return
    const currentContext = context
    const epoch = effectsEpoch
    const play = () => {
      if (
        disposed ||
        muted.value ||
        effectsEpoch !== epoch ||
        context !== currentContext ||
        currentContext?.state !== 'running'
      )
        return
      try {
        tone({
          kind: 'effects',
          start: currentContext.currentTime + 0.003,
          duration: 0.085,
          pitch: 650,
          to: 170,
          volume: 0.32,
          cutoff: 2800,
          attack: 0.002,
        })
      } catch {
        // Device failure must never prevent a valid move.
      }
    }
    if (currentContext?.state === 'running') play()
    else void ready.then((running) => running && play())
  }

  async function toggleMute() {
    if (disposed) return
    muted.value = !muted.value
    storeMuted(EFFECTS_KEY, muted.value)
    if (muted.value) {
      effectsEpoch += 1
      setBus(effectsBus, 0)
      stopVoices('effects')
    } else {
      setBus(effectsBus, EFFECTS_VOLUME)
      await activate()
    }
  }

  async function toggleMusic() {
    if (disposed) return
    musicMuted.value = !musicMuted.value
    storeMuted(MUSIC_KEY, musicMuted.value)
    if (musicMuted.value) stopMusic()
    else await activate()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    effectsEpoch += 1
    stopMusic()
    stopVoices()
    if (context) context.onstatechange = null
    ;[effectsBus, musicBus, compressor, master].forEach(disconnect)
    if (context && context.state !== 'closed') {
      try {
        void Promise.resolve(context.close()).catch(() => {})
      } catch {
        // The browser may already have closed its output device.
      }
    }
    context = null
    noiseBuffer = null
  }

  onBeforeUnmount(dispose)
  return {
    muted,
    supported,
    musicMuted,
    musicPlaying,
    toggleMute,
    toggleMusic,
    activate,
    playSlide,
    dispose,
  }
}
