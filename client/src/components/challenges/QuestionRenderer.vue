<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — question router
//  Routes by question.type to the three structured formats, re-emits the
//  child's value as update:answer and emits submit. The applied case is not a
//  question: AppliedCaseForm handles it. Submit waits until every dropdown
//  has a choice, and the hint beside it says which one is still empty (UX
//  audit item 16); a repair order always holds every step, so it never waits.
//  A solved question shows "Solved" instead, since the server keeps it solved.
// ════════════════════════════════════════════════════════════════════
import { computed, useId } from 'vue'
import PredictOutputQuestion from './PredictOutputQuestion.vue'
import LocateFaultQuestion from './LocateFaultQuestion.vue'
import RepairOrderQuestion from './RepairOrderQuestion.vue'
const props = defineProps({
  question: { type: Object, default: () => ({}) },
  answer: { type: [String, Number, Object, Array], default: undefined },
  solved: { type: Boolean, default: false },
})
defineEmits(['update:answer', 'submit'])
const hintId = useId()
const wired = computed(() =>
  ['predict-output', 'locate-fault', 'repair-order'].includes(props.question.type),
)
const missing = computed(() => {
  const answer = props.answer
  if (props.question.type === 'predict-output') {
    return answer === undefined || answer === null || answer === ''
      ? 'Choose a predicted output to submit.'
      : ''
  }
  if (props.question.type === 'locate-fault') {
    const noLine = !answer?.location
    const noCategory = !answer?.category
    if (noLine && noCategory) return 'Choose a line and an error category to submit.'
    if (noLine) return 'Choose a line to submit.'
    if (noCategory) return 'Choose an error category to submit.'
  }
  return ''
})
// Decisions B-3/B-4/B-5: questions[] holds the three structured formats and
// Challenge.appliedCase holds one { prompt: string } object. The schema enum
// enforces the structured type list.
</script>
<template>
  <section>
    <PredictOutputQuestion
      v-if="question.type === 'predict-output'"
      :question="question"
      :model-value="answer"
      @update:model-value="$emit('update:answer', $event)"
    /><LocateFaultQuestion
      v-else-if="question.type === 'locate-fault'"
      :question="question"
      :model-value="answer"
      @update:model-value="$emit('update:answer', $event)"
    /><RepairOrderQuestion
      v-else-if="question.type === 'repair-order'"
      :question="question"
      :model-value="answer"
      @update:model-value="$emit('update:answer', $event)"
    />
    <p v-else class="text-body-secondary">
      Skeleton question: {{ question.prompt }}. This question type is not wired yet.
    </p>
    <p v-if="solved" class="text-success fw-semibold mt-3 mb-0">Solved</p>
    <div v-else class="d-flex flex-wrap align-items-center gap-2 mt-3">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!wired || !!missing"
        :aria-describedby="missing ? hintId : undefined"
        @click="$emit('submit', answer)"
      >
        Submit answer
      </button>
      <p v-if="wired && missing" :id="hintId" class="form-text m-0">{{ missing }}</p>
    </div>
  </section>
</template>
