<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — help request form
//  The two kinds of help (decision H-14). Question help sends only the hint
//  type, because the view has already picked the challenge and question.
//  General class help also needs the code snippet and the expected and actual
//  behavior. The hint types and what each one means are always on show, since
//  asking for the right kind of hint is the point of the form.
//  The hint types live in config/hintTypes.js, which the mentor's panel reads too.
// ════════════════════════════════════════════════════════════════════
import { reactive, useId } from 'vue'
import { hintTypes } from '@/config/hintTypes.js'
const props = defineProps({
  kind: { type: String, default: 'question' }, // 'question' or 'general'
  contextId: String, // the challenge for question help, the classroom for general help
  questionId: String,
  busy: Boolean,
})
const emit = defineEmits(['submit'])
const id = useId()
const fields = {
  codeSnippet: 'Code snippet',
  expectedBehaviour: 'Expected behavior',
  actualBehaviour: 'Actual behavior',
}
const form = reactive({
  codeSnippet: '',
  expectedBehaviour: '',
  actualBehaviour: '',
  hintType: '',
})

function onSubmit() {
  if (props.busy) return
  if (props.kind === 'general') {
    emit('submit', {
      contextType: 'classroom',
      contextId: props.contextId,
      codeSnippet: form.codeSnippet,
      expectedBehaviour: form.expectedBehaviour,
      actualBehaviour: form.actualBehaviour,
      hintType: form.hintType,
    })
  } else {
    emit('submit', {
      contextType: 'challenge',
      contextId: props.contextId,
      questionId: props.questionId,
      hintType: form.hintType,
    })
  }
}
</script>
<template>
  <form @submit.prevent="onSubmit">
    <fieldset :disabled="busy">
      <div v-if="kind === 'general'" class="row g-3 mb-3">
        <div
          v-for="(label, key) in fields"
          :key="key"
          :class="key === 'codeSnippet' ? 'col-12' : 'col-md-6'"
        >
          <label :for="id + key" class="form-label">
            {{ label }} <span class="fw-normal text-body-secondary">(required)</span>
          </label>
          <textarea
            :id="id + key"
            v-model="form[key]"
            class="form-control"
            :class="{ 'font-monospace': key === 'codeSnippet' }"
            :rows="key === 'codeSnippet' ? 6 : 3"
            required
          ></textarea>
        </div>
      </div>
      <fieldset class="mb-3">
        <legend class="form-label fs-6 fw-semibold">
          What kind of hint do you want?
          <span class="fw-normal text-body-secondary">(required)</span>
        </legend>
        <div v-for="hint in hintTypes" :key="hint.value" class="form-check le-hint-choice">
          <input
            :id="id + hint.value"
            v-model="form.hintType"
            class="form-check-input"
            type="radio"
            :name="id + '-hint'"
            :value="hint.value"
            required
          />
          <label :for="id + hint.value" class="form-check-label">
            <span class="fw-semibold">{{ hint.value }}</span>
            <span class="d-block form-text mt-0">{{ hint.ask }}</span>
          </label>
        </div>
      </fieldset>
      <p v-if="kind === 'question'" class="form-text">
        If you've answered this question wrong, your mentor also sees your last answer.
      </p>
      <button class="btn btn-primary">Submit help request</button>
    </fieldset>
  </form>
</template>
