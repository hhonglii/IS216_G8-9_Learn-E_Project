<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — join classroom form
//  Collects one code and emits it; DashboardView sends it and shows the result.
//  The wrapper argument is a string; the HTTP body it builds is
//  { "joinCode": "DEMO-CODE" }. Those are different things.
// ════════════════════════════════════════════════════════════════════
import { ref, useId } from 'vue'
// problem: the server's message about the code (wrong or blank), shown under the field.
defineProps({ busy: Boolean, problem: { type: String, default: '' } })
defineEmits(['join'])
const code = ref('')
const id = useId()
// code is a ref: use code.value in JavaScript, but code in this template.
// useId gives this rendered form a label/input ID; it is not a database record ID.
// @submit.prevent stops the browser's normal form navigation. The join event carries
// one trimmed string. In the parent, @join receives that string as $event.
// The parent calls classroomsApi.joinClassroom(code), passes busy while awaiting it,
// and shows the server's error. Trimming input does not validate the join code.
// Verify: one submit emits the trimmed code; busy blocks submission; an API failure
// is handled by the parent without clearing what the learner typed.
</script>
<template>
  <form @submit.prevent="!busy && $emit('join', code.trim())">
    <label :for="id">Classroom join code</label
    ><input
      :id="id"
      v-model="code"
      class="form-control"
      :class="{ 'is-invalid': problem }"
      :disabled="busy"
      :aria-invalid="problem ? 'true' : undefined"
      :aria-describedby="problem ? `${id}-error` : undefined"
    />
    <p v-if="problem" :id="`${id}-error`" class="invalid-feedback d-block mb-0" role="alert">
      {{ problem }}
    </p>
    <button class="btn btn-primary mt-2" :disabled="busy">Join classroom</button>
  </form>
</template>
