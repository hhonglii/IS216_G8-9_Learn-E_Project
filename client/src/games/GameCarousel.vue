<script setup>
// The Take a break game picker: the game covers in a looping 3D row. Drag or
// swipe to turn it, or use the arrow buttons, the dots or the arrow keys; each
// card links to its game. v-model holds the chosen game's id.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  games: { type: Array, required: true },
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const stage = ref(null)
const cardLinks = []
const dragOffset = ref(0)
const isDragging = ref(false)
const selectedIndex = computed(() =>
  Math.max(
    0,
    props.games.findIndex((game) => game.id === props.modelValue),
  ),
)
const selectedGame = computed(() => props.games[selectedIndex.value])
let gesture = null
let suppressClick = false

function selectGame(index) {
  const game = props.games[(index + props.games.length) % props.games.length]
  if (game) emit('update:modelValue', game.id)
}

function cardStyle(index) {
  // Wrap behind the stage so the carousel can loop in either direction.
  let position = index - selectedIndex.value + dragOffset.value
  position -= Math.round(position / props.games.length) * props.games.length
  const distance = Math.abs(position)
  return {
    '--position': position,
    '--distance': distance,
    '--visibility': distance <= 1 ? 1 - distance * 0.3 : Math.max(0, (1.5 - distance) * 1.4),
    zIndex: 20 - Math.round(distance * 10),
  }
}

function startDrag(event) {
  if (!event.isPrimary || event.button !== 0 || gesture) return
  suppressClick = false
  const captureTarget = event.target.closest('.game-card-link') ?? stage.value
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    step: stage.value.querySelector('.game-card').offsetWidth * 0.72,
    axis: null,
    captureTarget,
  }
  // Capturing on the link preserves ordinary clicks as well as drags outside it.
  captureTarget.setPointerCapture(event.pointerId)
}

function moveDrag(event) {
  if (gesture?.id !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (!gesture.axis) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return
    gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
  }
  suppressClick = true
  // Native vertical scrolling stays available on touch screens.
  if (gesture.axis !== 'x') return
  event.preventDefault()
  isDragging.value = true
  dragOffset.value = Math.max(-1, Math.min(1, dx / gesture.step))
}

function finishDrag(event, cancelled = false) {
  if (gesture?.id !== event.pointerId) return
  const { captureTarget, id } = gesture
  gesture = null
  if (!cancelled && Math.abs(dragOffset.value) >= 0.22) {
    selectGame(selectedIndex.value + (dragOffset.value < 0 ? 1 : -1))
  }
  dragOffset.value = 0
  isDragging.value = false
  if (captureTarget.hasPointerCapture(id)) captureTarget.releasePointerCapture(id)
}

function preventDragClick(event) {
  // A completed swipe must never activate the link underneath the pointer.
  if (suppressClick && event.detail > 0) {
    event.preventDefault()
    event.stopPropagation()
    suppressClick = false
  }
}

function focusCard(index) {
  if (!gesture) selectGame(index)
}

async function navigateWithKeyboard(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || gesture) return
  const destinations = {
    ArrowLeft: selectedIndex.value - 1,
    ArrowRight: selectedIndex.value + 1,
    Home: 0,
    End: props.games.length - 1,
  }
  if (!(event.key in destinations)) return
  event.preventDefault()
  selectGame(destinations[event.key])
  if (event.target.closest('.game-card-link')) {
    await nextTick()
    cardLinks[selectedIndex.value]?.focus({ preventScroll: true })
  }
}

onBeforeUnmount(() => {
  if (gesture) finishDrag({ pointerId: gesture.id }, true)
})
</script>

<template>
  <section
    v-if="games.length"
    class="game-carousel"
    aria-label="Choose a game"
    aria-roledescription="carousel"
    aria-describedby="game-carousel-help"
    @keydown="navigateWithKeyboard"
  >
    <p id="game-carousel-help" class="carousel-hint">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m7 8-4 4 4 4m10-8 4 4-4 4M3 12h18" />
      </svg>
      Drag to explore <span>or use the arrows</span>
    </p>
    <div
      ref="stage"
      class="carousel-stage"
      :class="{ 'is-dragging': isDragging }"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="finishDrag"
      @pointercancel="finishDrag($event, true)"
      @lostpointercapture="finishDrag($event, true)"
      @click.capture="preventDragClick"
      @dragstart.prevent
    >
      <article
        v-for="(game, index) in games"
        :key="game.id"
        class="game-card card"
        :class="{ 'is-selected': index === selectedIndex }"
        :style="cardStyle(index)"
        role="group"
        aria-roledescription="slide"
        :aria-label="`${game.title}, ${index + 1} of ${games.length}`"
      >
        <RouterLink
          :ref="(link) => (cardLinks[index] = link?.$el)"
          class="game-card-link"
          :to="{ name: 'take-a-break', query: { game: game.id } }"
          :aria-label="`Play ${game.title}`"
          :draggable="false"
          @focus="focusCard(index)"
        >
          <div class="game-cover">
            <component :is="game.cover" compact />
          </div>
          <div class="game-card-body">
            <div class="game-card-meta">
              <span>{{ game.genre }}</span>
              <span>{{ game.pace }}</span>
            </div>
            <h3>{{ game.title }}</h3>
            <p>{{ game.summary ?? game.description }}</p>
            <span class="game-card-cta">
              Play game
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </span>
          </div>
        </RouterLink>
      </article>
    </div>
    <div class="carousel-controls">
      <button
        type="button"
        class="carousel-arrow"
        aria-label="Previous game"
        :disabled="games.length < 2"
        @click="selectGame(selectedIndex - 1)"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m14 6-6 6 6 6" />
        </svg>
      </button>
      <div class="carousel-dots" role="group" aria-label="Select a game">
        <button
          v-for="(game, index) in games"
          :key="game.id"
          type="button"
          class="carousel-dot"
          :aria-label="`Show ${game.title}`"
          :aria-pressed="index === selectedIndex"
          @click="selectGame(index)"
        >
          <span></span>
        </button>
      </div>
      <button
        type="button"
        class="carousel-arrow"
        aria-label="Next game"
        :disabled="games.length < 2"
        @click="selectGame(selectedIndex + 1)"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m10 6 6 6-6 6" />
        </svg>
      </button>
    </div>
    <p class="carousel-position" aria-live="polite" aria-atomic="true">
      <span
        >{{ String(selectedIndex + 1).padStart(2, '0') }} /
        {{ String(games.length).padStart(2, '0') }}</span
      >
      <span aria-hidden="true">·</span>
      {{ selectedGame.title }}
    </p>
  </section>
</template>

<style scoped>
.game-carousel {
  min-width: 0;
  max-width: 62rem;
  margin-inline: auto;
}
.carousel-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--le-text);
  font-size: 0.8125rem;
}
.carousel-hint span {
  color: var(--le-muted);
}
svg {
  width: 1.25rem;
  height: 1.25rem;
  flex: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.carousel-hint svg {
  color: var(--le-violet);
}
.carousel-stage {
  display: grid;
  position: relative;
  isolation: isolate;
  overflow: clip;
  padding: 0.75rem 0 1rem;
  perspective: 1200px;
  cursor: grab;
  touch-action: pan-y pinch-zoom;
  user-select: none;
  -webkit-user-select: none;
  background: radial-gradient(ellipse at 50% 55%, #c273ff12, transparent 65%);
}
.carousel-stage::after {
  content: '';
  position: absolute;
  z-index: -1;
  bottom: 1.2rem;
  left: 15%;
  width: 70%;
  height: 2rem;
  border-radius: 50%;
  background: #c273ff15;
  filter: blur(18px);
  pointer-events: none;
}
.game-card {
  grid-area: 1 / 1;
  justify-self: center;
  width: min(20rem, calc(100% - 2.5rem));
  min-width: 0;
  overflow: hidden;
  opacity: var(--visibility);
  transform: translateX(calc(var(--position) * 72%)) translateZ(calc(var(--distance) * -165px))
    rotateY(calc(var(--position) * -30deg));
  box-shadow: 0 18px 36px #0005;
  transition:
    transform 480ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 350ms ease,
    border-color 350ms ease,
    box-shadow 350ms ease;
}
.game-card.is-selected {
  border-color: var(--le-violet);
  box-shadow:
    0 22px 48px #0006,
    0 0 28px #c273ff17;
}
.game-card-link {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: inherit;
  text-decoration: none;
  cursor: inherit;
  -webkit-user-drag: none;
}
.game-card-link:focus-visible {
  outline: 3px solid var(--le-focus);
  outline-offset: -4px;
  border-radius: var(--le-radius-card);
}
.game-cover {
  --game-cover-height: clamp(7rem, calc(100svh - 36rem), 10rem);
  position: relative;
  container-type: inline-size;
  height: var(--game-cover-height);
  overflow: hidden;
  flex: none;
  pointer-events: none;
}
.game-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0.875rem 1rem;
}
.game-card-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.25rem 0.5rem;
  margin-bottom: 0.4rem;
  color: var(--le-muted);
  font-size: 0.75rem;
}
.game-card-meta span:first-child {
  color: var(--le-violet);
  font-weight: 600;
}
.game-card-body h3 {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  letter-spacing: -0.03em;
}
.game-card-body p {
  flex: 1;
  margin: 0;
  color: var(--le-muted);
  font-size: 0.875rem;
  line-height: 1.45;
}
.game-card-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.75rem;
  margin-top: 0.75rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--le-border);
  border-radius: var(--le-radius-pill);
  color: var(--le-action);
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    color 180ms ease,
    background 180ms ease,
    border-color 180ms ease;
}
.is-selected .game-card-cta {
  border-color: var(--le-action);
  background: var(--le-action-tint);
}
.game-card-link:hover .game-card-cta,
.game-card-link:focus-visible .game-card-cta {
  border-color: var(--le-action);
  background: var(--le-action);
  color: var(--le-on-action);
}
.is-dragging,
.is-dragging .game-card-link {
  cursor: grabbing;
}
.is-dragging .game-card {
  transition: none;
}
.carousel-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.carousel-arrow {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 1px solid var(--le-border);
  border-radius: 50%;
  background: var(--le-surface);
  color: var(--le-text);
  transition:
    border-color 180ms ease,
    color 180ms ease;
}
.carousel-arrow:hover {
  border-color: var(--le-violet);
  color: var(--le-violet);
}
.carousel-arrow:disabled {
  opacity: 0.4;
}
.carousel-arrow:focus-visible,
.carousel-dot:focus-visible {
  outline: 2px solid var(--le-focus);
  outline-offset: 3px;
}
.carousel-dots {
  display: flex;
  align-items: center;
}
.carousel-dot {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
}
.carousel-dot span {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50rem;
  background: var(--le-muted);
  transition:
    width 250ms ease,
    background 250ms ease;
}
.carousel-dot[aria-pressed='true'] span {
  width: 1.5rem;
  background: var(--le-violet);
}
.carousel-dot:hover span {
  background: var(--le-violet);
}
.carousel-position {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.7rem;
  margin: 0.4rem 0 0;
  color: var(--le-muted);
  font-size: 0.8125rem;
}
.carousel-position > span:first-child {
  font-variant-numeric: tabular-nums;
}
@media (max-width: 575px) {
  .carousel-stage {
    padding-block: 0.5rem 0.75rem;
    perspective: 900px;
  }
  .game-cover {
    --game-cover-height: clamp(6rem, calc(100svh - 29rem), 9rem);
  }
  .game-card-body {
    padding: 0.75rem;
  }
  .carousel-controls {
    gap: 0.5rem;
  }
}
@media (max-width: 575px) and (max-height: 700px) {
  .carousel-position {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
