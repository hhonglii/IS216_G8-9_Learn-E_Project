<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — alert
//  A Bootstrap alert with an icon for its variant (info, success, warning or
//  danger). It shows only while there is a message, and role="alert" reads it
//  out to screen readers.
// ════════════════════════════════════════════════════════════════════
import AppIcon from './AppIcon.vue'
defineProps({ variant: { type: String, default: 'info' }, message: String })
defineEmits(['dismiss'])
</script>
<template>
  <div v-if="message" class="alert le-alert" :class="'alert-' + variant" role="alert">
    <AppIcon
      :name="
        variant === 'success'
          ? 'check'
          : variant === 'danger' || variant === 'warning'
            ? 'warning'
            : 'info'
      "
    />
    <span class="le-alert-text">{{ message }}</span
    ><button
      type="button"
      class="btn-close"
      aria-label="Dismiss alert"
      @click="$emit('dismiss')"
    ></button>
  </div>
</template>
