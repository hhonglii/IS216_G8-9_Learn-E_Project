<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — error summary (UX audit item 4)
//  Lists everything that stopped a save, publish or submit in one Bootstrap
//  alert, and each item is a plain #id link to its field. Pages place it just
//  above the button that was pressed, so it appears where the person is
//  looking, and role="alert" reads it out to screen readers.
// ════════════════════════════════════════════════════════════════════
import { useId } from 'vue'

const props = defineProps({
  heading: { type: String, default: 'There is a problem' },
  intro: { type: String, default: '' }, // what to do once the list is fixed
  listLabel: { type: String, default: undefined }, // the list's accessible name
  // Plain strings, or { message, field } where idFor(field) names the field's id.
  problems: { type: Array, default: () => [] },
  idFor: { type: Function, default: () => '' },
})
const headingId = useId()

const asItem = (problem) => (typeof problem === 'string' ? { message: problem } : problem)
const linkFor = (problem) => (problem.field ? props.idFor(problem.field) : '')
</script>

<template>
  <div
    v-if="problems.length"
    class="alert alert-danger le-error-summary"
    role="alert"
    :aria-labelledby="headingId"
  >
    <h3 :id="headingId" class="h6">{{ heading }}</h3>
    <p v-if="intro" class="mb-2">{{ intro }}</p>
    <ul class="mb-0" :aria-label="listLabel">
      <li v-for="(problem, index) in problems.map(asItem)" :key="index">
        <a v-if="linkFor(problem)" :href="`#${linkFor(problem)}`">{{ problem.message }}</a>
        <template v-else>{{ problem.message }}</template>
      </li>
    </ul>
  </div>
</template>
