<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — predict-output question
//  Renders the options and emits the chosen option id; the server marks it.
//  The emitted value is always a DOM string, so option ids must stay strings
//  in the DTO, the submission and the comparison.
// ════════════════════════════════════════════════════════════════════
import { useId } from 'vue'
defineProps({
  question: { type: Object, default: () => ({}) },
  modelValue: { type: [String, Number], default: '' },
})
// The select emits a proposed value for parent-owned answer state; it does not score.
// This handler reads the DOM target.value, which is a string. The team must agree
// option ID types across the question DTO, submitted answer and server comparison.
// A disabled/hidden answer in the UI would not protect an answer key in network JSON.
defineEmits(['update:modelValue'])
const id = useId()
</script>
<template>
  <fieldset>
    <legend class="fs-6 fw-semibold le-request-text">{{ question.prompt }}</legend>
    <label :for="id" class="form-label">Predicted output</label
    ><select
      :id="id"
      class="form-select"
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option value="" disabled>Select an option</option>
      <option
        v-for="(option, index) in question.options || []"
        :key="option.id ?? index"
        :value="option.id ?? option"
      >
        {{ option.label ?? option }}
      </option>
    </select>
  </fieldset>
</template>
