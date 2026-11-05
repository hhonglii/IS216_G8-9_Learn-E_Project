<script setup>
import { computed } from 'vue'

const props = defineProps({
  window: { type: Object, required: true },
  active: { type: Boolean, default: false },
})
const emit = defineEmits(['focus', 'minimize', 'maximize', 'close', 'drag-start', 'move'])
const geometry = computed(() => ({
  left: `${props.window.x}px`,
  top: `${props.window.y}px`,
  width: `${props.window.width}px`,
  height: `${props.window.height}px`,
  zIndex: props.window.z,
  '--rk-dock-dx': `${props.window.dockDx || 0}px`,
  '--rk-dock-dy': `${props.window.dockDy ?? 120}px`,
}))

function moveByKey(event) {
  if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return
  const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const offset = offsets[event.key]
  if (!offset || props.window.maximized) return
  event.preventDefault()
  const distance = event.shiftKey ? 32 : 12
  emit('move', offset[0] * distance, offset[1] * distance)
}
</script>

<template>
  <section
    class="rootkit-window"
    :class="{
      'is-active': active,
      'is-maximized': window.maximized,
      'is-dragging': window.dragging,
    }"
    :style="geometry"
    :data-window-id="window.id"
    role="region"
    :aria-label="window.title"
    @pointerdown.capture="emit('focus')"
    @focusin="emit('focus')"
  >
    <div
      class="window-titlebar"
      role="group"
      :aria-label="`Move ${window.title}`"
      :aria-describedby="`window-move-help-${window.id}`"
      tabindex="0"
      @pointerdown="emit('drag-start', $event)"
      @keydown="moveByKey"
    >
      <div class="window-controls">
        <button
          class="window-control control-close"
          type="button"
          :aria-label="`Close ${window.title}`"
          @click="emit('close')"
        >
          <span aria-hidden="true">×</span>
        </button>
        <button
          class="window-control control-minimize"
          type="button"
          :aria-label="`Minimize ${window.title}`"
          @click="emit('minimize')"
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          class="window-control control-maximize"
          type="button"
          :aria-label="`${window.maximized ? 'Restore' : 'Maximize'} ${window.title}`"
          @click="emit('maximize')"
        >
          <span aria-hidden="true">{{ window.maximized ? '▱' : '+' }}</span>
        </button>
      </div>
      <h3>{{ window.title }}</h3>
      <span :id="`window-move-help-${window.id}`" class="window-move-help"
        >Drag this header or use arrow keys to move the window. Hold Shift for larger steps.</span
      >
    </div>
    <div class="window-body"><slot /></div>
  </section>
</template>

<style scoped>
.rootkit-window {
  position: absolute;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--rk-border);
  border-radius: 12px;
  background: var(--rk-window-bg);
  color: var(--rk-text);
  box-shadow: 0 15px 38px color-mix(in srgb, var(--rk-border) 45%, transparent);
  backdrop-filter: var(--rk-blur, blur(12px));
  transition:
    left 160ms ease,
    top 160ms ease,
    width 160ms ease,
    height 160ms ease;
}
.rootkit-window.is-active {
  border-color: color-mix(in srgb, var(--rk-accent) 48%, var(--rk-border));
  box-shadow: 0 18px 48px color-mix(in srgb, var(--rk-border) 65%, transparent);
}
.rootkit-window.is-dragging {
  transition: none;
}
.is-maximized {
  border-radius: 7px;
}
.window-titlebar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 46px;
  padding: 4px 10px 4px 5px;
  border-bottom: 1px solid var(--rk-border);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.window-titlebar:active {
  cursor: grabbing;
}
.is-maximized .window-titlebar {
  cursor: default;
}
.window-titlebar:focus-visible {
  outline: 2px solid var(--rk-accent);
  outline-offset: -3px;
}
.window-controls {
  display: flex;
  flex: none;
  align-items: center;
}
.window-control {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  touch-action: manipulation;
}
.window-control > span {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 50%;
  color: #2c1718;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
.control-close > span {
  background: var(--rk-close, #ff625a);
}
.control-minimize > span {
  background: var(--rk-minimize, #ffbd44);
}
.control-maximize > span {
  background: var(--rk-maximize, #00ca4e);
}
.window-control:hover {
  background: color-mix(in srgb, var(--rk-text) 9%, transparent);
}
.window-control:focus-visible {
  outline: 2px solid var(--rk-accent);
  outline-offset: -2px;
}
.window-titlebar h3 {
  overflow: hidden;
  min-width: 0;
  margin: 0;
  color: var(--rk-muted);
  font-family: var(--bs-font-monospace);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.is-active .window-titlebar h3 {
  color: var(--rk-text);
}
.window-move-help {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.window-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.rk-window-enter-active,
.rk-window-leave-active {
  transition:
    opacity 190ms ease,
    transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.rk-window-enter-from,
.rk-window-leave-to {
  opacity: 0;
  transform: translate(var(--rk-dock-dx, 0px), var(--rk-dock-dy, 120px)) scale(0.18);
  transform-origin: center;
}
.rk-window-leave-active {
  pointer-events: none;
}
@media (pointer: coarse) {
  .window-control {
    width: 44px;
    height: 44px;
  }
}
</style>
