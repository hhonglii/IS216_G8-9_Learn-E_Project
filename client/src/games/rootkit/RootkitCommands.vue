<script setup>
import { onMounted, ref } from 'vue'
import CommandReference from './CommandReference.vue'
import { COMMAND_REFERENCE } from './commandReference.js'

defineProps({ inMission: { type: Boolean, default: false } })
const emit = defineEmits(['close'])
const dialog = ref(null)
const heading = ref(null)

function dialogKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  } else if (event.key === 'Tab') {
    const controls = [...dialog.value.querySelectorAll('button, [tabindex="0"]')]
    if (
      event.shiftKey &&
      (document.activeElement === controls[0] || document.activeElement === heading.value)
    ) {
      event.preventDefault()
      controls.at(-1)?.focus()
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault()
      controls[0]?.focus()
    }
  }
}
onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>

<template>
  <div class="commands-overlay">
    <section
      ref="dialog"
      class="commands-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rootkit-commands-title"
      aria-describedby="commands-status"
      @keydown="dialogKey"
    >
      <header class="commands-header">
        <div>
          <span>{{ COMMAND_REFERENCE.length }} available commands</span>
          <h3 id="rootkit-commands-title" ref="heading" tabindex="-1">Command reference</h3>
        </div>
        <button
          type="button"
          class="commands-close"
          aria-label="Close command reference"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div class="commands-body" tabindex="0" role="region" aria-label="Scrollable command list">
        <p id="commands-status" class="commands-status">
          {{
            inMission
              ? 'Mission paused while you look things up. Your terminal and progress are preserved.'
              : 'Keep this handy. Open Commands anytime during the mission.'
          }}
        </p>
        <CommandReference />
      </div>
      <footer class="commands-footer">
        <span>Type <code>help</code> for a terminal version.</span
        ><button type="button" @click="emit('close')">Return to game</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.commands-overlay {
  position: absolute;
  inset: 0;
  z-index: 11000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--rk-bg) 93%, transparent);
}
.commands-dialog {
  display: flex;
  flex-direction: column;
  width: min(100%, 720px);
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--rk-border);
  border-radius: 12px;
  background: var(--rk-window-bg);
  color: var(--rk-text);
  box-shadow: 0 18px 60px #0004;
}
.commands-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: none;
  gap: 16px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--rk-border);
}
.commands-header > div > span {
  color: var(--rk-muted);
  font-size: 11px;
}
.commands-header h3 {
  margin: 5px 0 0;
  color: var(--rk-text);
  font: 600 26px/1.2 var(--bs-body-font-family);
  letter-spacing: -0.025em;
}
.commands-header h3:focus {
  outline: none;
}
.commands-dialog button {
  cursor: pointer;
  touch-action: manipulation;
}
.commands-close {
  flex: none;
  width: 40px;
  height: 40px;
  border: 1px solid var(--rk-border);
  border-radius: 5px;
  background: transparent;
  color: var(--rk-muted);
  font: 22px var(--bs-font-monospace);
}
.commands-close:hover {
  border-color: var(--rk-accent);
  color: var(--rk-accent);
}
.commands-body {
  min-height: 0;
  padding: 20px 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--rk-border) transparent;
}
.commands-status {
  margin: 0 0 18px;
  color: var(--rk-accent);
  font: 12px/1.65 var(--bs-body-font-family);
}
.commands-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  gap: 16px;
  padding: 12px 24px;
  border-top: 1px solid var(--rk-border);
  background: var(--rk-bg);
}
.commands-footer > span {
  color: var(--rk-muted);
  font: 12px/1.5 var(--bs-body-font-family);
}
.commands-footer code {
  color: var(--rk-accent);
}
.commands-footer button {
  flex: none;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--rk-accent);
  border-radius: 5px;
  background: var(--rk-accent);
  color: var(--rk-bg);
  font: 600 12px var(--bs-font-monospace);
}
.commands-footer button:hover {
  filter: brightness(1.12);
}
.commands-dialog button:focus-visible,
.commands-body:focus-visible {
  outline: 2px solid var(--rk-accent);
  outline-offset: -3px;
}
@media (max-width: 767px) {
  .commands-overlay {
    padding: 8px;
  }
  .commands-header {
    padding: 16px;
    gap: 8px;
  }
  .commands-header h3 {
    font-size: 23px;
  }
  .commands-header > div > span {
    font-size: 10px;
  }
  .commands-body {
    padding: 16px;
  }
  .commands-footer {
    gap: 8px;
    padding: 12px 16px;
  }
  .commands-footer > span {
    font-size: 11px;
  }
  .commands-footer button {
    font-size: 11px;
    padding: 8px 10px;
  }
}
</style>
