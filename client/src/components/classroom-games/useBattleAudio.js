// The Boss Battle's sound: effects and looping music played through one Web
// Audio device. The device is only created after a click, since browsers block
// sound before then. Both mute switches are remembered in localStorage. Web
// Audio is the one accepted exception to the course techniques in the Boss
// Battle (decision H-17), and it keeps playing in a background tab.
import { onBeforeUnmount, ref } from 'vue'
import {
  BATTLE_SOUNDS,
  MUSIC_BPM,
  MUSIC_STEPS,
  MUSIC_VOLUME,
  createMixer,
  createSynth,
  playBattleSound,
  playMusicStep,
} from './battleSounds.js'

const EFFECTS_KEY = 'learn-e-battle-muted'
const MUSIC_KEY = 'learn-e-battle-music-muted'
const MAX_VOICES = 64
const LOOK_AHEAD = 0.12
const SCHEDULE_MS = 25
const FADE = 0.04

// Sound starts off (G14): a class may be playing side by side, so the battle stays
// quiet until a student turns it on. Only a stored 'false' means they did.
function savedMute(key) {
  try {
    return window.localStorage.getItem(key) !== 'false'
  } catch {
    return true
  }
}
function storeMute(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // The choice still applies until the page closes when storage is denied.
  }
}

/**
 * The battle's speakers. The browser only allows audio after a click, so nothing is
 * created until unlock(), play() or a toggle runs from one. A sound failure never
 * reaches the battle, which is fully playable in silence.
 */
export function useBattleAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  const supported = ref(Boolean(AudioContextClass))
  const muted = ref(savedMute(EFFECTS_KEY))
  const musicMuted = ref(savedMute(MUSIC_KEY))
  const voices = new Set()
  let context = null
  let mixer = null
  let effects = null
  let music = null
  let musicWanted = false
  let musicTimer = null
  let musicIndex = 0
  let nextStepAt = 0
  let climbing = false
  let disposed = false

  function disconnect(node) {
    try {
      node?.disconnect()
    } catch {
      // An output device can vanish while a game is running.
    }
  }

  function removeVoice(voice, halt = false) {
    if (!voices.delete(voice)) return
    voice.source.onended = null
    if (halt) {
      try {
        voice.source.stop()
      } catch {
        // A finished source is already silent.
      }
    }
    voice.nodes.forEach(disconnect)
  }

  function stopVoices(kind) {
    for (const voice of voices) if (!kind || voice.kind === kind) removeVoice(voice, true)
  }

  const tracked = (kind) => (source, nodes, start, duration, offset) => {
    if (voices.size >= MAX_VOICES) removeVoice(voices.values().next().value, true)
    const voice = { source, nodes, kind }
    voices.add(voice)
    source.onended = () => removeVoice(voice)
    source.start(start, offset)
    source.stop(start + duration + 0.005)
  }

  function forgetDevice() {
    haltMusic()
    stopVoices()
    if (mixer) Object.values(mixer).forEach(disconnect)
    if (context) context.onstatechange = null
    context = null
    mixer = null
  }

  function openDevice() {
    if (disposed || !supported.value) return null
    if (context?.state === 'closed') forgetDevice()
    if (context) return context
    try {
      context = new AudioContextClass()
      mixer = createMixer(context)
      mixer.effects.gain.value = muted.value ? 0 : 1
      effects = createSynth(context, mixer.effects, tracked('effects'))
      music = createSynth(context, mixer.music, tracked('music'))
      context.onstatechange = () => {
        if (context?.state === 'running') startMusic()
        else haltMusic()
      }
      return context
    } catch {
      supported.value = false
      dispose()
      return null
    }
  }

  async function wake() {
    const device = openDevice()
    if (!device) return false
    if (device.state === 'running') return true
    try {
      await device.resume()
    } catch {
      return false
    }
    return !disposed && device === context && device.state === 'running'
  }

  function fadeMusic(volume) {
    if (!context || !mixer) return
    const now = context.currentTime
    mixer.music.gain.cancelScheduledValues(now)
    mixer.music.gain.setTargetAtTime(volume, now, FADE)
  }

  // Notes already queued ring out under the fade, so stopping never clicks.
  function haltMusic() {
    if (musicTimer !== null) clearInterval(musicTimer)
    musicTimer = null
    fadeMusic(0)
  }

  function scheduleMusic() {
    if (context.state !== 'running') return
    // After a stall, skip the missed notes instead of playing them all at once.
    if (nextStepAt < context.currentTime) nextStepAt = context.currentTime + 0.025
    while (nextStepAt < context.currentTime + LOOK_AHEAD) {
      playMusicStep(music, musicIndex, nextStepAt, climbing)
      musicIndex = (musicIndex + 1) % MUSIC_STEPS
      nextStepAt += 60 / MUSIC_BPM / 4
    }
  }

  function startMusic() {
    if (
      disposed ||
      !musicWanted ||
      musicMuted.value ||
      context?.state !== 'running' ||
      musicTimer !== null
    )
      return
    fadeMusic(MUSIC_VOLUME)
    nextStepAt = 0
    try {
      scheduleMusic()
      musicTimer = setInterval(() => {
        try {
          scheduleMusic()
        } catch {
          haltMusic()
        }
      }, SCHEDULE_MS)
    } catch {
      haltMusic()
    }
  }

  /** Call first thing in a click handler, before any await, while the click still counts. */
  function unlock() {
    if (muted.value && musicMuted.value) return
    void wake()
  }

  function play(name) {
    if (disposed || muted.value || !supported.value || !BATTLE_SOUNDS.has(name)) return
    const device = openDevice()
    if (!device) return
    const perform = () => {
      if (disposed || muted.value || device !== context) return
      try {
        playBattleSound(name, effects, device.currentTime + 0.003)
      } catch {
        // A sound failure must not interrupt the battle.
      }
    }
    if (device.state === 'running') perform()
    else void wake().then((ready) => ready && perform())
  }

  async function setPlaying(wanted) {
    musicWanted = wanted
    if (!wanted) {
      haltMusic()
      return
    }
    musicIndex = 0
    if (!musicMuted.value && (await wake())) startMusic()
  }

  /** The share of the monster's health left, from 1 down to 0. */
  function setHealth(share) {
    climbing = share <= 0.5
  }

  async function toggleMute() {
    muted.value = !muted.value
    storeMute(EFFECTS_KEY, muted.value)
    if (muted.value) {
      if (mixer) mixer.effects.gain.setValueAtTime(0, context.currentTime)
      stopVoices('effects')
    } else if (openDevice()) {
      // Set before waking, so a device that cannot wake yet is not left silent for good.
      mixer.effects.gain.setValueAtTime(1, context.currentTime)
      void wake()
    }
  }

  async function toggleMusic() {
    musicMuted.value = !musicMuted.value
    storeMute(MUSIC_KEY, musicMuted.value)
    if (musicMuted.value) haltMusic()
    else if (musicWanted && (await wake())) startMusic()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    musicWanted = false
    const device = context
    forgetDevice()
    if (device && device.state !== 'closed') {
      try {
        void Promise.resolve(device.close()).catch(() => {})
      } catch {
        // The device may already have gone.
      }
    }
  }

  onBeforeUnmount(dispose)
  return {
    supported,
    muted,
    musicMuted,
    unlock,
    play,
    setPlaying,
    setHealth,
    toggleMute,
    toggleMusic,
  }
}
