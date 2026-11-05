<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — classroom card
//  Shows one classroom and emits open with classroom.id. The name is
//  interpolated, so Vue escapes it (the component test proves it); do not
//  switch it to v-html to make markup render.
// ════════════════════════════════════════════════════════════════════
import { coverFor } from '../../config/covers.js'
defineProps({ classroom: { type: Object, default: () => ({}) } })
defineEmits(['open'])
</script>
<template>
  <article class="card le-card-interactive le-course-card h-100">
    <div class="le-cover le-cover--card" aria-hidden="true">
      <div
        class="le-cover-art"
        :style="{ backgroundImage: `url('${coverFor(classroom.coverId).file}')` }"
      ></div>
    </div>
    <div class="card-body d-flex flex-column align-items-start">
      <h3 class="card-title h5">{{ classroom.name }}</h3>
      <p v-if="classroom.description" class="text-body-secondary">{{ classroom.description }}</p>
      <p v-if="classroom.joinCode" class="le-chip le-chip-code">
        Join code: {{ classroom.joinCode }}
      </p>
      <!-- stretched-link makes this one button the click target for the whole
           card, so there is still a single focusable control and one emit. -->
      <button
        class="btn btn-outline-primary stretched-link mt-auto"
        type="button"
        @click="$emit('open', classroom.id)"
      >
        Open classroom<span class="visually-hidden">: {{ classroom.name }}</span>
      </button>
    </div>
  </article>
</template>
