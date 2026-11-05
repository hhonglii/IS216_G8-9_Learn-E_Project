<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — locate-fault question
//  Two dropdowns from one options list: ids starting "line-" are line choices
//  and ids starting "category-" are error categories. Emits one merged object
//  with both chosen ids, so either half can still be empty; the server rejects
//  an answer missing either half rather than marking it.
// ════════════════════════════════════════════════════════════════════
import { computed, useId } from 'vue'
const props = defineProps({
  question: { type: Object, default: () => ({}) },
  modelValue: { type: Object, default: () => ({}) },
})
defineEmits(['update:modelValue'])
const id = useId()
const lines = computed(() =>
  (props.question.options ?? []).filter((option) => option.id?.startsWith('line-')),
)
const categories = computed(() =>
  (props.question.options ?? []).filter((option) => option.id?.startsWith('category-')),
)
</script>
<template>
  <fieldset>
    <legend class="fs-6 fw-semibold le-request-text">{{ question.prompt }}</legend>
    <label :for="id + '-location'" class="form-label">Line or region</label
    ><select
      :id="id + '-location'"
      class="form-select mb-3"
      :value="modelValue?.location ?? ''"
      @change="$emit('update:modelValue', { ...modelValue, location: $event.target.value })"
    >
      <option value="" disabled>Select a line</option>
      <option v-for="option in lines" :key="option.id" :value="option.id">
        {{ option.label }}
      </option></select
    ><label :for="id + '-category'" class="form-label">Error category</label
    ><select
      :id="id + '-category'"
      class="form-select"
      :value="modelValue?.category ?? ''"
      @change="$emit('update:modelValue', { ...modelValue, category: $event.target.value })"
    >
      <option value="" disabled>Select a category</option>
      <option v-for="option in categories" :key="option.id" :value="option.id">
        {{ option.label }}
      </option>
    </select>
  </fieldset>
</template>
