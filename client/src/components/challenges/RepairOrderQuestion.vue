<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — repair-order question
//  Move up and Move down reorder the steps, by mouse or keyboard; there is
//  no drag and drop. Every move emits the whole list of step ids, and on
//  mount it emits the starting order if none was chosen, so submitting
//  untouched still sends every step once. The server rejects a missing or
//  repeated step. The moves off either end use aria-disabled, not disabled,
//  so a button that just reached the end keeps focus.
// ════════════════════════════════════════════════════════════════════
import { computed, onMounted, onUpdated, useId } from 'vue'
const props = defineProps({
  question: { type: Object, default: () => ({}) },
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])
const order = computed(() => {
  if (props.modelValue.length) {
    return props.modelValue
  } else {
    return (props.question.options ?? []).map((step) => step.id)
  }
})

// Vue moves the row of the step that goes up, and the browser drops focus
// from a moved element, so after each move the pressed button is focused
// again by id. The useId prefix keeps two questions on a page apart.
const uid = useId()
let focusAfterMove = ''

onUpdated(() => {
  if (focusAfterMove) {
    document.getElementById(focusAfterMove)?.focus()
    focusAfterMove = ''
  }
})

onMounted(() => {
  if (props.modelValue.length === 0) {
    emit('update:modelValue', order.value)
  }
})

function labelOf(id) {
  return props.question.options?.find((step) => step.id === id)?.label || id
}

function move(index, offset) {
  const other = index + offset
  if (other < 0 || other >= order.value.length) {
    return
  }
  const copy = [...order.value]
  const temp = copy[index]
  copy[index] = copy[other]
  copy[other] = temp
  focusAfterMove = `${uid}-${offset < 0 ? 'up' : 'down'}-${copy[other]}`
  emit('update:modelValue', copy)
}
</script>
<template>
  <fieldset>
    <legend class="fs-6 fw-semibold le-request-text">{{ question.prompt }}</legend>
    <ol class="mb-3">
      <li v-for="(stepId, index) in order" :key="stepId">
        <div class="le-step-row">
          <span class="le-step-label">{{ labelOf(stepId) }}</span>
          <span class="le-step-moves">
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :id="`${uid}-up-${stepId}`"
              :aria-disabled="index === 0"
              @click="move(index, -1)"
            >
              Move up<span class="visually-hidden">: {{ labelOf(stepId) }}</span>
            </button>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :id="`${uid}-down-${stepId}`"
              :aria-disabled="index === order.length - 1"
              @click="move(index, 1)"
            >
              Move down<span class="visually-hidden">: {{ labelOf(stepId) }}</span>
            </button>
          </span>
        </div>
      </li>
    </ol>
  </fieldset>
</template>
