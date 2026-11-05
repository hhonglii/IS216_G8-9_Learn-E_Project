<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — applied case form
//  Reports typing through update:modelValue and asks to save through submit.
//  The disabled prop is a courtesy, never a permission check: the server
//  decides whether the diagnosis may be saved.
// ════════════════════════════════════════════════════════════════════
import { useId } from 'vue'
defineProps({
  appliedCase: { type: [String, Object], default: '' },
  modelValue: { type: String, default: '' },
  disabled: Boolean,
  // True once a diagnosis has been sent, so the button says it updates that one
  // (UX audit 28).
  sent: Boolean,
})
// Two separate events: update:modelValue reports typing; submit requests persistence.
// The parent passes the latest text back as modelValue, so props are never mutated here.
// disabled prevents UI submissions while pending. The server still checks caller,
// ownership and allowed review state; a button flag cannot establish those rules.
defineEmits(['update:modelValue', 'submit'])
const id = useId()
</script>
<template>
  <form @submit.prevent="!disabled && $emit('submit', modelValue)">
    <p class="le-callout">
      {{ typeof appliedCase === 'string' ? appliedCase : appliedCase.prompt }}
    </p>
    <label :for="id" class="form-label">Diagnosis and proposed repair</label
    ><textarea
      :id="id"
      class="form-control"
      rows="5"
      :value="modelValue"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.target.value)"
    ></textarea
    ><button class="btn btn-primary mt-3" :disabled="disabled">
      {{ sent ? 'Update diagnosis' : 'Submit diagnosis' }}
    </button>
  </form>
</template>
