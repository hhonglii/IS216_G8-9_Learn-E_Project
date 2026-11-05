<script setup>
// Optional game; guide: docs/games.md.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  cellsFor,
  useTetrisGame,
  WIDTH,
  HEIGHT,
  POINTS_PER_LEVEL,
  gravityForLevel,
} from './useTetrisGame.js'
import { useTetrisAudio } from './useTetrisAudio.js'
import TetrominoPreview from './TetrominoPreview.vue'
import { useGameHighScores } from '../useGameHighScores.js'

defineEmits(['exit'])
const {
  state,
  ghost,
  start,
  restart,
  move,
  rotate,
  softDrop,
  hardDrop,
  hold,
  tick,
  pause,
  resume,
} = useTetrisGame()
const { state: highScores, beginRun, queueScore, flushScore } = useGameHighScores('tetris')
const displayedBest = computed(() =>
  highScores.userId ? (highScores.personalBest?.value ?? null) : state.value.best,
)
const {
  muted,
  supported,
  toggleMute,
  play,
  stop,
  musicMuted,
  musicPlaying,
  bpm,
  toggleMusic,
  setPlaying: setAudioPlaying,
  setLevel: setAudioLevel,
} = useTetrisAudio()
const gameRoot = ref(null)
const boardElement = ref(null)
const resultHeading = ref(null)
const resumeButton = ref(null)
const restartDialog = ref(null)
const keepButton = ref(null)
const restartPending = ref(false)
const pauseReason = ref('Take a breath. The stack can wait.')
const announcement = ref('')
const colors = {
  I: '#00f0ff',
  J: '#759cff',
  L: '#ffad59',
  O: '#ffe06b',
  S: '#00f5b8',
  T: '#c273ff',
  Z: '#ff6589',
}
const playing = computed(() => state.value.status === 'playing' && !restartPending.value)
const scoreProgress = computed(() => state.value.score % POINTS_PER_LEVEL)
const fallInterval = computed(() => gravityForLevel(state.value.level))
const musicStatus = computed(() =>
  !supported.value
    ? 'Audio unavailable'
    : musicMuted.value
      ? 'Music off'
      : musicPlaying.value
        ? 'Music playing'
        : state.value.status === 'ready' || playing.value
          ? 'Music ready'
          : 'Music paused',
)
const cells = computed(() => {
  const activeCells = new Set(
    state.value.active ? cellsFor(state.value.active).map((cell) => `${cell.x},${cell.y}`) : [],
  )
  const ghostCells = new Set(
    ghost.value ? cellsFor(ghost.value).map((cell) => `${cell.x},${cell.y}`) : [],
  )
  return Array.from({ length: WIDTH * HEIGHT }, (_, index) => {
    const row = Math.floor(index / WIDTH),
      col = index % WIDTH,
      key = `${col},${row}`
    const settled = state.value.board[row][col]
    const kind = activeCells.has(key)
      ? 'active'
      : settled
        ? 'settled'
        : ghostCells.has(key)
          ? 'ghost'
          : 'empty'
    const type = kind === 'active' || kind === 'ghost' ? state.value.active?.type : settled
    return { row, col, kind, type, color: colors[type] }
  })
})
const controlKeys = [
  ['← / A', 'Move left'],
  ['→ / D', 'Move right'],
  ['↓ / S', 'Soft drop'],
  ['↑ / W / X', 'Rotate clockwise'],
  ['Z', 'Rotate counterclockwise'],
  ['Space', 'Hard drop'],
  ['C', 'Hold piece'],
  ['P / Esc', 'Pause / resume'],
]
let frameId = 0
let lastFrame = null
let repeated = null
let resumeAfterRestart = false
let restartReturnFocus = null
let focusCheckFrame = 0
let focusResumeOnPause = false

async function focusBoard() {
  await nextTick()
  boardElement.value?.focus({ preventScroll: true })
  if (window.matchMedia('(max-width: 767px)').matches) {
    gameRoot.value
      ?.querySelector('.tetris-console')
      ?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
}
function playEvent(override) {
  const name = ['clear', 'over'].includes(state.value.lastEvent)
    ? state.value.lastEvent
    : override || state.value.lastEvent
  play(name)
  if (state.value.lastEvent === 'clear')
    announcement.value = `${state.value.lastClear} ${state.value.lastClear === 1 ? 'line' : 'lines'} cleared. Score ${state.value.score}. Level ${state.value.level}.`
}
function perform(action, argument, sound) {
  if (!playing.value) return false
  const changed = argument === undefined ? action() : action(argument)
  if (changed) playEvent(sound)
  return changed
}
function releaseControl() {
  repeated = null
}
function runControl(direction) {
  if (direction === 'left') return perform(move, -1)
  if (direction === 'right') return perform(move, 1)
  return perform(softDrop, undefined, 'move')
}
function beginControl(direction, event) {
  if (event.button !== 0 || !playing.value) return
  event.preventDefault()
  event.currentTarget.setPointerCapture?.(event.pointerId)
  runControl(direction)
  repeated = { direction, elapsed: 0, next: direction === 'down' ? 45 : 150, key: null }
}
function clickControl(direction, event) {
  // Pointer presses already moved on pointerdown. Keyboard/assistive clicks
  // have detail=0 and still need their single action here.
  if (event.detail === 0) runControl(direction)
}
function keydown(event) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.closest('input, textarea, select, [contenteditable="true"]') ||
    restartPending.value
  )
    return
  const key = event.key.toLowerCase()
  if (key === 'p' || key === 'escape') {
    event.preventDefault()
    if (!event.repeat) togglePause()
    return
  }
  if (!playing.value || (event.target.closest('button') && (key === ' ' || key === 'enter'))) return
  const direction = {
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right',
    arrowdown: 'down',
    s: 'down',
  }[key]
  if (direction) {
    event.preventDefault()
    if (event.repeat) return
    runControl(direction)
    repeated = { direction, elapsed: 0, next: direction === 'down' ? 45 : 150, key }
  } else if (['arrowup', 'w', 'x', 'z', ' ', 'c'].includes(key)) {
    event.preventDefault()
    if (event.repeat) return
    if (key === 'c') perform(hold)
    else if (key === ' ') perform(hardDrop, undefined, 'drop')
    else perform(rotate, key === 'z' ? -1 : 1)
  }
}
function keyup(event) {
  if (repeated?.key === event.key.toLowerCase()) releaseControl()
}
function startGame() {
  if (state.value.status !== 'ready') return
  beginRun()
  announcement.value = ''
  start()
  play('start')
  void focusBoard()
}
function restartGame() {
  beginRun()
  announcement.value = ''
  restartPending.value = false
  restart()
  play('start')
  void focusBoard()
}
function resumeGame() {
  if (resume()) {
    lastFrame = null
    void focusBoard()
  }
}
function holdPiece() {
  if (perform(hold)) void focusBoard()
}
function togglePause() {
  if (restartPending.value) return
  if (state.value.status === 'paused') resumeGame()
  else if (playing.value) {
    focusResumeOnPause = true
    pauseReason.value = 'Take a breath. The stack can wait.'
    pause()
  }
}
function autoPause(reason) {
  if (playing.value) {
    focusResumeOnPause = false
    pauseReason.value = reason
    pause()
  }
}
function visibilityChanged() {
  if (document.hidden) autoPause('You switched tabs. Resume when you’re ready.')
}
function windowBlurred() {
  autoPause('Focus moved away. Resume when you’re ready.')
}
function focusLeftGame(event) {
  cancelAnimationFrame(focusCheckFrame)
  if (event.relatedTarget instanceof Node && gameRoot.value?.contains(event.relatedTarget)) return
  // Native focus can pass through <body> between two internal controls.
  // Wait for the next frame before deciding that the user left the game.
  focusCheckFrame = requestAnimationFrame(() => {
    if (!gameRoot.value?.contains(document.activeElement))
      autoPause('Focus moved away. Resume when you’re ready.')
  })
}
async function requestRestart() {
  if (state.value.status === 'ready' || state.value.status === 'over') {
    restartGame()
    return
  }
  resumeAfterRestart = playing.value
  focusResumeOnPause = false
  restartReturnFocus = document.activeElement
  pause()
  restartPending.value = true
  await nextTick()
  keepButton.value?.focus({ preventScroll: true })
}
async function cancelRestart() {
  restartPending.value = false
  if (resumeAfterRestart) {
    resumeGame()
    return
  }
  await nextTick()
  restartReturnFocus?.focus({ preventScroll: true })
}
function confirmKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    void cancelRestart()
  } else if (event.key === 'Tab') {
    const buttons = restartDialog.value.querySelectorAll('button')
    if (
      (event.shiftKey && document.activeElement === buttons[0]) ||
      (!event.shiftKey && document.activeElement === buttons[1])
    ) {
      event.preventDefault()
      ;(event.shiftKey ? buttons[1] : buttons[0]).focus()
    }
  }
}
function frame(timestamp) {
  // Bound both gravity and held-button repeat after a delayed animation frame.
  const delta = lastFrame === null ? 0 : Math.max(0, Math.min(50, timestamp - lastFrame))
  lastFrame = timestamp
  if (playing.value) {
    const eventId = state.value.eventId
    tick(delta)
    // Gravity descent is silent; only an actual lock/clear/top-out emits a sound.
    if (state.value.eventId !== eventId) playEvent()
    if (repeated) {
      repeated.elapsed += delta
      let count = 0
      while (repeated && repeated.elapsed >= repeated.next && count++ < 4 && playing.value) {
        runControl(repeated.direction)
        repeated.next += repeated.direction === 'down' ? 45 : 50
      }
    }
  }
  frameId = requestAnimationFrame(frame)
}
watch(
  () => state.value.score,
  (score, previous) => {
    if (score > 0 && score > previous) queueScore(score)
  },
  { flush: 'sync' },
)
watch(
  () => state.value.level,
  (level) => setAudioLevel(level),
  { immediate: true, flush: 'sync' },
)
watch(
  () => state.value.status,
  async (status) => {
    releaseControl()
    setAudioPlaying(status === 'playing')
    if (status === 'paused') {
      stop()
      if (focusResumeOnPause) {
        focusResumeOnPause = false
        await nextTick()
        if (state.value.status === 'paused' && !restartPending.value)
          resumeButton.value?.focus({ preventScroll: true })
      }
    }
    if (status === 'over') {
      void flushScore()
      announcement.value = `Game over. Score ${state.value.score}, ${state.value.lines} lines cleared.`
      await nextTick()
      resultHeading.value?.focus({ preventScroll: true })
    }
  },
  // Overlay refs must exist before pause/game-over focus moves to them.
  { flush: 'post' },
)
onMounted(() => {
  frameId = requestAnimationFrame(frame)
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('blur', windowBlurred)
})
onBeforeUnmount(() => {
  void flushScore()
  cancelAnimationFrame(frameId)
  cancelAnimationFrame(focusCheckFrame)
  releaseControl()
  stop()
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('blur', windowBlurred)
})
</script>

<template>
  <section
    ref="gameRoot"
    class="game-tetris"
    aria-labelledby="tetris-title"
    @keydown="keydown"
    @keyup="keyup"
    @focusout="focusLeftGame"
  >
    <header class="tetris-navigation" :inert="restartPending || undefined">
      <button
        type="button"
        class="tetris-back"
        aria-label="Back to game library"
        @click="$emit('exit')"
      >
        <span aria-hidden="true">←</span> All games</button
      ><span class="tetris-library-note">Take a break / Arcade</span>
    </header>
    <div class="tetris-console mobile-layout">
      <div class="console-content" :inert="restartPending || undefined">
        <header class="console-header">
          <div>
            <p class="console-edition">
              <span aria-hidden="true"></span> Neon circuit / falling blocks
            </p>
            <h2 id="tetris-title">Tetris</h2>
            <p class="tetris-intro">Build a stack. Find your rhythm. Make room.</p>
          </div>
          <div class="audio-hud">
            <div class="console-actions">
              <button
                type="button"
                class="console-button"
                :aria-label="muted ? 'Unmute sound' : 'Mute sound'"
                :aria-pressed="muted"
                :disabled="!supported"
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
                  <path v-else d="m16 9 6 6m0-6-6 6" /></svg
                >{{ muted ? 'Sound off' : 'Sound on' }}</button
              ><button
                type="button"
                class="console-button music-toggle"
                :aria-label="musicMuted ? 'Unmute music' : 'Mute music'"
                :aria-pressed="musicMuted"
                :disabled="!supported"
                @click="toggleMusic"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path d="M9 17V5l11-2v12M9 8l11-2" />
                  <ellipse cx="6" cy="18" rx="3" ry="2.5" />
                  <ellipse cx="17" cy="16" rx="3" ry="2.5" />
                  <path v-if="musicMuted" d="m3 3 18 18" /></svg
                >{{ musicMuted ? 'Music off' : 'Music on' }}</button
              ><button
                type="button"
                class="console-button"
                aria-label="Pause game"
                :disabled="!playing"
                @click="togglePause"
              >
                <span aria-hidden="true">Ⅱ</span> Pause</button
              ><button
                type="button"
                class="console-button"
                :disabled="state.status === 'ready'"
                @click="requestRestart"
              >
                New game <span aria-hidden="true">↻</span>
              </button>
            </div>
            <p class="music-status">
              <span role="status" data-testid="tetris-music-status">{{ musicStatus }}</span
              ><span
                ><strong data-testid="tetris-bpm">{{ bpm }}</strong> BPM</span
              >
            </p>
          </div>
        </header>

        <div class="tetris-layout">
          <aside class="tetris-left">
            <section class="held-panel" role="group" aria-label="Held piece">
              <div class="panel-heading">
                <h3>Hold</h3>
                <kbd>C</kbd>
              </div>
              <div class="held-piece">
                <TetrominoPreview
                  v-if="state.held"
                  :type="state.held"
                  :color="colors[state.held]"
                /><span v-else class="hold-empty">Save a piece<br />for later.</span>
              </div>
              <button
                type="button"
                class="hold-button"
                aria-label="Hold piece"
                :disabled="!playing || !state.canHold"
                @click="holdPiece"
              >
                {{ state.canHold ? 'Swap piece' : 'Used this turn'
                }}<span aria-hidden="true">⇄</span>
              </button>
            </section>
            <div class="tetris-scoreboard">
              <div class="score-primary">
                <span>Score</span
                ><strong data-testid="tetris-score">{{ state.score.toLocaleString() }}</strong>
              </div>
              <div>
                <span>{{ highScores.userId ? 'Your best' : 'Browser best' }}</span
                ><strong data-testid="tetris-best">{{
                  displayedBest?.toLocaleString() ?? '—'
                }}</strong>
              </div>
              <div class="score-pair">
                <div>
                  <span>Lines</span><strong data-testid="tetris-lines">{{ state.lines }}</strong>
                </div>
                <div>
                  <span>Level</span><strong data-testid="tetris-level">{{ state.level }}</strong>
                </div>
              </div>
            </div>
            <div class="level-progress">
              <div>
                <span>Next level</span
                ><span data-testid="tetris-level-progress"
                  >{{ scoreProgress }} / {{ POINTS_PER_LEVEL }} pts</span
                >
              </div>
              <div class="level-track">
                <span :style="{ transform: `scaleX(${scoreProgress / POINTS_PER_LEVEL})` }"></span>
              </div>
            </div>
            <div class="stack-note">
              <span aria-hidden="true">⌁</span>
              <p>Full rows disappear.<br />A little space goes a long way.</p>
            </div>
          </aside>

          <div class="tetris-play-column">
            <div class="board-topline">
              <span
                ><i :class="{ running: playing }"></i
                >{{
                  state.status === 'ready'
                    ? 'Ready to connect'
                    : state.status === 'paused'
                      ? 'Core paused'
                      : state.status === 'over'
                        ? 'Core overloaded'
                        : 'Core running'
                }}</span
              ><span
                data-testid="tetris-speed"
                :aria-label="`Fall interval ${fallInterval} milliseconds per cell`"
                title="Time per automatic row drop"
                >{{ fallInterval }} ms</span
              >
            </div>
            <div class="board-shell">
              <div
                ref="boardElement"
                class="tetris-board"
                role="group"
                aria-label="Tetris game board"
                aria-describedby="tetris-board-help"
                tabindex="0"
              >
                <span
                  v-for="cell in cells"
                  :key="`${cell.row}-${cell.col}`"
                  class="tetris-cell"
                  :class="`cell-${cell.kind}`"
                  :data-row="cell.row"
                  :data-col="cell.col"
                  :data-kind="cell.kind"
                  :data-piece="cell.type || undefined"
                  :style="cell.color ? { '--piece-color': cell.color } : undefined"
                  aria-hidden="true"
                ></span>
              </div>
              <!-- A new decoration restarts consecutive clear flashes without remounting the focused board. -->
              <span
                v-if="state.lastEvent === 'clear'"
                :key="state.eventId"
                class="board-clear-flash"
                aria-hidden="true"
              ></span>
              <div v-if="state.status !== 'playing'" class="board-overlay">
                <div v-if="state.status === 'ready'" class="board-message ready-message">
                  <span class="message-icon" aria-hidden="true">▦</span>
                  <h3>Make your next move.</h3>
                  <p>
                    Fill rows to clear them. Keep the stack below the top. The pace rises every 500
                    points.
                  </p>
                  <div class="start-instructions">
                    <span><kbd>←</kbd><kbd>→</kbd> Move</span><span><kbd>↑</kbd> Rotate</span
                    ><span><kbd>Space</kbd> Drop</span>
                  </div>
                  <button type="button" class="tetris-primary" @click="startGame">
                    Start game <span aria-hidden="true">→</span></button
                  ><small>Controls and a ghost landing guide are included.</small>
                </div>
                <div v-else-if="state.status === 'paused'" class="board-message">
                  <span class="message-icon" aria-hidden="true">Ⅱ</span>
                  <h3>Paused</h3>
                  <p>{{ pauseReason }}</p>
                  <button
                    ref="resumeButton"
                    type="button"
                    class="tetris-primary"
                    aria-label="Resume game"
                    @click="resumeGame"
                  >
                    Resume game <span aria-hidden="true">▷</span></button
                  ><small>Press P or Esc to resume.</small>
                </div>
                <div v-else class="board-message">
                  <span class="message-icon danger" aria-hidden="true">⌁</span>
                  <h3 ref="resultHeading" tabindex="-1">Game over</h3>
                  <p>The stack reached the limit.<br />A fresh circuit is one move away.</p>
                  <div class="result-score">
                    <span>Final score</span><strong>{{ state.score.toLocaleString() }}</strong>
                  </div>
                  <button type="button" class="tetris-primary" @click="restartGame">
                    Play again <span aria-hidden="true">↻</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="board-bottomline">
              <span
                >Locked pieces <strong data-testid="tetris-pieces">{{ state.pieces }}</strong></span
              ><span class="ghost-key"><i></i> Landing guide</span>
            </div>
          </div>

          <aside class="tetris-right">
            <section class="next-panel" role="group" aria-label="Next pieces">
              <div class="panel-heading">
                <h3>Up next</h3>
                <span>3 pieces</span>
              </div>
              <ol>
                <li v-for="(type, index) in state.queue.slice(0, 3)" :key="`${index}-${type}`">
                  <span>{{ index + 1 }}</span
                  ><TetrominoPreview :type="type" :color="colors[type]" />
                </li>
                <li v-if="!state.queue.length" class="next-empty">
                  Your queue appears<br />when the game starts.
                </li>
              </ol>
            </section>
            <section class="keyboard-panel" aria-label="Keyboard controls">
              <h3>Controls</h3>
              <dl>
                <div v-for="[keys, action] in controlKeys" :key="action">
                  <dt>
                    <kbd>{{ keys }}</kbd>
                  </dt>
                  <dd>{{ action }}</dd>
                </div>
              </dl>
              <p>Keys work while focus is in the game. Hold a direction to repeat.</p>
            </section>
          </aside>
        </div>

        <div class="tetris-touch-controls" role="group" aria-label="Touch controls">
          <div class="touch-directions">
            <button
              type="button"
              :disabled="!playing"
              aria-label="Rotate counterclockwise"
              @click="perform(rotate, -1)"
            >
              <span aria-hidden="true">↶</span><small>Rotate</small></button
            ><button
              v-for="control in [
                { direction: 'left', icon: '←', label: 'Move left' },
                { direction: 'down', icon: '↓', label: 'Soft drop' },
                { direction: 'right', icon: '→', label: 'Move right' },
              ]"
              :key="control.direction"
              type="button"
              :disabled="!playing"
              :aria-label="control.label"
              @pointerdown="beginControl(control.direction, $event)"
              @pointerup="releaseControl"
              @pointercancel="releaseControl"
              @lostpointercapture="releaseControl"
              @click="clickControl(control.direction, $event)"
            >
              <span aria-hidden="true">{{ control.icon }}</span
              ><small>{{
                control.direction === 'down' ? 'Down' : control.direction
              }}</small></button
            ><button
              type="button"
              :disabled="!playing"
              aria-label="Rotate clockwise"
              @click="perform(rotate, 1)"
            >
              <span aria-hidden="true">↷</span><small>Rotate</small>
            </button>
          </div>
          <button
            type="button"
            class="hard-drop-button"
            :disabled="!playing"
            aria-label="Hard drop"
            @click="perform(hardDrop, undefined, 'drop')"
          >
            <span aria-hidden="true">⇓</span> Hard drop <kbd>Space</kbd>
          </button>
        </div>
        <footer class="console-footer">
          <p id="tetris-board-help">
            Move and rotate the falling piece. Clear full rows to score. Every 500 points increases
            the level and speed.
          </p>
          <span>Auto-pause when you step away.</span>
        </footer>
      </div>
      <div v-if="restartPending" class="restart-overlay">
        <section
          ref="restartDialog"
          class="restart-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-label="Restart game?"
          aria-describedby="restart-description"
          @keydown="confirmKey"
        >
          <span aria-hidden="true">↻</span>
          <h3>Restart game?</h3>
          <p id="restart-description">
            Your current stack and score will reset. Your best score stays saved.
          </p>
          <div>
            <button ref="keepButton" type="button" class="console-button" @click="cancelRestart">
              Keep playing</button
            ><button type="button" class="tetris-primary" @click="restartGame">Restart game</button>
          </div>
        </section>
      </div>
    </div>
    <p class="tetris-live" role="status" aria-live="polite">{{ announcement }}</p>
  </section>
</template>

<style scoped>
.game-tetris {
  padding: 12px 0 32px;
}
.tetris-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}
.tetris-back {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--le-action);
  font-size: 14px;
}
.tetris-back > span {
  font-size: 22px;
}
.tetris-back:hover {
  color: var(--le-action-hover);
}
.tetris-library-note {
  color: var(--le-muted);
  font-size: 12px;
}
.tetris-console {
  scroll-margin-top: 76px;
  --tt-bg: #0b0e14;
  --tt-panel: #131b26;
  --tt-border: #303e50;
  --tt-text: #e1eef4;
  --tt-muted: #94a8b7;
  --tt-accent: #00f0ff;
  --tt-purple: #c273ff;
  --tt-amber: #ffb800;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid var(--tt-border);
  border-radius: 14px;
  background:
    radial-gradient(ellipse at 20% 45%, #00f0ff08, transparent 55%),
    repeating-linear-gradient(0deg, transparent 0 31px, #4460740a 31px 32px),
    repeating-linear-gradient(90deg, transparent 0 31px, #4460740a 31px 32px), var(--tt-bg);
  color: var(--tt-text);
  color-scheme: dark;
}
.console-content {
  padding: 24px 32px;
}
.tetris-console button {
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.tetris-console button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tetris-console button:focus-visible,
.tetris-board:focus-visible {
  outline: 2px solid var(--tt-accent);
  outline-offset: 4px;
}
.tetris-console button {
  -webkit-tap-highlight-color: transparent;
}
.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--tt-border);
  margin-bottom: 26px;
}
.console-edition {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  color: var(--tt-muted);
  font: 10px var(--bs-font-monospace);
}
.console-edition > span {
  width: 5px;
  height: 5px;
  background: var(--tt-accent);
  box-shadow: 0 0 8px #00f0ff66;
}
.console-header h2 {
  margin: 0;
  color: var(--tt-text);
  font: 700 56px/1 var(--bs-body-font-family);
  letter-spacing: -0.055em;
}
.tetris-intro {
  margin: 10px 0 0;
  color: var(--tt-muted);
  font-size: 14px;
}
.console-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.audio-hud {
  min-width: 0;
}
.music-status {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  margin: 9px 0 0;
  color: var(--tt-muted);
  font: 10px/1.5 var(--bs-font-monospace);
}
.music-status > span:first-child {
  color: var(--tt-accent);
}
.music-status strong {
  font-weight: 500;
}
.console-button {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--tt-border);
  border-radius: 5px;
  background: var(--tt-panel);
  color: var(--tt-text);
  font-size: 12px !important;
}
.console-button > svg {
  width: 17px;
  height: 17px;
}
.console-button > span {
  font-size: 16px;
}
.console-button:hover:not(:disabled) {
  border-color: var(--tt-accent);
  color: var(--tt-accent);
}
.tetris-layout {
  display: grid;
  grid-template-columns: minmax(140px, 190px) minmax(0, 300px) minmax(180px, 210px);
  justify-content: center;
  align-items: start;
  gap: 32px;
}
.tetris-left,
.tetris-right {
  min-width: 0;
}
.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--tt-border);
}
.panel-heading h3,
.keyboard-panel h3 {
  margin: 0;
  color: var(--tt-text);
  font-size: 14px;
  font-weight: 600;
}
.panel-heading > span {
  color: var(--tt-muted);
  font: 10px var(--bs-font-monospace);
}
.tetris-console kbd {
  padding: 2px 5px;
  border: 1px solid var(--tt-border);
  border-radius: 3px;
  background: var(--tt-bg);
  color: var(--tt-muted);
  font: 10px var(--bs-font-monospace);
}
.held-piece {
  display: grid;
  place-items: center;
  height: 90px;
}
.hold-empty {
  color: var(--tt-muted);
  text-align: center;
  font: 11px/1.7 var(--bs-font-monospace);
}
.hold-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--tt-border);
  border-radius: 4px;
  background: #00f0ff08;
  color: var(--tt-accent);
  font-size: 11px !important;
}
.hold-button > span {
  font-size: 18px;
}
.hold-button:hover:not(:disabled) {
  border-color: var(--tt-accent);
}
.tetris-scoreboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 32px;
}
.tetris-scoreboard span {
  display: block;
  color: var(--tt-muted);
  font-size: 12px;
}
.tetris-scoreboard strong {
  display: block;
  margin-top: 3px;
  color: var(--tt-text);
  font: 500 25px/1.3 var(--bs-font-monospace);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.tetris-scoreboard .score-primary strong {
  color: var(--tt-accent);
  font-size: 35px;
}
.score-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.level-progress {
  margin-top: 26px;
}
.level-progress > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--tt-muted);
  font: 10px var(--bs-font-monospace);
}
.level-track {
  overflow: hidden;
  height: 3px;
  margin-top: 10px;
  background: var(--tt-border);
}
.level-track > span {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--tt-purple);
  transform-origin: left;
  transition: transform 0.2s;
}
.stack-note {
  margin-top: 36px;
  color: var(--tt-muted);
}
.stack-note > span {
  color: var(--tt-amber);
  font-size: 28px;
}
.stack-note p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
}
.tetris-play-column {
  min-width: 0;
}
.board-topline,
.board-bottomline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: var(--tt-muted);
  font: 9px/1.5 var(--bs-font-monospace);
}
.board-topline {
  margin-bottom: 9px;
}
.board-topline > span:first-child {
  display: flex;
  align-items: center;
  gap: 6px;
}
.board-topline i {
  width: 4px;
  height: 4px;
  background: var(--tt-amber);
}
.board-topline i.running {
  background: var(--tt-accent);
}
.board-shell {
  position: relative;
  padding: 5px;
  border: 1px solid #526078;
  border-radius: 5px;
  background: #161e2b;
  box-shadow:
    0 0 0 3px #0b0e14,
    0 0 0 4px var(--tt-border),
    0 12px 35px #0004;
}
.tetris-board {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  grid-template-rows: repeat(20, minmax(0, 1fr));
  width: 100%;
  aspect-ratio: 1 / 2;
  background: #080d14;
}
.tetris-cell {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid #8ba8d00a;
}
.cell-active,
.cell-settled {
  z-index: 1;
  border: 1px solid color-mix(in srgb, var(--piece-color) 78%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--piece-color) 23%, #0b1220);
  box-shadow: inset -3px -3px 0 #0003;
}
.cell-active {
  background: color-mix(in srgb, var(--piece-color) 36%, #0b1220);
  box-shadow:
    inset -3px -3px 0 #0003,
    0 0 9px color-mix(in srgb, var(--piece-color) 12%, transparent);
}
.cell-active::after,
.cell-settled::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-top: 1px solid color-mix(in srgb, var(--piece-color) 70%, transparent);
  border-left: 1px solid color-mix(in srgb, var(--piece-color) 45%, transparent);
  pointer-events: none;
}
.cell-ghost {
  border: 1px dashed color-mix(in srgb, var(--piece-color) 48%, transparent);
  background: color-mix(in srgb, var(--piece-color) 4%, transparent);
}
.board-clear-flash {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  box-shadow:
    0 0 0 3px #0b0e14,
    0 0 0 4px #00f0ff,
    0 0 30px #00f0ff44;
  animation: clear-flash 0.32s ease-out forwards;
}
.board-bottomline {
  margin-top: 9px;
}
.board-bottomline strong {
  margin-left: 5px;
  color: var(--tt-text);
  font-weight: 500;
}
.ghost-key {
  display: flex;
  align-items: center;
  gap: 5px;
}
.ghost-key i {
  width: 8px;
  height: 8px;
  border: 1px dashed var(--tt-muted);
}
.board-overlay {
  position: absolute;
  inset: 5px;
  z-index: 3;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #0b0e14ed;
  backdrop-filter: blur(4px);
  overflow-y: auto;
}
.board-message {
  width: 100%;
  text-align: center;
}
.message-icon {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 20px;
  border: 1px solid var(--tt-border);
  border-radius: 8px;
  background: #00f0ff08;
  color: var(--tt-accent);
  font-size: 25px;
}
.message-icon.danger {
  color: #ff6589;
}
.board-message h3 {
  margin: 0 0 14px;
  color: var(--tt-text);
  font-size: 29px;
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.15;
  text-wrap: balance;
}
.board-message > p {
  margin: 0 0 20px;
  color: var(--tt-muted);
  font-size: 13px;
  line-height: 1.7;
}
.start-instructions {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 25px 0;
  color: var(--tt-text);
  font-size: 12px;
}
.start-instructions kbd {
  color: var(--tt-text);
  margin-right: 4px;
}
.tetris-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--tt-accent);
  border-radius: 5px;
  background: var(--tt-accent);
  color: var(--tt-bg);
  font-size: 12px !important;
  font-weight: 700 !important;
}
.tetris-primary:hover {
  filter: brightness(1.1);
}
.board-message > small {
  display: block;
  margin-top: 14px;
  color: var(--tt-muted);
  font-size: 10px;
  line-height: 1.6;
}
.result-score {
  padding: 14px 0;
  margin-bottom: 18px;
  border-top: 1px solid var(--tt-border);
  border-bottom: 1px solid var(--tt-border);
}
.result-score > span {
  display: block;
  color: var(--tt-muted);
  font-size: 11px;
}
.result-score strong {
  color: var(--tt-accent);
  font: 24px/1.7 var(--bs-font-monospace);
}
.next-panel ol {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.next-panel li {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 78px;
  padding: 12px 4px;
  border-bottom: 1px solid #303e5070;
}
.next-panel li > span {
  color: var(--tt-muted);
  font: 10px var(--bs-font-monospace);
}
.next-panel .next-empty {
  color: var(--tt-muted);
  font: 11px/1.7 var(--bs-font-monospace);
}
.keyboard-panel {
  margin-top: 30px;
}
.keyboard-panel dl {
  margin: 14px 0 0;
}
.keyboard-panel dl > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid #303e5050;
}
.keyboard-panel dt {
  flex: none;
  font-weight: 400;
}
.keyboard-panel dd {
  margin: 0;
  color: var(--tt-muted);
  text-align: right;
  font-size: 11px;
}
.keyboard-panel > p {
  margin: 16px 0 0;
  color: var(--tt-muted);
  font-size: 11px;
  line-height: 1.7;
}
.tetris-touch-controls {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 12px;
  max-width: 600px;
  margin: 24px auto 0;
}
.touch-directions {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  flex: 1;
}
.touch-directions button {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
  min-width: 44px;
  min-height: 52px;
  padding: 5px;
  border: 1px solid var(--tt-border);
  border-radius: 5px;
  background: var(--tt-panel);
  color: var(--tt-text);
  touch-action: none;
  user-select: none;
}
.touch-directions button > span {
  font-size: 22px;
  line-height: 1.2;
}
.touch-directions small {
  color: var(--tt-muted);
  font-size: 9px;
  text-transform: capitalize;
}
.touch-directions button:hover:not(:disabled),
.touch-directions button:active:not(:disabled) {
  color: var(--tt-accent);
  border-color: var(--tt-accent);
}
.hard-drop-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 150px;
  min-height: 52px;
  padding: 10px 15px;
  border: 1px solid #00f0ff70;
  border-radius: 5px;
  background: #00f0ff0c;
  color: var(--tt-accent);
  font-size: 12px !important;
}
.hard-drop-button > span {
  font-size: 24px;
}
.hard-drop-button:hover:not(:disabled) {
  background: #00f0ff18;
}
.console-footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid var(--tt-border);
  color: var(--tt-muted);
  font-size: 11px;
  line-height: 1.7;
}
.console-footer p {
  margin: 0;
  max-width: 64ch;
}
.console-footer > span {
  flex: none;
}
.restart-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #0b0e14ed;
  backdrop-filter: blur(8px);
}
.restart-dialog {
  width: min(100%, 390px);
  padding: 28px;
  border: 1px solid var(--tt-border);
  border-radius: 10px;
  background: var(--tt-panel);
  text-align: center;
}
.restart-dialog > span {
  display: block;
  margin-bottom: 15px;
  color: var(--tt-amber);
  font-size: 30px;
}
.restart-dialog h3 {
  margin: 0 0 12px;
  color: var(--tt-text);
  font-size: 26px;
  letter-spacing: -0.025em;
}
.restart-dialog > p {
  margin: 0;
  color: var(--tt-muted);
  font-size: 14px;
  line-height: 1.7;
}
.restart-dialog > div {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.restart-dialog .console-button,
.restart-dialog .tetris-primary {
  flex: 1;
  width: auto;
}
.tetris-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@keyframes clear-flash {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@media (max-width: 999px) {
  .console-content {
    padding: 22px;
  }
  .tetris-layout {
    grid-template-columns: minmax(115px, 1fr) minmax(0, 280px) minmax(155px, 1fr);
    gap: 20px;
  }
  .console-actions {
    max-width: 230px;
  }
  .keyboard-panel dd {
    font-size: 10px;
  }
  .keyboard-panel dl > div {
    gap: 6px;
  }
  .stack-note p {
    font-size: 12px;
  }
}
@media (max-width: 767px) {
  .tetris-navigation {
    margin-bottom: 12px;
  }
  .tetris-library-note {
    font-size: 10px;
  }
  .console-content {
    padding: 20px 14px;
  }
  .console-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
    margin-bottom: 20px;
    padding-bottom: 18px;
  }
  .console-header h2 {
    font-size: 44px;
  }
  .console-edition {
    font-size: 9px;
  }
  .tetris-intro {
    margin-top: 8px;
    font-size: 12px;
  }
  .console-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    max-width: none;
    gap: 6px;
  }
  .console-button {
    gap: 5px;
    min-height: 44px;
    padding: 6px;
    font-size: 10px !important;
  }
  .console-button > svg {
    width: 15px;
    height: 15px;
  }
  .tetris-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    max-width: 340px;
    margin: 0 auto;
  }
  .tetris-left {
    display: grid;
    grid-template-columns: minmax(90px, 1fr) minmax(0, 1.7fr);
    gap: 16px;
  }
  .held-panel {
    min-width: 0;
  }
  .panel-heading {
    padding-bottom: 6px;
  }
  .panel-heading h3,
  .keyboard-panel h3 {
    font-size: 12px;
  }
  .held-piece {
    height: 49px;
  }
  .held-piece :deep(svg) {
    width: 68px;
    height: 37px;
  }
  .hold-empty {
    font-size: 9px;
    line-height: 1.5;
  }
  .hold-button {
    min-height: 36px;
    padding: 4px 6px;
    font-size: 9px !important;
  }
  .tetris-scoreboard {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px 10px;
    margin-top: 0;
    align-content: start;
  }
  .tetris-scoreboard span {
    font-size: 9px;
  }
  .tetris-scoreboard strong,
  .tetris-scoreboard .score-primary strong {
    margin-top: 1px;
    font-size: 20px;
  }
  .score-pair {
    display: contents;
  }
  .score-pair strong {
    font-size: 17px;
  }
  .level-progress,
  .stack-note {
    display: none;
  }
  .tetris-right {
    order: -1;
  }
  .next-panel {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--tt-border);
  }
  .next-panel .panel-heading {
    flex: none;
    border: 0;
    padding: 0;
  }
  .next-panel .panel-heading > span {
    display: none;
  }
  .next-panel ol {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    flex: 1;
  }
  .next-panel li {
    justify-content: center;
    min-height: 35px;
    padding: 0;
    border: 0;
    gap: 0;
  }
  .next-panel li > span {
    display: none;
  }
  .next-panel :deep(svg) {
    width: 56px;
    height: 30px;
  }
  .next-panel .next-empty {
    grid-column: 1 / -1;
    font-size: 10px;
  }
  .keyboard-panel {
    display: none;
  }
  .board-topline,
  .board-bottomline {
    font-size: 9px;
  }
  .tetris-touch-controls {
    flex-direction: column;
    gap: 8px;
    margin-top: 18px;
  }
  .hard-drop-button {
    min-height: 44px;
  }
  .touch-directions {
    gap: 5px;
  }
  .touch-directions button {
    min-width: 0;
    min-height: 52px;
  }
  .console-footer {
    flex-direction: column;
    gap: 8px;
    margin-top: 20px;
    padding-top: 14px;
    font-size: 10px;
  }
  .board-overlay {
    padding: 18px;
  }
  .board-message h3 {
    font-size: 27px;
  }
  .board-message > p {
    font-size: 12px;
  }
  .restart-dialog {
    padding: 22px;
  }
  .restart-dialog > div {
    gap: 8px;
  }
  .restart-dialog .tetris-primary,
  .restart-dialog .console-button {
    font-size: 11px !important;
  }
}
@media (max-width: 374px) {
  .console-content {
    padding: 18px 10px;
  }
  .tetris-left {
    gap: 12px;
    grid-template-columns: minmax(88px, 1fr) minmax(0, 1.6fr);
  }
  .tetris-scoreboard strong,
  .tetris-scoreboard .score-primary strong {
    font-size: 17px;
  }
  .score-pair strong {
    font-size: 16px;
  }
  .tetris-console kbd {
    font-size: 9px;
    padding: 2px 4px;
  }
  .board-message h3 {
    font-size: 24px;
  }
  .start-instructions {
    margin: 18px 0;
  }
  .board-message > small {
    font-size: 9px;
  }
  .board-overlay {
    padding: 15px;
  }
}
@media (max-width: 767px) {
  .mobile-layout .console-content {
    padding: 12px;
  }
  .mobile-layout .console-header {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 12px;
  }
  .mobile-layout .console-edition,
  .mobile-layout .tetris-intro {
    display: none;
  }
  .mobile-layout .console-header h2 {
    font-size: 32px;
  }
  .mobile-layout .console-actions {
    display: flex;
    width: auto;
    gap: 5px;
    flex-wrap: nowrap;
  }
  .mobile-layout .console-actions .console-button {
    width: 36px;
    height: 44px;
    min-height: 44px;
    padding: 6px;
    font-size: 0 !important;
    gap: 0;
  }
  .mobile-layout .console-actions .console-button > span {
    font-size: 18px;
  }
  .mobile-layout .console-actions .console-button > svg {
    width: 18px;
    height: 18px;
  }
  .mobile-layout .tetris-layout {
    grid-template-columns: minmax(0, 1fr) 82px;
    grid-template-rows: auto 1fr;
    gap: 14px 12px;
  }
  .mobile-layout .tetris-play-column {
    grid-column: 1;
    grid-row: 1 / 3;
  }
  .mobile-layout .tetris-left {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .mobile-layout .tetris-right {
    grid-column: 2;
    grid-row: 2;
    order: initial;
  }
  .mobile-layout .next-panel {
    display: block;
    border-bottom: 0;
    padding-bottom: 0;
  }
  .mobile-layout .next-panel .panel-heading {
    padding-bottom: 8px;
  }
  .mobile-layout .next-panel ol {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;
  }
  .mobile-layout .next-panel li {
    min-height: 28px;
  }
  .mobile-layout .next-panel :deep(svg) {
    height: 25px;
    width: 48px;
  }
  .mobile-layout .panel-heading {
    padding-bottom: 4px;
  }
  .mobile-layout .held-piece {
    height: 35px;
  }
  .mobile-layout .held-piece :deep(svg) {
    width: 56px;
    height: 29px;
  }
  .mobile-layout .hold-empty {
    font-size: 8px;
  }
  .mobile-layout .hold-button {
    min-height: 32px;
  }
  .mobile-layout .tetris-scoreboard {
    gap: 8px;
  }
  .mobile-layout .tetris-scoreboard strong {
    font-size: 17px;
  }
  .mobile-layout .tetris-scoreboard .score-primary strong {
    font-size: 19px;
  }
  .mobile-layout .tetris-play-column {
    width: 100%;
    justify-self: center;
  }
  .mobile-layout .board-topline {
    margin-bottom: 6px;
  }
  .mobile-layout .board-topline > span:last-child {
    white-space: nowrap;
    font-size: 8px;
  }
  .mobile-layout .music-status {
    gap: 8px;
    font-size: 8px;
    margin-top: 6px;
  }
  .mobile-layout .board-bottomline {
    margin-top: 6px;
    font-size: 8px;
  }
  .mobile-layout .ghost-key {
    display: none;
  }
  .mobile-layout .tetris-touch-controls {
    margin-top: 12px;
    gap: 6px;
  }
  .mobile-layout .touch-directions button {
    min-height: 48px;
  }
  .mobile-layout .hard-drop-button {
    min-height: 44px;
    padding: 6px 12px;
  }
  .mobile-layout .console-footer {
    display: none;
  }
  .mobile-layout .board-message h3 {
    font-size: 22px;
  }
  .mobile-layout .board-message > p {
    font-size: 11px;
  }
  .mobile-layout .message-icon {
    display: none;
  }
  .mobile-layout .board-overlay {
    padding: 10px;
  }
  .mobile-layout .ready-message .start-instructions,
  .mobile-layout .ready-message > small {
    display: none;
  }
  .mobile-layout .tetris-primary {
    font-size: 11px !important;
    padding: 8px;
  }
}
</style>
