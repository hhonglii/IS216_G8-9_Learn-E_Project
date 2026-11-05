import { onBeforeUnmount, ref } from 'vue'

const STORAGE_KEY = 'learn-e-rootkit-muted'
const SILENCE = 0.0001
const VOLUME = 0.22
const SOUNDS = new Set(['key', 'open', 'minimize', 'error', 'win'])

function savedMute() {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Small procedural desktop sounds; no files, music, or background scheduler. */
export function useRetroAudio() {
  const AudioContextClass =
    typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext
  const supported = ref(Boolean(AudioContextClass))
  const muted = ref(savedMute())
  const voices = new Set()
  let context = null
  let master = null
  let compressor = null
  let noiseBuffer = null
  let resumePromise = null
  let disposed = false
  // Invalidate queued resume callbacks whenever mute or disposal stops a sound.
  let epoch = 0
  let lastKey = -Infinity

  function disconnect(node) {
    try {
      node?.disconnect()
    } catch {
      // A removed audio device may already have disconnected its graph.
    }
  }

  function removeVoice(voice, stop = false) {
    if (stop) {
      try {
        voice.source.stop()
      } catch {
        // Sources can finish while the output device is being closed.
      }
    }
    voice.nodes.forEach(disconnect)
    voices.delete(voice)
  }

  function stopVoices() {
    epoch += 1
    for (const voice of voices) removeVoice(voice, true)
  }

  function createContext() {
    // Allocate the browser audio device only from a player gesture, never from a gallery card.
    if (disposed || !supported.value) return null
    if (context?.state === 'closed') {
      stopVoices()
      disconnect(master)
      disconnect(compressor)
      context = null
      noiseBuffer = null
      resumePromise = null
    }
    if (context) return context
    try {
      context = new AudioContextClass()
      master = context.createGain()
      compressor = context.createDynamicsCompressor()
      master.gain.value = muted.value ? 0 : VOLUME
      compressor.threshold.value = -20
      compressor.knee.value = 12
      compressor.ratio.value = 6
      compressor.attack.value = 0.002
      compressor.release.value = 0.1
      compressor.connect(master)
      master.connect(context.destination)
      return context
    } catch {
      supported.value = false
      dispose()
      return null
    }
  }

  function resume(currentContext) {
    if (currentContext.state === 'running') return Promise.resolve(true)
    if (currentContext.state === 'closed') return Promise.resolve(false)
    if (resumePromise) return resumePromise
    try {
      const attempt = Promise.resolve(currentContext.resume())
        .then(() => !disposed && context === currentContext && currentContext.state === 'running')
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

  function register(source, nodes, start, duration) {
    // onended releases normal voices; the limit also bounds very rapid UI bursts.
    if (voices.size >= 48) removeVoice(voices.values().next().value, true)
    const voice = { source, nodes }
    voices.add(voice)
    source.onended = () => removeVoice(voice)
    source.start(start)
    source.stop(start + duration + 0.005)
  }

  function envelope(parameter, start, duration, volume) {
    parameter.setValueAtTime(SILENCE, start)
    parameter.exponentialRampToValueAtTime(volume, start + 0.0015)
    parameter.exponentialRampToValueAtTime(SILENCE, start + duration)
  }

  function tone({ start, duration, pitch, to = pitch, type = 'sine', volume = 0.12, cutoff }) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(pitch, start)
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
    envelope(gain.gain, start, duration, volume)
    const nodes = [oscillator, gain]
    if (cutoff) {
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
      filter.Q.value = 0.6
      oscillator.connect(filter)
      filter.connect(gain)
      nodes.push(filter)
    } else oscillator.connect(gain)
    gain.connect(compressor)
    register(oscillator, nodes, start, duration)
  }

  function keyNoise(start, variation) {
    const duration = 0.026
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
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(2200 * variation, start)
    filter.Q.value = 1.4
    envelope(gain.gain, start, duration, 0.1)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(compressor)
    register(source, [source, filter, gain], start, duration)
  }

  function synthesize(name) {
    const start = context.currentTime + 0.003
    if (name === 'key') {
      const variation = 0.92 + Math.random() * 0.16
      keyNoise(start, variation)
      tone({ start, duration: 0.012, pitch: 1700 * variation, type: 'square', volume: 0.035 })
    } else if (name === 'open' || name === 'minimize') {
      const rising = name === 'open'
      tone({
        start,
        duration: 0.1,
        pitch: rising ? 400 : 800,
        to: rising ? 800 : 400,
        volume: 0.15,
      })
      tone({
        start: start + 0.035,
        duration: 0.1,
        pitch: rising ? 600 : 1200,
        to: rising ? 1200 : 600,
        volume: 0.08,
      })
    } else if (name === 'error') {
      for (let index = 0; index < 2; index += 1) {
        tone({
          start: start + index * 0.11,
          duration: 0.07,
          pitch: 110,
          type: 'sawtooth',
          volume: 0.15,
          cutoff: 1400,
        })
      }
    } else if (name === 'win') {
      ;[523.251, 659.255, 783.991, 1046.502].forEach((pitch, index) => {
        tone({
          start: start + index * 0.085,
          duration: index === 3 ? 0.18 : 0.11,
          pitch,
          type: 'square',
          volume: 0.08,
        })
      })
    }
  }

  function play(name) {
    if (disposed || muted.value || !supported.value || !SOUNDS.has(name)) return
    if (name === 'key') {
      const now = typeof performance === 'undefined' ? Date.now() : performance.now()
      if (now - lastKey < 18) return
      lastKey = now
    }
    const currentContext = createContext()
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
        // An audio failure must not stop an operating-system puzzle action.
      }
    }
    if (currentContext.state === 'running') perform()
    else void resume(currentContext).then((ready) => ready && perform())
  }

  async function toggleMute() {
    if (disposed) return
    muted.value = !muted.value
    try {
      window.localStorage.setItem(STORAGE_KEY, String(muted.value))
    } catch {
      // The preference still applies for this session when storage is denied.
    }
    if (muted.value) {
      if (context && master) {
        master.gain.cancelScheduledValues(context.currentTime)
        master.gain.setValueAtTime(0, context.currentTime)
      }
      stopVoices()
    } else {
      const currentContext = createContext()
      if (!currentContext) return
      master.gain.setValueAtTime(VOLUME, currentContext.currentTime)
      await resume(currentContext)
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    stopVoices()
    disconnect(compressor)
    disconnect(master)
    if (context && context.state !== 'closed') {
      try {
        void Promise.resolve(context.close()).catch(() => {})
      } catch {
        // Some browsers close the device before the game is unmounted.
      }
    }
    context = null
    noiseBuffer = null
  }

  onBeforeUnmount(dispose)
  return { muted, supported, toggleMute, play, dispose }
}
