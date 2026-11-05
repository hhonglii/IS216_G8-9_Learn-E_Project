<template>
  <section class="game-loading" role="status" aria-live="polite" aria-atomic="true">
    <span class="loading-marker" aria-hidden="true"></span>
    <p>Loading game…</p>
  </section>
</template>

<style scoped>
.game-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 22rem;
  padding: 2rem;
  border: 1px solid #2a3446;
  border-radius: 12px;
  background: #0b0e14;
  color: #eaf0f9;
  font-family: var(--bs-body-font-family);
}
.game-loading p {
  margin: 0;
}
.loading-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00f0ff;
  box-shadow: 0 0 12px #00f0ff33;
}
</style>
