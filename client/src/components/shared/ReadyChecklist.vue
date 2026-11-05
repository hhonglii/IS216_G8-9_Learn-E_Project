<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — "ready?" checklist (UX audit item 2)
//  Shows what an action needs before it is tried, ticking items off as the
//  page fills in. An unticked item is a plain #id link to its field, so the
//  rule and the place to meet it are one press apart.
// ════════════════════════════════════════════════════════════════════
import { computed, useId } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  heading: { type: String, required: true },
  items: { type: Array, required: true }, // { field, label, done }
  idFor: { type: Function, default: () => '' }, // field -> the id of its control
})
const headingId = useId()
const done = computed(() => props.items.filter((item) => item.done).length)
</script>

<template>
  <section class="le-checklist" :aria-labelledby="headingId">
    <h3 :id="headingId" class="h6 mb-1">{{ heading }}</h3>
    <p class="form-text mt-0 mb-2">{{ done }} of {{ items.length }} done.</p>
    <ul class="list-unstyled mb-0">
      <li
        v-for="item in items"
        :key="item.field"
        :class="item.done ? 'le-check-done' : 'le-check-todo'"
      >
        <AppIcon :name="item.done ? 'check' : 'circle'" />
        <span class="visually-hidden">{{ item.done ? 'Done: ' : 'To do: ' }}</span>
        <a v-if="!item.done && idFor(item.field)" :href="`#${idFor(item.field)}`">{{
          item.label
        }}</a>
        <span v-else>{{ item.label }}</span>
      </li>
    </ul>
  </section>
</template>
