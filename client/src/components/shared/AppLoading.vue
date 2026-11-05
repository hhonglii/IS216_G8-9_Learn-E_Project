<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — loading placeholder
//  The label a screen reader announces, plus grey skeleton bars while a page
//  waits for the server.
// ════════════════════════════════════════════════════════════════════
defineProps({ label: { type: String, default: 'Loading' } })
</script>
<template>
  <div class="le-loading">
    <p role="status" class="le-loading-label">{{ label }}</p>
    <div class="le-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
  </div>
</template>
