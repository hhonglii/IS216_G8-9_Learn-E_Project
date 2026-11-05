<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — empty state card
//  What a page shows when a list has nothing in it yet: a title, a line saying
//  why, and a slot for a button that helps (such as Join a classroom).
// ════════════════════════════════════════════════════════════════════
import AppIcon from './AppIcon.vue'
defineProps({ title: String, message: String })
</script>
<template>
  <section class="card le-empty">
    <div class="card-body">
      <span class="le-section-icon" aria-hidden="true"><AppIcon name="empty" /></span>
      <h3 class="h5">{{ title }}</h3>
      <p class="text-body-secondary mb-0">{{ message }}</p>
      <slot />
    </div>
  </section>
</template>
