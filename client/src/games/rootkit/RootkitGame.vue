<script setup>
// Optional game; guide: docs/games.md.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DesktopWindow from './DesktopWindow.vue'
import RootkitIcon from './RootkitIcon.vue'
import RootkitTutorial from './RootkitTutorial.vue'
import RootkitCommands from './RootkitCommands.vue'
import { useRootkitEngine } from './useRootkitEngine.js'
import { useWindowManager } from './useWindowManager.js'
import { useRetroAudio } from './useRetroAudio.js'
import { formatGameScore, useGameHighScores } from '../useGameHighScores.js'

defineEmits(['exit'])
const {
  state,
  prompt,
  execute,
  complete,
  historyPrevious,
  historyNext,
  start,
  restart,
  tick,
  pause,
  resume,
  inspectPacket,
  setFrequency,
} = useRootkitEngine()
const { state: highScores, beginRun, queueScore, flushScore } = useGameHighScores('rootkit')
const {
  windows,
  activeId,
  openWindow,
  closeWindow,
  minimizeWindow,
  toggleMaximize,
  focusWindow,
  startDrag,
  moveWindow,
  setBounds,
  resetWindows,
} = useWindowManager()
const { muted, supported, toggleMute, play } = useRetroAudio()
const windowArea = ref(null)
const terminalInput = ref(null)
const terminalOutput = ref(null)
const resultTitle = ref(null)
const command = ref('')
const frequencyDraft = ref('320')
const completions = ref([])
const glitching = ref(false)
const theme = ref('glass')
const tutorialOpen = ref(true)
const commandsOpen = ref(false)
// Help overlays pause the same mission; tutorial practice owns its own isolated state.
const helpOpen = computed(() => tutorialOpen.value || commandsOpen.value)
const TUTORIAL_KEY = 'learn-e-rootkit-tutorial-v1'
const dockButtons = new Map()
const notePositions = ref([
  { x: 4, y: 6 },
  { x: 18, y: 220 },
])
const metrics = ref({
  cpu: 24,
  ram: 42,
  cpuHistory: [17, 25, 22, 28, 21, 26, 24, 32, 22, 28, 24, 25],
  ramHistory: [38, 39, 38, 40, 41, 40, 42, 41, 43, 42, 41, 42],
})
const packets = ref(
  Array.from({ length: 6 }, (_, index) => ({
    id: index,
    bytes: ['45 00 00 3C 6A 10 40 00', '0A 18 00 08 00 16 3D C2', '80 18 FF FF 29 0A 00 00'][
      index % 3
    ],
    type: index % 2 ? 'TCP' : 'ACK',
  })),
)
const visibleWindows = computed(() => windows.value.filter((win) => win.open && !win.minimized))
const missionActive = computed(() => state.value.status === 'playing' && !state.value.paused)
const clockText = computed(() => formatClock(state.value.elapsed))
const stages = [
  { label: 'Decode the key', detail: 'Find the access phrase' },
  { label: 'Open the tunnel', detail: 'Connect to the machine' },
  { label: 'Brew espresso', detail: 'Give the final command' },
]
const apps = [
  { id: 'terminal', label: 'Terminal', title: 'bash_terminal.exe' },
  { id: 'notes', label: 'Notes', title: 'sticky_notes.app' },
  { id: 'sniffer', label: 'Sniffer', title: 'net_sniffer.app' },
  { id: 'monitor', label: 'Monitor', title: 'sys_monitor.app' },
]
let clockTimer
let glitchTimer
let observer
let lastSample = 0
let packetId = 6
let noteDrag = null
let helpReturnFocus = null

try {
  if (localStorage.getItem('learn-e-rootkit-theme') === 'crt') theme.value = 'crt'
  tutorialOpen.value = localStorage.getItem(TUTORIAL_KEY) !== 'done'
} catch {
  /* Preferences are optional. */
}

function formatClock(value) {
  const seconds = Math.max(0, Math.floor(value || 0))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
function captureTerminalInput(element) {
  terminalInput.value = element
}
function captureTerminalOutput(element) {
  terminalOutput.value = element
}
function graphPoints(values) {
  return values
    .map((value, index) => `${(index * 240) / (values.length - 1)},${49 - value * 0.44}`)
    .join(' ')
}

function rememberTutorial() {
  try {
    localStorage.setItem(TUTORIAL_KEY, 'done')
  } catch {
    /* The guide remains optional when browser storage is restricted. */
  }
}
function openTutorial() {
  if (helpOpen.value) return
  if (state.value.status === 'playing' && !pause()) return
  helpReturnFocus = document.activeElement
  tutorialOpen.value = true
  play('open')
}
function closeTutorial() {
  rememberTutorial()
  tutorialOpen.value = false
  void restoreHelpFocus()
}
function openCommands() {
  if (helpOpen.value) return
  if (state.value.status === 'playing' && !pause()) return
  helpReturnFocus = document.activeElement
  commandsOpen.value = true
  play('open')
}
function closeCommands() {
  commandsOpen.value = false
  void restoreHelpFocus()
}
async function restoreHelpFocus() {
  // Resume without clearing a command/password draft, and return focus to the opening control.
  resume()
  await nextTick()
  if (helpReturnFocus?.isConnected && !helpReturnFocus.closest('[inert]')) {
    helpReturnFocus.focus({ preventScroll: true })
  } else {
    document
      .querySelector('.rootkit-game .mission-card .rk-primary')
      ?.focus({ preventScroll: true })
  }
  helpReturnFocus = null
}
function startFromTutorial() {
  rememberTutorial()
  tutorialOpen.value = false
  if (state.value.status === 'ready') bootMission()
  else restartMission()
}

function toggleTheme() {
  theme.value = theme.value === 'glass' ? 'crt' : 'glass'
  try {
    localStorage.setItem('learn-e-rootkit-theme', theme.value)
  } catch {
    /* Keep the current session usable. */
  }
  play('open')
}

async function focusTerminal() {
  await nextTick()
  terminalInput.value?.focus({ preventScroll: true })
}
function launchApp(id) {
  const win = windows.value.find((item) => item.id === id)
  const wasHidden = !win?.open || win?.minimized
  openWindow(id)
  if (wasHidden) play('open')
  if (id === 'terminal') void focusTerminal()
}
function setDockTarget(id) {
  const win = windows.value.find((item) => item.id === id)
  const element = windowArea.value?.querySelector(`[data-window-id="${id}"]`)
  const dock = dockButtons.get(id)
  if (!win || !element || !dock) return
  const source = element.getBoundingClientRect()
  const target = dock.getBoundingClientRect()
  win.dockDx = target.x + target.width / 2 - source.x - source.width / 2
  win.dockDy = target.y + target.height / 2 - source.y - source.height / 2
}
function minimizeApp(id) {
  setDockTarget(id)
  minimizeWindow(id)
  play('minimize')
}
function closeApp(id) {
  setDockTarget(id)
  closeWindow(id)
  play('minimize')
}
function maximizeApp(id) {
  toggleMaximize(id)
  play('open')
}
function dockClick(id) {
  const win = windows.value.find((item) => item.id === id)
  if (win?.open && !win.minimized && activeId.value === id) minimizeApp(id)
  else launchApp(id)
}

function flashError() {
  glitching.value = false
  void nextTick(() => {
    glitching.value = true
  })
  clearTimeout(glitchTimer)
  glitchTimer = setTimeout(() => {
    glitching.value = false
  }, 320)
  play('error')
}
function submitCommand() {
  if (!command.value.trim() || !missionActive.value) return
  const result = execute(command.value)
  command.value = ''
  completions.value = []
  if (result?.error && state.value.status === 'playing') flashError()
  if (missionActive.value) void focusTerminal()
}
function terminalKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key.length === 1 || event.key === 'Backspace') play('key')
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    if (state.value.awaitingPassword) return
    const result = complete(command.value)
    command.value = result.value
    completions.value = result.matches
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    if (state.value.awaitingPassword) return
    command.value = event.key === 'ArrowUp' ? historyPrevious(command.value) : historyNext()
    completions.value = []
  }
}

function capturePacket() {
  inspectPacket()
  play('open')
}
function changeFrequency(value, fromDraft = false) {
  if (fromDraft) {
    // Keep intermediate edits (for example empty -> 4 -> 40 -> 404) out of engine clamping.
    frequencyDraft.value = value
    if (!value.trim() || Number(value) < 200 || Number(value) > 600) return
  }
  const result = setFrequency(Number(value))
  if (!fromDraft) frequencyDraft.value = String(state.value.frequency)
  if (result.event === 'unlock') play('open')
}
function bootMission() {
  if (state.value.status !== 'ready') return
  beginRun()
  start()
  frequencyDraft.value = String(state.value.frequency)
  resetWindows()
  command.value = ''
  completions.value = []
  play('open')
  void focusTerminal()
}
function restartMission() {
  beginRun()
  restart()
  frequencyDraft.value = String(state.value.frequency)
  resetWindows()
  command.value = ''
  completions.value = []
  notePositions.value = [
    { x: 4, y: 6 },
    { x: 18, y: 220 },
  ]
  play('open')
  void focusTerminal()
}

function startNoteDrag(index, event) {
  if (event.button !== 0) return
  const note = event.currentTarget.closest('.sticky-note')
  const canvas = event.currentTarget.closest('.notes-canvas')
  noteDrag = {
    index,
    pointer: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    start: { ...notePositions.value[index] },
    maxX: Math.max(0, canvas.clientWidth - note.offsetWidth),
    maxY: Math.max(0, canvas.clientHeight - note.offsetHeight),
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}
function dragNote(event) {
  if (!noteDrag || noteDrag.pointer !== event.pointerId) return
  notePositions.value[noteDrag.index] = {
    x: Math.max(0, Math.min(noteDrag.maxX, noteDrag.start.x + event.clientX - noteDrag.x)),
    y: Math.max(0, Math.min(noteDrag.maxY, noteDrag.start.y + event.clientY - noteDrag.y)),
  }
}
function moveNote(index, event) {
  const delta = { ArrowUp: [0, -10], ArrowDown: [0, 10], ArrowLeft: [-10, 0], ArrowRight: [10, 0] }[
    event.key
  ]
  if (!delta) return
  event.preventDefault()
  const note = event.currentTarget.closest('.sticky-note')
  const canvas = event.currentTarget.closest('.notes-canvas')
  const pos = notePositions.value[index]
  notePositions.value[index] = {
    x: Math.max(0, Math.min(canvas.clientWidth - note.offsetWidth, pos.x + delta[0])),
    y: Math.max(0, Math.min(canvas.clientHeight - note.offsetHeight, pos.y + delta[1])),
  }
}

watch(
  () => state.value.status,
  (status) => {
    if (status === 'won') {
      queueScore(state.value.elapsedMs)
      void flushScore()
    }
  },
  { flush: 'sync' },
)
watch(
  () => state.value.log.at(-1)?.id,
  async () => {
    await nextTick()
    if (terminalOutput.value) terminalOutput.value.scrollTop = terminalOutput.value.scrollHeight
  },
)
watch(
  () => state.value.status,
  async (status) => {
    if (status === 'won') {
      tutorialOpen.value = false
      commandsOpen.value = false
      play('win')
      await nextTick()
      resultTitle.value?.focus({ preventScroll: true })
    }
  },
)
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const bounds = entries[0]?.contentRect
    if (bounds) setBounds(bounds.width, bounds.height)
  })
  if (windowArea.value) observer.observe(windowArea.value)
  clockTimer = setInterval(() => {
    // The engine tracks elapsed play; this interval also refreshes decorative local telemetry.
    tick()
    if (!missionActive.value || Date.now() - lastSample < 1100) return
    lastSample = Date.now()
    const cpu = Math.round(15 + (state.value.frequency - 200) / 9 + Math.sin(packetId * 0.8) * 8)
    const ram = Math.round(34 + visibleWindows.value.length * 4 + Math.sin(packetId * 0.4) * 6)
    metrics.value = {
      cpu,
      ram,
      cpuHistory: [...metrics.value.cpuHistory.slice(1), cpu],
      ramHistory: [...metrics.value.ramHistory.slice(1), ram],
    }
    packets.value = [
      ...packets.value.slice(1),
      {
        id: packetId++,
        bytes: ['0A 18 00 08 00 16 3D C2', '80 18 FF FF 29 0A 00 00', '45 00 00 3C 6A 10 40 00'][
          packetId % 3
        ],
        type: packetId % 2 ? 'TCP' : 'ACK',
      },
    ]
  }, 250)
})
onBeforeUnmount(() => {
  void flushScore()
  clearInterval(clockTimer)
  clearTimeout(glitchTimer)
  observer?.disconnect()
})
</script>

<template>
  <section class="rootkit-game" aria-labelledby="rootkit-title">
    <header class="rootkit-header" :inert="helpOpen || undefined">
      <div class="rootkit-identity">
        <button
          type="button"
          class="rk-back"
          aria-label="Back to game library"
          @click="$emit('exit')"
        >
          ←
        </button>
        <div>
          <h2 id="rootkit-title">RootKit <span>OS</span></h2>
          <p>A caffeine recovery operation, at your own pace.</p>
        </div>
      </div>
      <span class="rootkit-version">Personal edition / v0.4.04</span>
    </header>

    <div class="virtual-monitor" :class="[`rk-theme-${theme}`, { 'is-glitching': glitching }]">
      <div class="monitor-menubar" :inert="helpOpen || undefined">
        <div class="os-brand">
          <RootkitIcon name="coffee" /><strong>RootKit</strong><span>coffee.local</span>
        </div>
        <div class="menubar-right">
          <button type="button" class="tutorial-trigger" @click="openTutorial">
            <span aria-hidden="true">?</span>How to play
          </button>
          <button type="button" class="tutorial-trigger" @click="openCommands">Commands</button>
          <button
            type="button"
            class="theme-toggle"
            :aria-label="
              theme === 'glass' ? 'Switch to Amber CRT Retro' : 'Switch to Night-City Glass'
            "
            :aria-pressed="theme === 'crt'"
            @click="toggleTheme"
          >
            <span aria-hidden="true">◐</span
            >{{ theme === 'glass' ? 'Night-City Glass' : 'Amber CRT Retro' }}</button
          ><span
            class="mission-clock"
            aria-label="Time elapsed"
            title="Elapsed play time"
            data-testid="rootkit-timer"
            >{{ clockText }}</span
          >
        </div>
      </div>

      <div class="desktop-content" :inert="!missionActive || helpOpen || undefined">
        <div class="desktop-wallpaper" aria-hidden="true">
          <div class="wallpaper-circuit"></div>
          <span class="wallpaper-code">403</span>
          <p>caffeine access denied.</p>
          <RootkitIcon name="coffee" />
        </div>
        <div class="desktop-shortcuts" aria-label="Desktop apps">
          <button
            v-for="app in apps"
            :key="app.id"
            type="button"
            :aria-label="`Open ${app.title}`"
            @click="launchApp(app.id)"
          >
            <span class="shortcut-icon" :class="`icon-${app.id}`"
              ><RootkitIcon :name="app.id" /></span
            ><span>{{ app.label }}</span>
          </button>
        </div>
        <div ref="windowArea" class="window-area">
          <TransitionGroup name="rk-window" tag="div" class="window-layer">
            <DesktopWindow
              v-for="win in visibleWindows"
              :key="win.id"
              :window="win"
              :active="activeId === win.id"
              @focus="focusWindow(win.id)"
              @drag-start="startDrag(win.id, $event)"
              @move="(dx, dy) => moveWindow(win.id, dx, dy)"
              @minimize="minimizeApp(win.id)"
              @maximize="maximizeApp(win.id)"
              @close="closeApp(win.id)"
            >
              <template v-if="win.id === 'terminal'">
                <div class="terminal-screen">
                  <div class="terminal-session">
                    <span :class="{ connected: state.connected }"></span
                    >{{
                      state.connected ? 'secure tunnel / coffee.local' : 'local session / student'
                    }}<span class="terminal-hint">Tab complete · Shift+Tab exit · ↑↓ history</span>
                  </div>
                  <div
                    :ref="captureTerminalOutput"
                    class="terminal-output"
                    role="log"
                    aria-label="Terminal output"
                    aria-live="polite"
                    aria-relevant="additions text"
                  >
                    <pre
                      v-for="entry in state.log"
                      :key="entry.id"
                      :class="`terminal-line line-${entry.kind}`"
                      >{{ entry.text }}</pre>
                  </div>
                  <form class="terminal-form" @submit.prevent="submitCommand">
                    <label for="rootkit-command" class="terminal-prompt">{{ prompt }}</label
                    ><input
                      id="rootkit-command"
                      :ref="captureTerminalInput"
                      v-model="command"
                      :type="state.awaitingPassword ? 'password' : 'text'"
                      :aria-label="state.awaitingPassword ? 'SSH password' : 'Terminal command'"
                      name="rootkit-command"
                      autocomplete="off"
                      autocapitalize="off"
                      :spellcheck="false"
                      maxlength="256"
                      :disabled="!missionActive"
                      @keydown="terminalKey"
                      @input="completions = []"
                    /><button type="submit" aria-label="Run command" :disabled="!missionActive">
                      ↵
                    </button>
                  </form>
                  <p v-if="completions.length > 1" class="terminal-completions">
                    {{ completions.join('  ') }}
                  </p>
                </div>
              </template>

              <template v-else-if="win.id === 'notes'">
                <div class="notes-heading">
                  <span>Professor’s scratchpad</span><small>Drag a note, keep a thought.</small>
                </div>
                <div class="notes-canvas">
                  <article
                    v-for="(note, index) in ['binary', 'clock']"
                    :key="note"
                    class="sticky-note"
                    :class="`note-${note}`"
                    :style="{
                      transform: `translate(${notePositions[index].x}px, ${notePositions[index].y}px)`,
                    }"
                  >
                    <button
                      type="button"
                      class="note-grip"
                      :aria-label="`Move ${note} hint note`"
                      title="Drag, or use arrow keys when focused"
                      @pointerdown="startNoteDrag(index, $event)"
                      @pointermove="dragNote"
                      @pointerup="noteDrag = null"
                      @pointercancel="noteDrag = null"
                      @lostpointercapture="noteDrag = null"
                      @keydown="moveNote(index, $event)"
                    >
                      <span aria-hidden="true">⠿</span
                      >{{ index === 0 ? 'A shift in perspective' : 'A familiar error' }}
                    </button>
                    <div v-if="index === 0">
                      <code>00000011</code>
                      <p>
                        Read me as a binary integer.<br />Caesar moved this many places to the
                        right. You need to move back.
                      </p>
                      <small>cipher.txt is waiting.</small>
                    </div>
                    <div v-else>
                      <p>When the page cannot be found,<br />the clock knows where to look.</p>
                      <code>HTTP / 404</code><small>Try the system monitor.</small>
                    </div>
                  </article>
                </div>
              </template>

              <template v-else-if="win.id === 'sniffer'">
                <div class="app-toolbar">
                  <span class="capture-dot"></span> Packet capture
                  <span class="app-badge">LIVE</span>
                </div>
                <p class="app-intro">
                  A service is hiding in the traffic. Inspect the packet that doesn’t belong.
                </p>
                <div class="packet-labels"><span>Protocol</span><span>Payload / hex</span></div>
                <TransitionGroup tag="div" name="packet" class="packet-stream"
                  ><div v-for="packet in packets" :key="packet.id" class="packet-row">
                    <span>{{ packet.type }}</span
                    ><code>{{ packet.bytes }}</code>
                  </div></TransitionGroup
                ><button
                  type="button"
                  class="anomaly-packet"
                  aria-label="Inspect anomalous packet"
                  @click="capturePacket"
                >
                  <span>!</span>
                  <div>
                    <strong>Unrecognised destination</strong><code>45 00 0F C8 · coffee.local</code>
                  </div>
                  <span aria-hidden="true">↗</span>
                </button>
                <div v-if="state.portFound" class="packet-detail" role="status">
                  <span>Maintenance route captured</span
                  ><strong>coffee.local : {{ state.packetPort }}</strong>
                  <p>Use this port with <code>ssh -p</code>.</p>
                </div>
                <div v-else class="app-footnote">The anomaly is pinned for inspection.</div>
              </template>

              <template v-else-if="win.id === 'monitor'">
                <div class="app-toolbar">
                  <span class="capture-dot"></span> System telemetry
                  <span class="app-badge">SIM</span>
                </div>
                <div class="telemetry">
                  <div>
                    <span>CPU load</span><strong>{{ metrics.cpu }}<small>%</small></strong
                    ><svg
                      viewBox="0 0 240 52"
                      role="img"
                      :aria-label="`CPU load ${metrics.cpu} percent`"
                    >
                      <path d="M0 13H240M0 26H240M0 39H240" class="graph-grid" />
                      <polyline :points="graphPoints(metrics.cpuHistory)" />
                    </svg>
                  </div>
                  <div class="ram-chart">
                    <span>RAM usage</span><strong>{{ metrics.ram }}<small>%</small></strong
                    ><svg
                      viewBox="0 0 240 52"
                      role="img"
                      :aria-label="`RAM usage ${metrics.ram} percent`"
                    >
                      <path d="M0 13H240M0 26H240M0 39H240" class="graph-grid" />
                      <polyline :points="graphPoints(metrics.ramHistory)" />
                    </svg>
                  </div>
                </div>
                <div class="frequency-control">
                  <div>
                    <label for="rootkit-frequency">Core frequency</label
                    ><span
                      ><input
                        id="rootkit-frequency"
                        type="number"
                        min="200"
                        max="600"
                        step="1"
                        :value="frequencyDraft"
                        name="rootkit-frequency"
                        autocomplete="off"
                        inputmode="numeric"
                        aria-label="Core frequency MHz"
                        @input="changeFrequency($event.target.value, true)"
                        @blur="frequencyDraft = String(state.frequency)"
                      />MHz</span
                    >
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="600"
                    step="1"
                    :value="state.frequency"
                    aria-label="Overclock frequency"
                    @input="changeFrequency($event.target.value)"
                  />
                  <div class="range-labels"><span>200 MHz</span><span>600 MHz</span></div>
                </div>
                <div
                  class="monitor-secret"
                  :class="{ revealed: state.passcodeFound }"
                  role="status"
                >
                  <span>{{
                    state.passcodeFound ? 'Maintenance key recovered' : 'Diagnostic channel locked'
                  }}</span
                  ><strong>{{ state.passcodeFound ? state.passcode : '•••• •••' }}</strong>
                  <p>
                    {{
                      state.passcodeFound
                        ? 'Use this password when the SSH tunnel asks.'
                        : 'A particular frequency opens a forgotten channel.'
                    }}
                  </p>
                </div>
              </template>
            </DesktopWindow>
          </TransitionGroup>
        </div>

        <nav class="os-dock" aria-label="RootKit taskbar">
          <span class="dock-start" aria-hidden="true">rk<span>_</span></span>
          <div class="dock-apps">
            <button
              v-for="app in apps"
              :key="app.id"
              :ref="
                (element) => {
                  if (element) dockButtons.set(app.id, element)
                  else dockButtons.delete(app.id)
                }
              "
              type="button"
              :aria-label="`Toggle ${app.title}`"
              :aria-pressed="activeId === app.id && visibleWindows.some((win) => win.id === app.id)"
              :title="app.title"
              @click="dockClick(app.id)"
            >
              <RootkitIcon :name="app.id" /><span
                v-if="windows.find((win) => win.id === app.id)?.open"
                class="dock-indicator"
                aria-hidden="true"
              ></span>
            </button>
          </div>
          <span class="dock-divider" aria-hidden="true"></span
          ><button
            type="button"
            class="dock-volume"
            :disabled="!supported"
            :aria-label="muted ? 'Unmute sound' : 'Mute sound'"
            :aria-pressed="muted"
            @click="toggleMute"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path v-if="!muted" d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" />
              <path v-else d="m16 9 6 6m0-6-6 6" />
            </svg>
          </button>
        </nav>
      </div>

      <Transition name="mission"
        ><div v-if="state.status !== 'playing' && !helpOpen" class="mission-overlay">
          <div class="mission-card">
            <div class="mission-cup"><RootkitIcon name="coffee" /></div>
            <template v-if="state.status === 'ready'"
              ><span class="mission-tag">Incoming request / faculty lounge</span>
              <h3>The professor’s coffee<br />is behind a firewall.</h3>
              <p>
                A mischievous lock. Four curious apps. Take your time getting the espresso flowing.
              </p>
              <ul>
                <li>Find the encrypted access phrase.</li>
                <li>Follow the packets and open a tunnel.</li>
                <li>Run <code>sudo brew --espresso</code>.</li>
              </ul>
              <button type="button" class="rk-primary" @click="bootMission">
                Boot RootKit OS <span aria-hidden="true">→</span></button
              ><small
                >Elapsed time starts when you boot. Your fastest finish is kept as your best.</small
              ></template
            ><template v-else
              ><span class="mission-tag">Caffeine protocol complete</span>
              <h3 ref="resultTitle" tabindex="-1">Espresso unlocked.</h3>
              <p>One espresso, recovered in {{ formatClock(state.elapsed) }}. Nicely executed.</p>
              <p data-testid="rootkit-finish-time">
                Finished in {{ formatGameScore('rootkit', state.elapsedMs) }}
              </p>
              <p v-if="highScores.personalBest" data-testid="rootkit-best-time">
                Your best: {{ formatGameScore('rootkit', highScores.personalBest.value) }}
              </p>
              <button type="button" class="rk-primary" @click="restartMission">
                Brew another
                <span aria-hidden="true">↻</span></button
              ><button type="button" class="rk-secondary" @click="$emit('exit')">
                Back to games
              </button></template
            >
          </div>
        </div></Transition
      >
      <RootkitTutorial
        v-if="tutorialOpen"
        :in-mission="state.status === 'playing'"
        @close="closeTutorial"
        @start="startFromTutorial"
        @sound="play"
      />
      <RootkitCommands
        v-if="commandsOpen"
        :in-mission="state.status === 'playing'"
        @close="closeCommands"
      />
    </div>

    <ol class="mission-progress" aria-label="Mission progress" :inert="helpOpen || undefined">
      <li
        v-for="(stage, index) in stages"
        :key="stage.label"
        :class="{ complete: state.stage > index, current: state.stage === index && missionActive }"
      >
        <span>{{ state.stage > index ? '✓' : `0${index + 1}` }}</span>
        <div>
          <strong>{{ stage.label }}</strong
          ><small>{{ stage.detail }}</small>
        </div>
      </li>
    </ol>
    <footer class="rootkit-footer" :inert="helpOpen || undefined">
      <span>Virtual files. Simulated network. Actual problem-solving.</span>
      <details>
        <summary>Need a nudge?</summary>
        <p>
          Start with <code>cat README.txt</code>. Tab completes commands and filenames. The notes,
          sniffer, and monitor each hold a useful clue. Window title bars can be dragged or moved
          with arrow keys when focused.
        </p>
      </details>
    </footer>
  </section>
</template>

<style scoped>
.rootkit-game {
  color: var(--le-text);
}
.rootkit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.rootkit-identity {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.rk-back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  border: 1px solid var(--le-border);
  border-radius: 9px;
  background: var(--le-base);
  color: var(--le-text);
  font-size: 1.3rem;
}
.rk-back:hover {
  background: var(--le-surface);
}
.rootkit-identity h2 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}
.rootkit-identity h2 span {
  font-weight: 400;
  color: var(--le-muted);
}
.rootkit-identity p {
  margin: 0.2rem 0 0;
  color: var(--le-muted);
  font-size: 0.8125rem;
}
.rootkit-version {
  color: var(--le-muted);
  font: 0.6875rem var(--bs-font-monospace);
}
.virtual-monitor {
  --rk-bg: #0f141c;
  --rk-window-bg: #101923ed;
  --rk-border: #324755;
  --rk-text: #d8f1ed;
  --rk-muted: #8eaaa9;
  --rk-accent: #00f5d4;
  --rk-accent2: #ff007f;
  --rk-danger: #ff6487;
  --rk-soft: #00f5d410;
  --rk-blur: blur(12px);
  --rk-close: #ff5f57;
  --rk-minimize: #ffbd2e;
  --rk-maximize: #28c840;
  position: relative;
  isolation: isolate;
  height: 700px;
  overflow: hidden;
  border: 1px solid #38505c;
  border-radius: 14px;
  background: var(--rk-bg);
  color: var(--rk-text);
  font: 0.75rem/1.6 var(--bs-font-monospace);
  box-shadow: 0 14px 40px #0b0e1412;
  color-scheme: dark;
}
.rk-theme-crt {
  --rk-bg: #100c05;
  --rk-window-bg: #151005fa;
  --rk-border: #755119;
  --rk-text: #ffbe45;
  --rk-muted: #c39340;
  --rk-accent: #ffb000;
  --rk-accent2: #ffcc62;
  --rk-danger: #ffb000;
  --rk-soft: #ffb00010;
  --rk-blur: none;
  --rk-close: #ffb000;
  --rk-minimize: #ffb000;
  --rk-maximize: #ffb000;
  border-color: #8b601d;
  text-shadow: 0 0 8px #ffb00020;
}
.virtual-monitor::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 9000;
  border-radius: inherit;
  pointer-events: none;
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 2px,
      #00000012 2px,
      #00000012 3px
    ),
    radial-gradient(ellipse at center, transparent 45%, #00000037);
  opacity: 0.65;
}
.rk-theme-crt::after {
  opacity: 0.9;
}
.virtual-monitor button,
.virtual-monitor input {
  font: inherit;
}
.virtual-monitor button {
  touch-action: manipulation;
}
.virtual-monitor button:focus-visible,
.virtual-monitor input:focus-visible,
.virtual-monitor [tabindex]:focus-visible {
  outline: 2px solid var(--rk-accent);
  outline-offset: 3px;
}
.virtual-monitor button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.monitor-menubar {
  position: absolute;
  inset: 0 0 auto;
  height: 44px;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1rem;
  border-bottom: 1px solid var(--rk-border);
  background: var(--rk-window-bg);
  backdrop-filter: var(--rk-blur);
}
.os-brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.os-brand > svg {
  width: 18px;
  height: 18px;
  color: var(--rk-accent);
}
.os-brand strong {
  font-weight: 600;
}
.os-brand > span {
  margin-left: 0.7rem;
  color: var(--rk-muted);
  font-size: 0.625rem;
}
.menubar-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.tutorial-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 8px;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
  background: var(--rk-soft);
  color: var(--rk-accent);
  font-size: 11px !important;
  white-space: nowrap;
}
.tutorial-trigger > span {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-size: 10px;
}
.tutorial-trigger:hover {
  border-color: var(--rk-accent);
}
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 34px;
  padding: 0.25rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--rk-muted);
  font-size: 0.625rem !important;
}
.theme-toggle:hover {
  border-color: var(--rk-border);
  background: var(--rk-soft);
  color: var(--rk-accent);
}
.theme-toggle > span {
  font-size: 1rem;
}
.mission-clock {
  min-width: 4.5rem;
  padding: 0.15rem 0.6rem;
  border-left: 1px solid var(--rk-border);
  color: var(--rk-accent);
  font-size: 0.9375rem;
  font-variant-numeric: tabular-nums;
}
.desktop-content {
  position: absolute;
  inset: 44px 0 0;
}
.desktop-wallpaper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 80% 20%, var(--rk-soft), transparent 60%),
    linear-gradient(135deg, transparent 0 70%, var(--rk-soft) 70% 70.1%, transparent 70.1%);
}
.wallpaper-code {
  position: absolute;
  right: 7%;
  bottom: 19%;
  color: var(--rk-accent);
  opacity: 0.055;
  font: 700 clamp(8rem, 20vw, 16rem)/1 var(--bs-font-monospace);
  letter-spacing: -0.09em;
}
.desktop-wallpaper > p {
  position: absolute;
  right: 8%;
  bottom: 16%;
  margin: 0;
  color: var(--rk-muted);
  opacity: 0.4;
  font-size: 0.6875rem;
}
.desktop-wallpaper > svg {
  position: absolute;
  right: 11%;
  top: 15%;
  width: 90px;
  height: 90px;
  color: var(--rk-accent);
  opacity: 0.06;
}
.wallpaper-circuit {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--rk-border) 0.7px, transparent 0.7px);
  background-size: 24px 24px;
  opacity: 0.3;
}
.desktop-shortcuts {
  position: absolute;
  top: 20px;
  left: 12px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.desktop-shortcuts button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 75px;
  min-height: 72px;
  padding: 0.3rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--rk-muted);
  font-size: 0.625rem;
}
.desktop-shortcuts button:hover {
  border-color: var(--rk-border);
  background: var(--rk-soft);
  color: var(--rk-text);
}
.shortcut-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--rk-border);
  border-radius: 9px;
  background: var(--rk-window-bg);
  color: var(--rk-accent);
}
.shortcut-icon > svg {
  width: 24px;
  height: 24px;
}
.icon-notes,
.icon-monitor {
  color: var(--rk-accent2);
}
.window-area {
  position: absolute;
  inset: 0 0 64px;
  pointer-events: none;
}
.window-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.terminal-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #04090d5c;
}
.terminal-session {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: none;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid var(--rk-border);
  color: var(--rk-muted);
  font-size: 0.5625rem;
}
.terminal-session > span:first-child {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--rk-muted);
}
.terminal-session > span.connected {
  background: var(--rk-accent);
  box-shadow: 0 0 8px var(--rk-soft);
}
.terminal-hint {
  margin-left: auto;
  font-size: 0.5rem;
}
.terminal-output {
  flex: 1;
  min-height: 100px;
  overflow: auto;
  padding: 0.9rem 0.9rem 0.4rem;
  scrollbar-width: thin;
  scrollbar-color: var(--rk-border) transparent;
}
.terminal-line {
  margin: 0 0 0.42rem;
  padding: 0;
  overflow: visible;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--rk-text);
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.7;
}
.line-input {
  color: var(--rk-accent);
}
.line-error {
  color: var(--rk-danger);
}
.line-success {
  color: var(--rk-accent);
  font-weight: 600;
}
.line-system {
  color: var(--rk-muted);
}
.terminal-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: none;
  min-height: 44px;
  margin: 0.2rem 0.8rem 0.65rem;
  padding: 0.35rem 0;
  border-top: 1px solid var(--rk-border);
}
.terminal-prompt {
  flex: none;
  max-width: 55%;
  margin: 0;
  color: var(--rk-accent);
  font-size: 0.625rem;
  overflow-wrap: anywhere;
}
.terminal-form input {
  width: 100%;
  min-width: 0;
  padding: 0.25rem 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--rk-text);
  caret-color: var(--rk-accent);
  font-size: 0.75rem;
}
.terminal-form button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
  background: var(--rk-soft);
  color: var(--rk-accent);
  font-size: 1rem;
}
.terminal-form button:hover {
  border-color: var(--rk-accent);
}
.terminal-completions {
  margin: -0.4rem 0.9rem 0.7rem;
  color: var(--rk-muted);
  font-size: 0.5625rem;
}
.is-glitching .terminal-screen {
  animation: terminal-glitch 0.3s steps(2, end);
}
.notes-heading {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.8rem 0.9rem 0;
  color: var(--rk-text);
  font-size: 0.6875rem;
}
.notes-heading small {
  color: var(--rk-muted);
  font-size: 0.5625rem;
}
.notes-canvas {
  position: relative;
  min-height: 430px;
  margin: 0.5rem 0.65rem 0.8rem;
}
.sticky-note {
  position: absolute;
  top: 0;
  left: 0;
  width: min(220px, calc(100% - 8px));
  padding: 0 1rem 0.75rem;
  border: 1px solid var(--rk-border);
  border-radius: 2px;
  background: color-mix(in srgb, var(--rk-accent) 8%, var(--rk-bg));
  box-shadow: 3px 5px 0 #0002;
  color: var(--rk-text);
}
.note-clock {
  background: color-mix(in srgb, var(--rk-accent2) 8%, var(--rk-bg));
  transform: rotate(-2deg);
}
.note-grip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: calc(100% + 2rem);
  min-height: 30px;
  margin: 0 -1rem 0.6rem;
  padding: 0.3rem 0.6rem;
  border: 0;
  border-bottom: 1px solid var(--rk-border);
  background: transparent;
  color: var(--rk-accent);
  text-align: left;
  font-size: 0.5625rem !important;
  touch-action: none !important;
  user-select: none;
  cursor: grab;
}
.note-grip:active {
  cursor: grabbing;
}
.note-grip > span {
  font-size: 1rem;
  color: var(--rk-muted);
}
.sticky-note code {
  display: block;
  margin: 0.4rem 0;
  color: var(--rk-accent);
  font-size: 1.05rem;
  letter-spacing: 0.04em;
}
.sticky-note p {
  margin: 0.3rem 0 0.6rem;
  font-size: 0.75rem;
  line-height: 1.65;
}
.sticky-note small {
  color: var(--rk-muted);
  font-size: 0.625rem;
}
.app-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid var(--rk-border);
  font-size: 0.625rem;
}
.capture-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rk-accent);
}
.app-badge {
  margin-left: auto;
  padding: 0 0.35rem;
  border: 1px solid var(--rk-border);
  border-radius: 3px;
  color: var(--rk-muted);
  font-size: 0.5rem;
}
.app-intro {
  margin: 0.85rem 0.9rem;
  color: var(--rk-muted);
  font-size: 0.75rem;
  line-height: 1.65;
}
.packet-labels,
.packet-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.4rem 0.9rem;
  font-size: 0.5rem;
}
.packet-labels {
  color: var(--rk-muted);
  border-top: 1px solid var(--rk-border);
  border-bottom: 1px solid var(--rk-border);
}
.packet-stream {
  overflow: hidden;
  height: 151px;
  padding-top: 0.2rem;
}
.packet-row {
  color: var(--rk-muted);
  min-height: 24px;
}
.packet-row > span {
  color: var(--rk-accent);
  opacity: 0.7;
}
.packet-row code {
  color: inherit;
  font: inherit;
  white-space: nowrap;
}
.packet-enter-active,
.packet-leave-active {
  transition:
    transform 0.25s,
    opacity 0.25s;
}
.packet-enter-from {
  transform: translateY(16px);
  opacity: 0;
}
.packet-leave-to {
  transform: translateY(-16px);
  opacity: 0;
}
.packet-leave-active {
  position: absolute;
}
.anomaly-packet {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: calc(100% - 1.6rem);
  min-height: 64px;
  margin: 0.7rem 0.8rem;
  padding: 0.6rem;
  border: 1px solid var(--rk-danger);
  border-radius: 5px;
  background: color-mix(in srgb, var(--rk-danger) 8%, transparent);
  color: var(--rk-danger);
  text-align: left;
}
.anomaly-packet:hover {
  background: color-mix(in srgb, var(--rk-danger) 15%, transparent);
}
.anomaly-packet > span:first-child {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-weight: 700;
}
.anomaly-packet > span:last-child {
  margin-left: auto;
  font-size: 1rem;
}
.anomaly-packet strong {
  display: block;
  font-size: 0.5625rem;
  font-weight: 500;
}
.anomaly-packet code {
  display: block;
  color: var(--rk-text);
  font-size: 0.5rem;
}
.packet-detail {
  margin: 0.7rem 0.8rem;
  padding: 0.7rem;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
  background: var(--rk-soft);
  font-size: 0.5625rem;
}
.packet-detail > span {
  display: block;
  color: var(--rk-muted);
}
.packet-detail strong {
  display: block;
  margin: 0.3rem 0;
  color: var(--rk-accent);
  font-size: 0.8125rem;
}
.packet-detail p {
  margin: 0;
  color: var(--rk-muted);
}
.packet-detail code {
  color: var(--rk-accent);
}
.app-footnote {
  padding: 0.2rem 0.9rem 0.8rem;
  color: var(--rk-muted);
  font-size: 0.5rem;
}
.telemetry {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
  padding: 0.8rem;
}
.telemetry > div {
  min-width: 0;
}
.telemetry span {
  display: block;
  color: var(--rk-muted);
  font-size: 0.5625rem;
}
.telemetry strong {
  display: block;
  color: var(--rk-accent);
  font-size: 1.4rem;
  line-height: 1.4;
  font-weight: 500;
}
.telemetry strong small {
  margin-left: 0.2rem;
  font-size: 0.6875rem;
}
.telemetry svg {
  width: 100%;
  height: 48px;
  margin-top: 0.5rem;
  overflow: visible;
}
.telemetry polyline {
  fill: none;
  stroke: var(--rk-accent);
  stroke-width: 2;
}
.telemetry .graph-grid {
  fill: none;
  stroke: var(--rk-border);
  stroke-width: 1;
  opacity: 0.45;
}
.ram-chart strong {
  color: var(--rk-accent2);
}
.ram-chart polyline {
  stroke: var(--rk-accent2);
}
.frequency-control {
  padding: 0.8rem;
  border-top: 1px solid var(--rk-border);
}
.frequency-control > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.frequency-control label {
  margin: 0;
  color: var(--rk-muted);
  font-size: 0.625rem;
}
.frequency-control > div > span {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--rk-muted);
  font-size: 0.5625rem;
}
.frequency-control input[type='number'] {
  width: 58px;
  min-height: 32px;
  padding: 0.2rem 0.3rem;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
  background: var(--rk-bg);
  color: var(--rk-accent);
  text-align: center;
  font-size: 0.8125rem;
}
.frequency-control input[type='range'] {
  width: 100%;
  height: 24px;
  margin: 0.8rem 0 0.1rem;
  accent-color: var(--rk-accent);
  cursor: pointer;
}
.range-labels {
  display: flex;
  justify-content: space-between;
}
.range-labels > span {
  color: var(--rk-muted);
  font-size: 0.5rem;
}
.monitor-secret {
  margin: 0.2rem 0.8rem 0.8rem;
  padding: 0.8rem;
  border: 1px dashed var(--rk-border);
  border-radius: 4px;
  background: var(--rk-soft);
}
.monitor-secret > span {
  display: block;
  color: var(--rk-muted);
  font-size: 0.5625rem;
}
.monitor-secret strong {
  display: block;
  margin: 0.35rem 0;
  color: var(--rk-muted);
  font-size: 1.1rem;
  letter-spacing: 0.12em;
}
.monitor-secret p {
  margin: 0;
  color: var(--rk-muted);
  font-size: 0.6875rem;
}
.monitor-secret.revealed {
  border-style: solid;
  border-color: var(--rk-accent);
}
.monitor-secret.revealed strong {
  color: var(--rk-accent);
  letter-spacing: 0.06em;
}
.os-dock {
  position: absolute;
  inset: auto 0 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 64px;
  padding: 0.5rem 0.9rem;
  border-top: 1px solid var(--rk-border);
  background: var(--rk-window-bg);
  backdrop-filter: var(--rk-blur);
}
.dock-start {
  margin-right: 0.75rem;
  color: var(--rk-text);
  font-size: 1rem;
  letter-spacing: -0.08em;
}
.dock-start > span {
  color: var(--rk-accent);
}
.dock-apps {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.os-dock button {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--rk-muted);
}
.os-dock button > svg {
  width: 23px;
  height: 23px;
}
.os-dock button:hover {
  border-color: var(--rk-border);
  background: var(--rk-soft);
  color: var(--rk-accent);
}
.os-dock button[aria-pressed='true'] {
  background: var(--rk-soft);
  color: var(--rk-accent);
  border-color: var(--rk-border);
}
.dock-indicator {
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  transform: translateX(-50%);
}
.dock-divider {
  height: 22px;
  width: 1px;
  background: var(--rk-border);
  margin: 0 0.15rem;
}
.mission-overlay {
  position: absolute;
  inset: 44px 0 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: color-mix(in srgb, var(--rk-bg) 85%, transparent);
  backdrop-filter: blur(9px);
}
.mission-card {
  width: min(100%, 440px);
  padding: 1.5rem 2rem;
  border: 1px solid var(--rk-border);
  border-radius: 10px;
  background: var(--rk-window-bg);
  box-shadow: 0 20px 60px #0004;
  text-align: center;
}
.mission-cup {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin: 0 auto 1.1rem;
  border: 1px solid var(--rk-border);
  border-radius: 12px;
  background: var(--rk-soft);
  color: var(--rk-accent);
}
.mission-cup > svg {
  width: 32px;
  height: 32px;
}
.mission-tag {
  display: block;
  margin-bottom: 0.7rem;
  color: var(--rk-muted);
  font-size: 0.5625rem;
}
.mission-card h3 {
  margin: 0 0 0.8rem;
  color: var(--rk-text);
  font: 600 1.75rem/1.2 var(--bs-body-font-family);
  letter-spacing: -0.035em;
}
.mission-card > p {
  margin: 0 0 1rem;
  color: var(--rk-muted);
  font-size: 0.6875rem;
  line-height: 1.8;
}
.mission-card ul {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1.2rem 0 1.5rem;
  padding: 0;
  list-style: none;
  color: var(--rk-text);
  text-align: left;
  font-size: 0.625rem;
}
.mission-card li {
  position: relative;
  padding-left: 1rem;
}
.mission-card li::before {
  content: '>';
  position: absolute;
  left: 0;
  color: var(--rk-accent);
}
.mission-card code {
  color: var(--rk-accent);
  font-size: inherit;
}
.rk-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  width: 100%;
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 1px solid var(--rk-accent);
  border-radius: 5px;
  background: var(--rk-accent);
  color: var(--rk-bg);
  font-weight: 700 !important;
  font-size: 0.75rem !important;
}
.rk-primary:hover {
  filter: brightness(1.15);
}
.mission-card > small {
  display: block;
  margin-top: 0.7rem;
  color: var(--rk-muted);
  font-size: 0.5rem;
}
.rk-secondary {
  min-height: 40px;
  margin-top: 0.5rem;
  padding: 0.4rem 0.8rem;
  border: 0;
  background: transparent;
  color: var(--rk-muted);
  font-size: 0.625rem !important;
}
.rk-secondary:hover {
  color: var(--rk-accent);
}
.mission-enter-active,
.mission-leave-active {
  transition: opacity 0.2s;
}
.mission-enter-from,
.mission-leave-to {
  opacity: 0;
}
.mission-progress {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
}
.mission-progress li {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}
.mission-progress li > span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: 1px solid var(--le-border);
  border-radius: 50%;
  color: var(--le-muted);
  font: 0.625rem var(--bs-font-monospace);
}
.mission-progress strong {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
}
.mission-progress small {
  display: block;
  color: var(--le-muted);
  font-size: 0.6875rem;
}
.mission-progress li.complete > span {
  background: #e0f2f1;
  border-color: #70b8aa;
  color: #007361;
}
.mission-progress li.current > span {
  border-color: var(--le-action);
  color: var(--le-action);
}
.rootkit-footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.4rem;
  color: var(--le-muted);
  font-size: 0.6875rem;
}
.rootkit-footer details {
  max-width: 48ch;
  text-align: right;
}
.rootkit-footer summary {
  cursor: pointer;
  color: var(--le-action);
}
.rootkit-footer details p {
  margin: 0.6rem 0 0;
  line-height: 1.7;
}
.rootkit-footer code {
  color: var(--le-action);
  font-size: inherit;
}
@keyframes terminal-glitch {
  0%,
  100% {
    text-shadow: none;
    transform: translateX(0);
  }
  20%,
  60% {
    text-shadow:
      -2px 0 #ff0055,
      2px 0 #00f0ff;
    transform: translateX(1px);
  }
  40%,
  80% {
    text-shadow:
      2px 0 #ff0055,
      -2px 0 #00f0ff;
    transform: translateX(-1px);
  }
}
@media (max-width: 767px) {
  .theme-toggle {
    font-size: 0 !important;
    gap: 0;
  }
  .tutorial-trigger {
    padding: 4px 6px;
    font-size: 10px !important;
  }
  .tutorial-trigger > span {
    display: none;
  }
  .rootkit-version {
    display: none;
  }
  .virtual-monitor {
    height: 780px;
  }
  .monitor-menubar {
    padding: 0 0.6rem;
    gap: 0.4rem;
  }
  .os-brand > span {
    display: none;
  }
  .menubar-right {
    gap: 0.35rem;
  }
  .theme-toggle {
    font-size: 0 !important;
    padding: 0.2rem 0.3rem;
  }
  .mission-clock {
    min-width: 3.7rem;
    padding: 0.15rem 0.4rem;
    font-size: 0.8125rem;
  }
  .desktop-shortcuts {
    left: 6px;
    top: 12px;
    gap: 0.6rem;
  }
  .desktop-shortcuts button {
    width: 60px;
    font-size: 0.5rem;
  }
  .shortcut-icon {
    width: 35px;
    height: 35px;
  }
  .shortcut-icon > svg {
    width: 21px;
    height: 21px;
  }
  .terminal-hint {
    display: none;
  }
  .mission-card {
    padding: 1.25rem;
  }
  .mission-overlay {
    padding: 0.8rem;
  }
  .mission-card h3 {
    font-size: 1.5rem;
  }
  .mission-progress {
    gap: 0.5rem;
  }
  .mission-progress strong {
    font-size: 0.6875rem;
  }
  .mission-progress small {
    font-size: 0.5625rem;
  }
  .mission-progress li {
    align-items: flex-start;
    gap: 0.4rem;
  }
  .mission-progress li > span {
    width: 24px;
    height: 24px;
    font-size: 0.5rem;
  }
  .rootkit-footer {
    flex-direction: column;
    gap: 0.7rem;
  }
  .rootkit-footer details {
    text-align: left;
  }
  .dock-start {
    display: none;
  }
  .os-dock {
    gap: 0.4rem;
    padding: 0.5rem 0.4rem;
  }
  .dock-apps {
    gap: 0.2rem;
  }
  .dock-divider {
    margin: 0;
  }
  .rootkit-identity p {
    font-size: 0.75rem;
  }
}
@media (max-width: 400px) {
  .os-brand strong {
    display: none;
  }
  .rootkit-header {
    margin-bottom: 1rem;
  }
  .rootkit-identity h2 {
    font-size: 1.4rem;
  }
  .rootkit-identity p {
    font-size: 0.625rem;
  }
  .os-brand {
    gap: 0.3rem;
  }
  .os-brand > svg {
    width: 15px;
    height: 15px;
  }
  .os-brand strong {
    font-size: 0.625rem;
  }
  .theme-toggle {
    gap: 0.2rem;
    font-size: 0 !important;
  }
  .theme-toggle > span {
    font-size: 0.8125rem;
  }
  .mission-clock {
    min-width: 3.1rem;
    font-size: 0.75rem;
    padding: 0.15rem 0.3rem;
  }
  .monitor-menubar {
    gap: 0.2rem;
  }
  .terminal-prompt {
    max-width: 48%;
    font-size: 0.5rem;
  }
  .terminal-form {
    margin: 0.2rem 0.6rem 0.5rem;
  }
  .terminal-line {
    font-size: 0.75rem;
  }
  .mission-card ul {
    font-size: 0.5625rem;
  }
  .mission-card h3 {
    font-size: 1.35rem;
  }
  .mission-card > p {
    font-size: 0.625rem;
  }
  .mission-progress small {
    display: none;
  }
  .mission-progress strong {
    font-size: 0.625rem;
  }
  .mission-progress li > span {
    width: 21px;
    height: 21px;
  }
  .mission-progress {
    gap: 0.4rem;
  }
  .frequency-control label {
    font-size: 0.5625rem;
  }
  .packet-row,
  .packet-labels {
    gap: 0.2rem;
    padding: 0.4rem 0.6rem;
    font-size: 0.4375rem;
  }
}
</style>
