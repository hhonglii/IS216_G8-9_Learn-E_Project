<script setup>
// Separate switches for effects and music, as in the arcade games. They are hidden
// when the browser has no audio, because the battle works the same without it.
defineProps({
  supported: { type: Boolean, required: true },
  muted: { type: Boolean, required: true },
  musicMuted: { type: Boolean, required: true },
})
defineEmits(['toggleEffects', 'toggleMusic'])
</script>

<template>
  <div v-if="supported" class="battle-sound" role="group" aria-label="Sound">
    <button
      type="button"
      class="battle-sound__button"
      aria-label="Mute sound effects"
      title="Sound effects"
      :aria-pressed="muted"
      @click="$emit('toggleEffects')"
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
    </button>
    <button
      type="button"
      class="battle-sound__button"
      aria-label="Mute music"
      title="Music"
      :aria-pressed="musicMuted"
      @click="$emit('toggleMusic')"
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
    </button>
  </div>
</template>

<style scoped>
.battle-sound {
  display: flex;
  flex: none;
  gap: 0.25rem;
}
.battle-sound__button {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  border: 1px solid var(--le-border);
  border-radius: var(--le-radius-pill);
  background: var(--le-surface);
  color: var(--le-text);
  transition:
    border-color var(--le-duration) ease,
    color var(--le-duration) ease;
}
.battle-sound__button:hover {
  border-color: var(--le-action);
  color: var(--le-action);
}
.battle-sound__button:focus-visible {
  outline: 2px solid var(--le-action);
  outline-offset: 2px;
}
.battle-sound__button[aria-pressed='true'] {
  color: var(--le-muted);
}
.battle-sound__button svg {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
