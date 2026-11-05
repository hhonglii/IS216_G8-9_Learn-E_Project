<script setup>
import { RouterLink } from 'vue-router'

// Keep the loader's technical error details out of the rendered DOM.
defineOptions({ inheritAttrs: false })

function reloadGame() {
  window.location.reload()
}
</script>

<template>
  <section class="game-load-error" role="alert">
    <div class="error-content">
      <span class="error-marker" aria-hidden="true">!</span>
      <h2>Game could not load</h2>
      <p>Check your connection and reload to try again.</p>
      <div class="error-actions">
        <button type="button" @click="reloadGame">Reload game</button>
        <RouterLink :to="{ name: 'take-a-break' }">Back to game library</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.game-load-error {
  display: grid;
  place-items: center;
  min-height: 22rem;
  padding: 2rem;
  border: 1px solid #2a3446;
  border-radius: 12px;
  background: #0b0e14;
  color: #eaf0f9;
  font-family: var(--bs-body-font-family);
  text-align: center;
}
.error-content {
  max-width: 30rem;
}
.error-marker {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin: 0 auto 1rem;
  border: 1px solid #ffb800;
  border-radius: 8px;
  color: #ffb800;
  font: 600 1.25rem var(--bs-font-monospace);
}
.game-load-error h2 {
  margin: 0 0 0.65rem;
  font-size: clamp(1.3rem, 4vw, 1.65rem);
  text-wrap: balance;
}
.game-load-error p {
  margin: 0;
  color: #a2b0c5;
  line-height: 1.6;
}
.error-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-top: 1.5rem;
}
.error-actions button,
.error-actions a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.6rem 0.85rem;
  border-radius: 5px;
  font: inherit;
  font-size: 0.875rem;
  touch-action: manipulation;
}
.error-actions button {
  border: 1px solid #00f0ff;
  background: #00d6e5;
  color: #04252e;
  font-weight: 600;
  cursor: pointer;
}
.error-actions button:hover {
  background: #72f7ff;
}
.error-actions a {
  color: #a2b0c5;
  text-decoration: none;
}
.error-actions a:hover {
  color: #eaf0f9;
  text-decoration: underline;
}
.error-actions button:focus-visible,
.error-actions a:focus-visible {
  outline: 2px solid #00f0ff;
  outline-offset: 4px;
}
</style>
