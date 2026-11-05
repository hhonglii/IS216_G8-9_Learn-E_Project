<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — challenge progress display
//  Shows the counts and status it is given, which come from the server's
//  response rather than a local tally. Completion needs professor approval.
// ════════════════════════════════════════════════════════════════════
defineProps({
  current: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, default: 'Not started' },
  // The challenge page announces changes; the classroom list's rows don't need to.
  live: { type: Boolean, default: true },
})
</script>
<template>
  <div>
    <div class="le-progress" aria-hidden="true">
      <span :style="{ width: (total ? Math.min(100, (current / total) * 100) : 0) + '%' }"></span>
    </div>
    <p :role="live ? 'status' : undefined" class="mb-0">
      {{ current }} of {{ total }} questions · {{ status }}
    </p>
  </div>
</template>
