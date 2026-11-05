<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — project stage panel
//  Shows one stage and emits update:evidence; MiniProjectView decides when to
//  save. Only Diagnose, Repair, Extend, Verify and Reflect exist, and the
//  server merges a save into the stored evidence. The box's id comes from the
//  stage, so an error summary can link to it, and stages a group may skip
//  say "(optional)" (UX audit items 3 and 9). The professor's instruction for
//  the stage sits under the box, so nobody scrolls up to read it (item 8).
// ════════════════════════════════════════════════════════════════════
defineProps({
  stage: String,
  instruction: { type: String, default: '' },
  evidence: { type: String, default: '' },
  readonly: Boolean,
  optional: Boolean, // submitting doesn't need this stage
  invalid: Boolean, // the last submit was refused for this stage
})
defineEmits(['update:evidence'])
</script>
<template>
  <section>
    <h3 class="h6 mt-2">{{ stage }}</h3>
    <label :for="`stage-evidence-${stage}`" class="form-label"
      >{{ stage }} evidence<template v-if="optional"> (optional)</template></label
    ><textarea
      :id="`stage-evidence-${stage}`"
      class="form-control"
      :class="{ 'is-invalid': invalid }"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="instruction ? `stage-instruction-${stage}` : undefined"
      rows="3"
      :value="evidence"
      :readonly="readonly"
      @input="!readonly && $emit('update:evidence', $event.target.value)"
    ></textarea>
    <p v-if="instruction" :id="`stage-instruction-${stage}`" class="form-text le-request-text mb-0">
      {{ instruction }}
    </p>
  </section>
</template>
