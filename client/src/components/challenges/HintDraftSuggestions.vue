<script setup>
// B9c suggestion panel; the owning page saves chosen hints.
import { useId } from 'vue'
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  busy: Boolean,
  disabled: Boolean,
  error: { type: String, default: '' },
})
const emit = defineEmits(['suggest', 'update:modelValue', 'use-hint'])
const inputId = useId()
function editSuggestion(index, value) {
  emit(
    'update:modelValue',
    props.modelValue.map((hint, position) => (position === index ? value : hint)),
  )
}
</script>
<template>
  <section aria-label="Hint suggestions" class="le-block pt-3 mt-3">
    <h4 class="h6">Hint suggestions</h4>
    <p class="text-body-secondary">
      The last saved draft text is sent to Google Gemini to suggest hints. Answers, explanations and
      student data are excluded.
    </p>
    <button
      type="button"
      class="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2"
      :disabled="disabled || busy"
      @click="emit('suggest')"
    >
      <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M7 1.5l1.2 3.3 3.3 1.2-3.3 1.2L7 10.5 5.8 7.2 2.5 6l3.3-1.2zM12 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"
        />
      </svg>
      Suggest hints
    </button>
    <p v-if="busy" class="text-body-secondary mt-2 mb-0" role="status">Suggesting hints...</p>
    <div v-if="error" class="mt-2">
      <p class="text-danger" role="alert">{{ error }}</p>
      <p class="text-body-secondary">
        Your existing hints are kept. You can still add and save hints manually.
      </p>
      <button
        type="button"
        class="btn btn-outline-primary btn-sm"
        :disabled="disabled || busy"
        @click="emit('suggest')"
      >
        Try again
      </button>
    </div>
    <template v-if="modelValue.length">
      <p class="text-body-secondary mt-3">
        Edit a suggestion, then choose Use suggestion to add it to your hints. Save changes to keep
        the hints you choose.
      </p>
      <div v-for="(hint, index) in modelValue" :key="index" class="mb-3">
        <label :for="`${inputId}-suggestion-${index}`" class="form-label"
          >Hint suggestion {{ index + 1 }}</label
        >
        <textarea
          :id="`${inputId}-suggestion-${index}`"
          class="form-control"
          rows="2"
          :value="hint"
          :disabled="disabled || busy"
          @input="editSuggestion(index, $event.target.value)"
        />
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm mt-2"
          :disabled="disabled || busy || !hint.trim()"
          @click="emit('use-hint', hint)"
        >
          Use suggestion {{ index + 1 }}
        </button>
      </div>
    </template>
  </section>
</template>
