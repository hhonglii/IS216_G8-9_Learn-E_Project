<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { use2048Game } from './use2048Game.js'
import { useSlideSound } from '../useSlideSound.js'
import { useGameHighScores } from '../useGameHighScores.js'

defineOptions({ name: 'TwentyFortyEightGame' })
defineEmits(['exit'])
const { state, move, restart, continueGame } = use2048Game()
const { state: highScores, beginRun, queueScore, flushScore } = useGameHighScores('2048')
// Capture the player once for this board; switching profiles must not claim an older run.
beginRun()
const displayedBest = computed(() =>
  highScores.userId ? (highScores.personalBest?.value ?? null) : state.value.best,
)
const { muted, supported, toggleMute, playSlide, musicMuted, musicPlaying, toggleMusic, activate } =
  useSlideSound()
const boardElement = ref(null)
const resultTitle = ref(null)
const finished = computed(() => state.value.status !== 'playing')
const directionButtons = [
  { direction: 'up', arrow: '↑' },
  { direction: 'left', arrow: '←' },
  { direction: 'down', arrow: '↓' },
  { direction: 'right', arrow: '→' },
]
let gesture = null

function activateAudio(event) {
  if (event.target.closest('[data-audio-control]')) return
  void activate()
}

function slide(direction) {
  void activate()
  // Keyboard, direction buttons, and swipes share one validity gate and one effect per move.
  if (move(direction)) playSlide()
}

function keydown(event) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.closest('input,textarea,select,[contenteditable="true"]')
  )
    return
  const direction = {
    arrowup: 'up',
    w: 'up',
    arrowleft: 'left',
    a: 'left',
    arrowdown: 'down',
    s: 'down',
    arrowright: 'right',
    d: 'right',
  }[event.key.toLowerCase()]
  if (direction) {
    event.preventDefault()
    slide(direction)
  }
}

function startSwipe(event) {
  // A second finger must not replace the pointer already controlling this gesture.
  if (event.button !== 0 || event.isPrimary === false || gesture || finished.value) return
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY }
  try {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  } catch {
    // Capture may be unavailable after an interrupted pointer; an in-board release still works.
  }
}

function cancelSwipe(event) {
  if (gesture?.id === event.pointerId) gesture = null
}

function endSwipe(event) {
  if (!gesture || gesture.id !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  gesture = null
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
  slide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
}

async function newGame() {
  gesture = null
  beginRun()
  restart()
  await nextTick()
  boardElement.value?.focus({ preventScroll: true })
}
async function keepPlaying() {
  gesture = null
  continueGame()
  await nextTick()
  boardElement.value?.focus({ preventScroll: true })
}
watch(
  () => state.value.score,
  (score, previous) => {
    if (score > 0 && score > previous) queueScore(score)
  },
  { flush: 'sync' },
)
watch(
  () => state.value.status,
  async (status) => {
    if (status !== 'playing') {
      void flushScore()
      await nextTick()
      resultTitle.value?.focus({ preventScroll: true })
    }
  },
)
onMounted(async () => {
  await nextTick()
  boardElement.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => void flushScore())
</script>

<template>
  <section
    class="game-2048"
    aria-labelledby="game-2048-title"
    @keydown="keydown"
    @pointerdown="activateAudio"
  >
    <header class="game-navigation">
      <button
        type="button"
        class="library-back"
        aria-label="Back to game library"
        @click="$emit('exit')"
      >
        <span aria-hidden="true">←</span> All games
      </button>
      <div class="audio-controls" role="group" aria-label="Audio controls">
        <button
          type="button"
          class="sound-toggle"
          data-audio-control
          :aria-label="muted ? 'Unmute sound' : 'Mute sound'"
          :aria-pressed="muted"
          :disabled="!supported"
          @click="toggleMute"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path v-if="!muted" d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" />
            <path v-else d="m16 9 6 6m0-6-6 6" />
          </svg>
          {{ !supported ? 'Audio unavailable' : muted ? 'Effects off' : 'Effects on' }}
        </button>
        <button
          type="button"
          class="sound-toggle music-toggle"
          data-audio-control
          :aria-label="musicMuted ? 'Unmute music' : 'Mute music'"
          :aria-pressed="musicMuted"
          :disabled="!supported"
          @click="toggleMusic"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path d="M9 17V5l11-2v12M9 8l11-2" />
            <ellipse cx="6" cy="18" rx="3" ry="2.5" />
            <ellipse cx="17" cy="16" rx="3" ry="2.5" />
            <path v-if="musicMuted" d="m3 3 18 18" />
          </svg>
          {{ !supported ? 'Audio unavailable' : musicMuted ? 'Music off' : 'Music on' }}
        </button>
      </div>
    </header>

    <div class="game-layout">
      <div class="play-column">
        <div class="game-title-row">
          <h2 id="game-2048-title">2048</h2>
          <div class="scoreboard">
            <div>
              <span>Score</span
              ><strong data-testid="2048-score" :class="{ 'score-long': state.score >= 10000 }">{{
                state.score
              }}</strong>
            </div>
            <div>
              <span>{{ highScores.userId ? 'Your best' : 'Browser best' }}</span
              ><strong data-testid="2048-best" :class="{ 'score-long': displayedBest >= 10000 }">{{
                displayedBest ?? '—'
              }}</strong>
            </div>
          </div>
        </div>
        <div class="game-toolbar">
          <p>Combine the numbers.<br />Reach <strong>2048.</strong></p>
          <button type="button" class="new-game" @click="newGame">
            New game <span aria-hidden="true">↻</span>
          </button>
        </div>

        <div class="board-frame">
          <div
            ref="boardElement"
            class="board-2048"
            role="group"
            aria-label="2048 game board"
            aria-describedby="controls-2048"
            tabindex="0"
            @pointerdown="startSwipe"
            @pointerup="endSwipe"
            @pointercancel="cancelSwipe"
            @lostpointercapture="cancelSwipe"
          >
            <div class="board-cells" aria-hidden="true">
              <span v-for="cell in 16" :key="cell"></span>
            </div>
            <TransitionGroup tag="div" name="tile" class="tile-layer">
              <div
                v-for="tile in state.tiles"
                :key="tile.id"
                class="number-tile"
                role="img"
                :aria-label="`${tile.value} tile, row ${tile.row + 1}, column ${tile.col + 1}`"
                :data-tile-value="tile.value"
                :data-tile-id="tile.id"
                :data-row="tile.row"
                :data-col="tile.col"
                :style="{
                  transform: `translate(calc(${tile.col} * (100% + var(--gap))), calc(${tile.row} * (100% + var(--gap))))`,
                }"
              >
                <!-- Keep the moving parent stable; only recreate the inner face for a merge pulse. -->
                <span
                  :key="`${tile.id}-${tile.merged ? state.revision : 'rest'}`"
                  class="tile-face"
                  :class="[
                    `tile-${Math.min(tile.value, 2048)}`,
                    {
                      'is-merged': tile.merged,
                      'tile-long': tile.value >= 1024,
                      'tile-extra-long': tile.value >= 10000,
                    },
                  ]"
                  >{{ tile.value }}</span
                >
              </div>
            </TransitionGroup>
          </div>
          <div v-if="finished" class="game-result" :class="{ 'is-won': state.status === 'won' }">
            <span aria-hidden="true">{{ state.status === 'won' ? '2048' : '↻' }}</span>
            <h3 ref="resultTitle" tabindex="-1">
              {{ state.status === 'won' ? 'You reached 2048!' : 'No more moves' }}
            </h3>
            <p>
              {{
                state.status === 'won'
                  ? 'A little patience. A very good result.'
                  : 'A fresh board is a fresh start.'
              }}
            </p>
            <button
              v-if="state.status === 'won'"
              type="button"
              class="new-game"
              @click="keepPlaying"
            >
              Keep playing
            </button>
            <button type="button" class="new-game" @click="newGame">
              {{ state.status === 'won' ? 'Start again' : 'Try again' }}
            </button>
          </div>
        </div>
        <div class="board-footer">
          <p role="status" aria-live="polite" aria-atomic="true">{{ state.message }}</p>
          <span
            ><strong data-testid="2048-moves">{{ state.moves }}</strong>
            {{ state.moves === 1 ? 'move' : 'moves' }}</span
          >
        </div>
      </div>

      <aside class="game-guide" aria-label="2048 instructions and controls">
        <div class="merge-example" aria-hidden="true">
          <span>2</span><i>+</i><span>2</span><i>=</i><span>4</span>
        </div>
        <h3>One good move<br />at a time.</h3>
        <p>
          Slide the board. Matching numbers become one. Reach the 2048 tile, then see how far you
          can go.
        </p>
        <div class="how-to">
          <h4>How to play</h4>
          <p id="controls-2048">
            Use <strong>arrow keys</strong> or <strong>WASD</strong>, swipe the board, or use the
            buttons below.
          </p>
          <p>Every move slides all tiles. A new 2 or 4 appears only when the board changes.</p>
        </div>
        <div class="direction-pad" role="group" aria-label="Slide direction">
          <button
            v-for="button in directionButtons"
            :key="button.direction"
            type="button"
            :class="`slide-${button.direction}`"
            :aria-label="`Slide ${button.direction}`"
            :disabled="finished"
            @click="slide(button.direction)"
          >
            {{ button.arrow }}
          </button>
        </div>
        <p class="sound-note">
          <span aria-hidden="true">♪</span> Digital pulses. Low-key synths.<br /><span
            >Music and effects have separate switches.</span
          >
        </p>
        <p class="music-status" data-testid="2048-music-status" role="status" aria-live="polite">
          <span aria-hidden="true" :class="{ playing: musicPlaying }"></span
          >{{ musicMuted ? 'Music off' : musicPlaying ? 'Music playing' : 'Music ready' }}
        </p>
        <p class="best-note">
          {{
            highScores.userId
              ? 'Your best score follows your selected profile.'
              : 'Guest best scores stay on this browser.'
          }}<br />There’s no timer. Take your time.
        </p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.game-2048 {
  --paper: #111620;
  --ink: #eaf0f9;
  --soft: #a2b0c5;
  --frame: #121a27;
  --line: #333d52;
  --cyan: #00f0ff;
  --purple: #b537f2;
  --gap: 12px;
  --padding: 12px;
  position: relative;
  isolation: isolate;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1.75rem 2rem;
  border: 1px solid var(--line);
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 12% 25%, #00f0ff08, transparent 50%),
    radial-gradient(ellipse at 95% 85%, #b537f20b, transparent 45%), #0b0e14;
  color: var(--ink);
}
.game-2048::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-image: radial-gradient(#7184a326 0.7px, transparent 0.7px);
  background-size: 18px 18px;
  mask-image: linear-gradient(130deg, #0009, transparent 70%);
}
button {
  font: inherit;
  touch-action: manipulation;
}
.game-2048 button:focus-visible,
.board-2048:focus-visible {
  outline: 3px solid var(--cyan);
  outline-offset: 5px;
}
.game-2048 button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.game-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 2rem;
}
.library-back,
.sound-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #111923;
  color: #b9c9dc;
  font-size: 0.8125rem;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.library-back > span {
  font-size: 1.2rem;
}
.library-back:hover,
.sound-toggle:hover:enabled {
  border-color: #66879c;
  background: #1a2c3c;
  color: #e7fbff;
}
.audio-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sound-toggle svg {
  width: 17px;
  height: 17px;
}
.sound-toggle[aria-pressed='false'] {
  border-color: #34586b;
  color: #b1f9ff;
}
.music-toggle[aria-pressed='false'] {
  border-color: #5e387a;
  color: #ddbdff;
}
.game-layout {
  display: grid;
  grid-template-columns: minmax(0, 480px) minmax(0, 1fr);
  align-items: center;
  gap: clamp(2rem, 5vw, 4rem);
}
.play-column {
  min-width: 0;
}
.game-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}
.game-title-row h2 {
  margin: 0;
  color: #f0f7ff;
  font-size: clamp(3.75rem, 8vw, 5.5rem);
  font-weight: 800;
  letter-spacing: -0.075em;
  line-height: 1;
}
.scoreboard {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}
.scoreboard > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  min-height: 65px;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #141d2b;
}
.scoreboard span {
  margin-bottom: 0.2rem;
  color: var(--soft);
  font-size: 0.6875rem;
}
.scoreboard strong {
  color: var(--cyan);
  font: 600 1.45rem/1.1 var(--bs-font-monospace);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow-wrap: normal;
}
.scoreboard > div:last-child strong {
  color: #d6acff;
}
.game-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.game-toolbar > p {
  margin: 0;
  color: var(--soft);
  font-size: 0.875rem;
  line-height: 1.6;
}
.game-toolbar > p strong {
  color: #d2e7fc;
}
.new-game {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 44px;
  padding: 0.6rem 1.1rem;
  border: 1px solid #00e5f4;
  border-radius: 5px;
  background: #00d7e6;
  color: #05232c;
  font-size: 0.8125rem;
  font-weight: 700;
  transition:
    background-color 0.15s,
    box-shadow 0.15s;
}
.new-game:hover {
  background: #77f7ff;
  box-shadow: 0 0 20px #00f0ff1a;
}
.board-frame {
  position: relative;
}
.board-2048 {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid #41546b;
  border-radius: 10px;
  background: var(--frame);
  box-shadow:
    0 7px 0 #060a11,
    0 8px 0 #2b4350,
    0 0 40px #00f0ff06;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.board-cells {
  position: absolute;
  inset: var(--padding);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: var(--gap);
}
.board-cells > span {
  position: relative;
  border: 1px solid #333d52;
  border-radius: 4px;
  background: #1e2430;
}
.board-cells > span::after {
  content: '';
  position: absolute;
  bottom: 5px;
  right: 5px;
  width: 3px;
  height: 3px;
  background: #405068;
}
.tile-layer {
  position: absolute;
  inset: var(--padding);
  pointer-events: none;
}
.number-tile {
  position: absolute;
  left: 0;
  top: 0;
  width: calc((100% - var(--gap) * 3) / 4);
  height: calc((100% - var(--gap) * 3) / 4);
  transition: transform 0.14s cubic-bezier(0.2, 0.65, 0.3, 1);
}
.tile-face {
  --tile-color: #00f0ff;
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 1px solid color-mix(in srgb, var(--tile-color) 70%, #24384d);
  border-radius: 4px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tile-color) 17%, #111620),
    color-mix(in srgb, var(--tile-color) 7%, #111620)
  );
  color: var(--tile-color);
  box-shadow:
    0 4px 0 color-mix(in srgb, var(--tile-color) 22%, #050a12),
    inset 0 0 20px color-mix(in srgb, var(--tile-color) 5%, transparent);
  font: 650 clamp(1.75rem, 5vw, 3rem)/1 var(--bs-font-monospace);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.07em;
  white-space: nowrap;
  overflow-wrap: normal;
  text-shadow: 0 0 18px color-mix(in srgb, var(--tile-color) 22%, transparent);
}
.tile-face::before {
  content: '';
  position: absolute;
  top: 5px;
  right: 5px;
  width: 12%;
  height: 6%;
  border-top: 1px solid var(--tile-color);
  border-right: 1px solid var(--tile-color);
  opacity: 0.35;
}
.tile-4 {
  --tile-color: #4fe3ff;
}
.tile-8 {
  --tile-color: #6fc9ff;
}
.tile-16 {
  --tile-color: #91adff;
}
.tile-32 {
  --tile-color: #b894ff;
}
.tile-64 {
  --tile-color: #c77bff;
}
.tile-128 {
  --tile-color: #db69ff;
}
.tile-256 {
  --tile-color: #e75cf7;
}
.tile-512 {
  --tile-color: #f27fe6;
}
.tile-1024 {
  --tile-color: #f3acff;
}
.tile-2048 {
  --tile-color: #ffe085;
  background: linear-gradient(135deg, #45321c, #2c2332);
  box-shadow:
    0 4px 0 #71572c,
    0 0 25px #ffb80025;
}
.tile-face.tile-long {
  font-size: clamp(1.2rem, 3.75vw, 2.3rem);
}
.tile-face.tile-extra-long {
  font-size: clamp(0.85rem, 2.75vw, 1.6rem);
}
.is-merged {
  animation: merge-pop 0.22s ease-out;
}
.tile-enter-active .tile-face {
  animation: tile-appear 0.17s ease-out;
}
.tile-leave-active {
  transition: opacity 0.08s;
}
.tile-leave-to {
  opacity: 0;
}
.board-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.2rem;
  color: var(--soft);
  font-size: 0.6875rem;
  line-height: 1.6;
}
.board-footer p {
  margin: 0;
  max-width: 36ch;
}
.board-footer > span {
  flex: none;
}
.board-footer strong {
  color: #d4e5f7;
  font-weight: 600;
}
.game-guide {
  padding-top: 1rem;
}
.merge-example {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.merge-example > span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid #32616e;
  border-radius: 4px;
  background: #102b36;
  color: var(--cyan);
  font: 600 1.25rem var(--bs-font-monospace);
}
.merge-example > span:last-child {
  border-color: #7b4b9d;
  background: #281b3b;
  color: #d5a5ff;
}
.merge-example i {
  color: #8a9db7;
  font-size: 0.875rem;
  font-style: normal;
}
.game-guide > h3 {
  margin: 0 0 1rem;
  color: var(--ink);
  font-size: clamp(1.75rem, 3vw, 2.4rem);
  letter-spacing: -0.045em;
  line-height: 1.15;
}
.game-guide > p,
.how-to p {
  color: var(--soft);
  font-size: 0.875rem;
  line-height: 1.75;
}
.game-guide > p {
  margin: 0;
  max-width: 32ch;
}
.how-to {
  margin-top: 1.6rem;
  padding-top: 1.3rem;
  border-top: 1px solid var(--line);
}
.how-to h4 {
  margin: 0 0 0.65rem;
  color: #e0ecfa;
  font-size: 1rem;
}
.how-to p {
  margin: 0 0 0.65rem;
}
.how-to strong {
  color: #d4e8fb;
  font-weight: 600;
}
.direction-pad {
  display: grid;
  grid-template-columns: repeat(3, 46px);
  grid-template-rows: repeat(2, 44px);
  justify-content: start;
  gap: 5px;
  margin: 1.1rem 0;
}
.direction-pad button {
  border: 1px solid #3b4a61;
  border-bottom-width: 3px;
  border-radius: 5px;
  background: #1c2635;
  color: #d7e9f7;
  font-size: 1.4rem;
  line-height: 1;
}
.direction-pad button:hover:enabled {
  border-color: #00c3d5;
  background: #223c4b;
  color: #cbfbff;
}
.direction-pad button:active:enabled {
  border-bottom-width: 1px;
}
.slide-up {
  grid-column: 2;
  grid-row: 1;
}
.slide-left {
  grid-column: 1;
  grid-row: 2;
}
.slide-down {
  grid-column: 2;
  grid-row: 2;
}
.slide-right {
  grid-column: 3;
  grid-row: 2;
}
.game-guide > .sound-note {
  margin-top: 1.25rem;
  font-size: 0.75rem;
  line-height: 1.7;
}
.sound-note > span:first-child {
  margin-right: 0.3rem;
  color: #cb91ff;
}
.sound-note > span:last-child {
  color: var(--soft);
}
.game-guide > .music-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.7rem;
  color: #c8a5f1;
  font: 0.6875rem var(--bs-font-monospace);
}
.music-status > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #65748a;
}
.music-status > span.playing {
  background: #c27eff;
  box-shadow: 0 0 9px #b537f260;
}
.game-guide > .best-note {
  margin-top: 1.25rem;
  color: var(--soft);
  font-size: 0.6875rem;
}
.game-result {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem;
  border: 1px solid #3f536c;
  border-radius: 10px;
  background: #0b0e14f2;
  text-align: center;
}
.game-result > span {
  color: var(--cyan);
  font: 700 2.5rem var(--bs-font-monospace);
  letter-spacing: -0.06em;
}
.game-result h3 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  letter-spacing: -0.04em;
}
.game-result p {
  margin: 0 0 0.5rem;
  color: var(--soft);
  font-size: 0.875rem;
}
.game-result.is-won {
  border-color: #8f6925;
  background: #17121ef2;
}
.game-result.is-won > span {
  color: #ffe085;
}
@keyframes merge-pop {
  0%,
  100% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.1);
  }
}
@keyframes tile-appear {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
@media (max-width: 767px) {
  .game-2048 {
    max-width: 520px;
    padding: 1.25rem;
  }
  .game-navigation {
    margin-bottom: 1.5rem;
  }
  .game-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
  }
  .game-title-row h2 {
    font-size: 4.5rem;
  }
  .game-guide {
    padding-top: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0 1rem;
  }
  .merge-example,
  .game-guide > h3,
  .game-guide > p:not(.sound-note):not(.best-note):not(.music-status) {
    display: none;
  }
  .how-to {
    grid-column: 1;
    grid-row: 1/4;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .how-to p {
    font-size: 0.8125rem;
  }
  .direction-pad {
    grid-column: 2;
    grid-row: 1;
    margin: 0.15rem 0 1rem;
  }
  .game-guide > .sound-note {
    grid-column: 2;
    grid-row: 2;
    margin-top: 0;
    font-size: 0.6875rem;
    max-width: 22ch;
  }
  .game-guide > .music-status {
    grid-column: 2;
    grid-row: 3;
    align-self: start;
    margin-top: 0.65rem;
    font-size: 0.625rem;
  }
  .game-guide > .best-note {
    display: block;
    grid-column: 1/-1;
    grid-row: 4;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
    max-width: none;
    font-size: 0.6875rem;
  }
}
@media (max-width: 480px) {
  .game-navigation {
    flex-direction: column;
    align-items: stretch;
  }
  .library-back {
    align-self: flex-start;
  }
  .audio-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .sound-toggle {
    padding: 0.5rem 0.4rem;
    font-size: 0.75rem;
  }
}
@media (max-width: 400px) {
  .game-2048 {
    --gap: 7px;
    --padding: 8px;
    padding: 1rem 0.8rem 1.25rem;
    border-radius: 10px;
  }
  .game-title-row {
    gap: 0.5rem;
  }
  .game-title-row h2 {
    font-size: 3.2rem;
  }
  .scoreboard {
    gap: 0.35rem;
  }
  .scoreboard > div {
    min-width: 57px;
    min-height: 54px;
    padding: 0.45rem 0.5rem;
  }
  .scoreboard strong {
    font-size: 1.1rem;
  }
  .scoreboard strong.score-long {
    font-size: 0.85rem;
  }
  .scoreboard span {
    font-size: 0.625rem;
  }
  .game-toolbar > p {
    font-size: 0.75rem;
  }
  .new-game {
    padding: 0.6rem 0.7rem;
    font-size: 0.75rem;
  }
  .tile-face {
    font-size: 1.75rem;
  }
  .tile-face.tile-long {
    font-size: 1.2rem;
  }
  .tile-face.tile-extra-long {
    font-size: 0.75rem;
  }
  .board-footer {
    gap: 0.5rem;
    font-size: 0.625rem;
  }
  .direction-pad {
    grid-template-columns: repeat(3, 34px);
  }
  .game-guide {
    gap: 0 0.65rem;
  }
  .game-guide > .sound-note {
    max-width: 18ch;
  }
  .how-to p {
    font-size: 0.75rem;
  }
}
</style>
