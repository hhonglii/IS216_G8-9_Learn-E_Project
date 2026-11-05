import { onBeforeUnmount, ref } from 'vue'

const STORAGE_KEY = 'learn-e-tetris-muted'
const MUSIC_KEY = 'learn-e-tetris-music-muted'
const SILENCE = 0.0001
const VOLUME = 0.24
const MUSIC_VOLUME = 0.45
const SOUNDS = new Set(['move', 'rotate', 'drop', 'lock', 'clear', 'hold', 'over', 'start'])
// Original four-bar minor progression and sixteenth-note cyber arcade motif.
const ROOTS = [45, 41, 38, 40]
const MELODY = [0, 7, 12, 10, 7, 3, 10, 14, 12, 7, 3, 10, 7, 14, 10, 7]
const BASS_STEPS = new Set([0, 3, 6, 8, 10, 14])
const pitchAt = (midi) => 440 * 2 ** ((midi - 69) / 12)

function savedMute(key = STORAGE_KEY) {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function storeMute(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Preference persistence is optional in private or embedded sessions.
  }
}

/** Original synth music and arcade effects share one gesture-unlocked audio device. */
export function useTetrisAudio() {
  const AudioContextClass =
    typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext
  const muted = ref(savedMute())
  const musicMuted = ref(savedMute(MUSIC_KEY))
  const musicPlaying = ref(false)
  const bpm = ref(128)
  const supported = ref(Boolean(AudioContextClass))
  const voices = new Set()
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
  let musicRequested = false
  let hasUnlocked = false
  let musicEpoch = 0
  let disposed = false
  let epoch = 0
  let lastMove = -Infinity

  function disconnect(node) {
    try {
      node?.disconnect()
    } catch {
      // Output devices can disappear while a game is running.
    }
  }

  function removeVoice(voice, halt = false) {
    // stop() also queues a native ended event. Claim cleanup once so that event
    // cannot disconnect the same graph again after a pause or unmount.
    if (!voices.delete(voice)) return
    voice.source.onended = null
    if (halt) {
      try {
        voice.source.stop()
      } catch {
        // Finished sources are already silent.
      }
    }
    voice.nodes.forEach(disconnect)
  }

  function stopVoices(kind) {
    for (const voice of voices) {
      if (!kind || voice.kind === kind) removeVoice(voice, true)
    }
  }

  function setBus(bus, value) {
    if (!context || !bus) return
    bus.gain.cancelScheduledValues(context.currentTime)
    bus.gain.setValueAtTime(value, context.currentTime)
  }

  function stopMusic() {
    if (musicTimer !== null) clearInterval(musicTimer)
    musicTimer = null
    musicPlaying.value = false
    nextStepTime = 0
    setBus(musicBus, 0)
    stopVoices('music')
  }

  function stop() {
    musicRequested = false
    musicEpoch += 1 // Invalidate a music start waiting for AudioContext.resume().
    stopMusic()
    epoch += 1
    lastMove = -Infinity
    stopVoices()
  }

  function createContext() {
    if (disposed || !supported.value) return null
    if (context?.state === 'closed') {
      // Keep run intent while replacing a closed output device on this gesture.
      musicEpoch += 1
      stopMusic()
      epoch += 1
      stopVoices()
      disconnect(effectsBus)
      disconnect(musicBus)
      disconnect(master)
      disconnect(compressor)
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
      master.gain.value = VOLUME
      effectsBus.gain.value = muted.value ? 0 : 1
      musicBus.gain.value = 0
      compressor.threshold.value = -18
      compressor.knee.value = 12
      compressor.ratio.value = 5
      compressor.attack.value = 0.003
      compressor.release.value = 0.12
      effectsBus.connect(compressor)
      musicBus.connect(compressor)
      compressor.connect(master)
      master.connect(context.destination)
      context.onstatechange = () => {
        if (context?.state !== 'running') stopMusic()
        else if (hasUnlocked && musicRequested) startMusic()
      }
      return context
    } catch {
      supported.value = false
      dispose()
      return null
    }
  }

  function resume(currentContext) {
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
          if (resumePromise === attempt) resumePromise = null
        })
      resumePromise = attempt
      return attempt
    } catch {
      return Promise.resolve(false)
    }
  }

  function tone({
    kind = 'fx',
    start,
    duration,
    pitch,
    to = pitch,
    type = 'sine',
    volume = 0.12,
    cutoff = 2600,
  }) {
    const source = context.createOscillator()
    const gain = context.createGain()
    const filter = context.createBiquadFilter()
    source.type = type
    source.frequency.setValueAtTime(pitch, start)
    source.frequency.exponentialRampToValueAtTime(to, start + duration)
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    filter.Q.value = 0.65
    gain.gain.setValueAtTime(SILENCE, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.002)
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(kind === 'music' ? musicBus : effectsBus)
    register(source, [source, filter, gain], kind, start, duration)
  }

  function register(source, nodes, kind, start, duration) {
    // Effects and look-ahead music share a bound even during rapid input bursts.
    if (voices.size >= 40) removeVoice(voices.values().next().value, true)
    const voice = { source, nodes, kind }
    voices.add(voice)
    source.onended = () => removeVoice(voice)
    source.start(start)
    source.stop(start + duration + 0.005)
  }

  function drumNoise(start, snare = false) {
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 0.12),
        context.sampleRate,
      )
      const samples = noiseBuffer.getChannelData(0)
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
    }
    const duration = snare ? 0.11 : 0.026
    const source = context.createBufferSource()
    const gain = context.createGain()
    const filter = context.createBiquadFilter()
    source.buffer = noiseBuffer
    filter.type = snare ? 'bandpass' : 'highpass'
    filter.frequency.value = snare ? 1700 : 6500
    filter.Q.value = 0.7
    gain.gain.setValueAtTime(snare ? 0.12 : 0.035, start)
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(musicBus)
    register(source, [source, filter, gain], 'music', start, duration)
  }

  function scheduleMusic() {
    if (disposed || !musicRequested || musicMuted.value || context?.state !== 'running') {
      stopMusic()
      return
    }
    // Drop missed beats after a stalled tab instead of scheduling a large backlog.
    if (nextStepTime < context.currentTime) nextStepTime = context.currentTime + 0.025
    // Schedule against the audio clock; the JS timer only replenishes this
    // short window, so frame-rate jitter cannot stretch individual notes.
    while (nextStepTime < context.currentTime + 0.12) {
      const step = musicStep % 16
      const root = ROOTS[Math.floor(musicStep / 16) % ROOTS.length]
      const duration = 60 / bpm.value / 4
      tone({
        kind: 'music',
        start: nextStepTime,
        duration: duration * 0.76,
        pitch: pitchAt(root + 24 + MELODY[step]),
        type: 'triangle',
        volume: step % 4 === 0 ? 0.1 : 0.075,
        cutoff: 2800,
      })
      if (BASS_STEPS.has(step)) {
        tone({
          kind: 'music',
          start: nextStepTime,
          duration: duration * 1.65,
          pitch: pitchAt(root + (step === 14 ? 7 : 0)),
          type: 'sawtooth',
          volume: 0.17,
          cutoff: 420,
        })
      }
      if ([0, 6, 8, 14].includes(step)) {
        tone({
          kind: 'music',
          start: nextStepTime,
          duration: 0.12,
          pitch: 100,
          to: 40,
          volume: 0.2,
          cutoff: 350,
        })
      }
      if (step === 4 || step === 12) drumNoise(nextStepTime, true)
      if (step % 2 === 0) drumNoise(nextStepTime)
      musicStep = (musicStep + 1) % 64
      nextStepTime += duration
    }
  }

  function startMusic() {
    if (
      disposed ||
      !musicRequested ||
      !hasUnlocked ||
      musicMuted.value ||
      context?.state !== 'running' ||
      musicTimer !== null
    )
      return
    setBus(musicBus, MUSIC_VOLUME)
    nextStepTime = context.currentTime + 0.025
    try {
      scheduleMusic()
      musicPlaying.value = true
      musicTimer = setInterval(() => {
        try {
          scheduleMusic()
        } catch {
          stopMusic()
        }
      }, 25)
    } catch {
      stopMusic()
    }
  }

  function activate() {
    if (disposed || !supported.value || (muted.value && (!musicRequested || musicMuted.value)))
      return Promise.resolve(false)
    const currentContext = createContext()
    if (!currentContext) return Promise.resolve(false)
    const generation = musicEpoch
    if (currentContext.state === 'running') {
      hasUnlocked = true
      startMusic()
      return Promise.resolve(true)
    }
    return resume(currentContext).then((ready) => {
      if (ready && musicEpoch === generation) startMusic()
      return ready
    })
  }

  function setPlaying(value) {
    if (disposed) return Promise.resolve(false)
    const next = Boolean(value)
    if (musicRequested !== next) musicEpoch += 1
    musicRequested = next
    if (!next) {
      stopMusic()
      return Promise.resolve(false)
    }
    return activate()
  }

  function setLevel(level) {
    if (!Number.isFinite(Number(level))) return
    bpm.value = Math.min(164, 128 + Math.max(0, Math.floor(Number(level)) - 1) * 3)
  }

  function synthesize(name) {
    const start = context.currentTime + 0.003
    if (name === 'move') {
      tone({
        start,
        duration: 0.025,
        pitch: 320,
        to: 260,
        type: 'square',
        volume: 0.055,
        cutoff: 1400,
      })
    } else if (name === 'rotate') {
      tone({ start, duration: 0.075, pitch: 360, to: 720, volume: 0.13 })
    } else if (name === 'drop') {
      tone({
        start,
        duration: 0.14,
        pitch: 100,
        to: 38,
        type: 'triangle',
        volume: 0.24,
        cutoff: 750,
      })
    } else if (name === 'lock') {
      tone({
        start,
        duration: 0.045,
        pitch: 200,
        to: 150,
        type: 'square',
        volume: 0.085,
        cutoff: 1000,
      })
    } else if (name === 'hold') {
      tone({ start, duration: 0.05, pitch: 720, to: 420, volume: 0.1 })
      tone({ start: start + 0.04, duration: 0.05, pitch: 420, to: 720, volume: 0.1 })
    } else {
      const profiles = {
        clear: {
          pitches: [523.25, 659.25, 783.99, 1046.5],
          spacing: 0.045,
          duration: 0.14,
          type: 'sine',
          volume: 0.13,
        },
        over: {
          pitches: [220, 174.61, 130.81, 65.41],
          spacing: 0.08,
          duration: 0.12,
          type: 'sawtooth',
          volume: 0.12,
          cutoff: 900,
        },
        start: {
          pitches: [220, 440, 660],
          spacing: 0.065,
          duration: 0.1,
          type: 'triangle',
          volume: 0.11,
        },
      }
      const profile = profiles[name]
      profile.pitches.forEach((pitch, index) => {
        tone({
          start: start + index * profile.spacing,
          duration: profile.duration,
          pitch,
          type: profile.type,
          volume: profile.volume,
          cutoff: profile.cutoff,
        })
      })
    }
  }

  function play(name) {
    if (disposed || muted.value || !supported.value || !SOUNDS.has(name)) return
    if (name === 'move') {
      const now = typeof performance === 'undefined' ? Date.now() : performance.now()
      if (now - lastMove < 35) return
      lastMove = now
    }
    const ready = activate()
    const currentContext = context
    if (!currentContext) return
    const currentEpoch = epoch
    const perform = () => {
      if (
        disposed ||
        muted.value ||
        epoch !== currentEpoch ||
        context !== currentContext ||
        currentContext.state !== 'running'
      )
        return
      try {
        synthesize(name)
      } catch {
        // Sound must never interrupt a falling piece or a completed line.
      }
    }
    if (currentContext.state === 'running') perform()
    else void ready.then((running) => running && perform())
  }

  async function toggleMute() {
    if (disposed) return
    muted.value = !muted.value
    storeMute(STORAGE_KEY, muted.value)
    if (muted.value) {
      setBus(effectsBus, 0)
      epoch += 1
      stopVoices('fx')
    } else {
      setBus(effectsBus, 1)
      await activate()
    }
  }

  async function toggleMusic() {
    if (disposed) return
    musicEpoch += 1
    musicMuted.value = !musicMuted.value
    storeMute(MUSIC_KEY, musicMuted.value)
    if (musicMuted.value) stopMusic()
    else if (musicRequested) await activate()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    stop()
    if (context) context.onstatechange = null
    disconnect(effectsBus)
    disconnect(musicBus)
    disconnect(compressor)
    disconnect(master)
    if (context && context.state !== 'closed') {
      try {
        void Promise.resolve(context.close()).catch(() => {})
      } catch {
        // An output device may have closed before the view was unmounted.
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
    bpm,
    play,
    toggleMute,
    toggleMusic,
    setPlaying,
    setLevel,
    activate,
    stop,
    dispose,
  }
}
