<script setup>
// One question in the editor. Clicking the circle beside an answer marks it correct,
// and answer rows left blank are simply not offered to students. The prompt box's
// id is built from the question's id, so the editor can link straight to it.
import { computed, useId } from 'vue'
import { questionProblems } from '@/utils/bossBattleEditor.js'
import InfoTip from '@/components/shared/InfoTip.vue'

const props = defineProps({
  question: { type: Object, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
})
const emit = defineEmits(['update', 'move', 'duplicate', 'remove', 'add-next'])
const uid = useId()

// The approval callout above already covers needsReview.
const problems = computed(() => questionProblems({ ...props.question, needsReview: false }))

// The code box grows with the code, so a professor can read it all while editing.
const codeRows = computed(() => Math.min(14, Math.max(3, props.question.code.split('\n').length)))

function changeOption(id, label) {
  emit('update', {
    options: props.question.options.map((option) =>
      option.id === id ? { ...option, label } : option,
    ),
  })
}
</script>

<template>
  <fieldset
    :id="`game-question-${question.id}`"
    class="le-block mb-3"
    :class="{ 'game-card--draft': question.needsReview }"
    @keydown.ctrl.enter.prevent="emit('add-next')"
    @keydown.meta.enter.prevent="emit('add-next')"
  >
    <legend>Question {{ index + 1 }}</legend>

    <div class="d-flex flex-wrap gap-2 mb-3">
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="index === 0"
        :aria-label="`Move question ${index + 1} up`"
        @click="emit('move', -1)"
      >
        Move up
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="index === total - 1"
        :aria-label="`Move question ${index + 1} down`"
        @click="emit('move', 1)"
      >
        Move down
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :aria-label="`Duplicate question ${index + 1}`"
        @click="emit('duplicate')"
      >
        Duplicate
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm"
        :aria-label="`Remove question ${index + 1}`"
        @click="emit('remove')"
      >
        Remove
      </button>
    </div>

    <div v-if="question.needsReview" class="le-callout mb-3">
      <p class="mb-2">
        <strong>Generated draft.</strong> Check the correct answer and explanation yourself, because
        generated answers can be wrong.
      </p>
      <button
        type="button"
        class="btn btn-outline-primary btn-sm"
        :aria-label="`Approve question ${index + 1}`"
        @click="emit('update', { needsReview: false })"
      >
        Approve this question
      </button>
    </div>

    <label :for="`${uid}-code`" class="form-label">Code (optional)</label>
    <InfoTip topic="gameCode" />
    <textarea
      :id="`${uid}-code`"
      class="form-control game-code-input mb-3"
      :rows="codeRows"
      maxlength="4000"
      spellcheck="false"
      :value="question.code"
      @input="emit('update', { code: $event.target.value })"
    />

    <label :for="`game-question-${question.id}-prompt`" class="form-label">Question</label>
    <InfoTip topic="gameQuestion" />
    <textarea
      :id="`game-question-${question.id}-prompt`"
      class="form-control mb-3"
      rows="2"
      maxlength="1000"
      :value="question.prompt"
      @input="emit('update', { prompt: $event.target.value })"
    />

    <div class="mb-3" role="radiogroup" :aria-label="`Answers for question ${index + 1}`">
      <p class="form-label mb-1">Answers</p>
      <InfoTip topic="gameAnswers" />
      <p class="form-text mt-0 mb-2">
        Click the circle beside the correct answer. Leave rows you do not need empty.
      </p>
      <div v-for="(option, row) in question.options" :key="option.id" class="game-answer-row">
        <input
          :id="`${uid}-correct-${option.id}`"
          class="form-check-input"
          type="radio"
          :name="`${uid}-correct`"
          :checked="question.correctOptionId === option.id"
          :aria-label="`Answer ${row + 1} is correct`"
          @change="emit('update', { correctOptionId: option.id })"
        />
        <input
          class="form-control"
          maxlength="500"
          :aria-label="`Answer ${row + 1}`"
          :value="option.label"
          @input="changeOption(option.id, $event.target.value)"
        />
      </div>
      <div class="form-check mt-2">
        <input
          :id="`${uid}-keep-order`"
          class="form-check-input"
          type="checkbox"
          :checked="question.keepOrder"
          @change="emit('update', { keepOrder: $event.target.checked })"
        />
        <label :for="`${uid}-keep-order`" class="form-check-label">
          Keep this order (for answers like "All of the above")
        </label>
        <InfoTip topic="gameKeepOrder" />
      </div>
    </div>

    <label :for="`${uid}-why`" class="form-label">Why? (shown after a right answer)</label>
    <InfoTip topic="gameWhy" />
    <textarea
      :id="`${uid}-why`"
      class="form-control"
      rows="2"
      maxlength="2000"
      :value="question.explanation"
      @input="emit('update', { explanation: $event.target.value })"
    />

    <p v-if="problems.length" class="form-text mt-2 mb-0">Still {{ problems.join(', ') }}.</p>
  </fieldset>
</template>

<style scoped>
.game-answer-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.game-answer-row .form-check-input {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0;
}
.game-code-input {
  font-family: var(--bs-font-monospace);
  font-size: 0.875rem;
}
.game-card--draft {
  border-color: var(--section-accent);
}
</style>
