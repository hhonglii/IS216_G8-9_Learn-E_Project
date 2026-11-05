<script setup>
// Presentational icon for UI refresh 3. It draws one icon from config/icons.js,
// or nothing for a name it does not know. Always decorative: the text beside it
// names the control.
import { iconPaths } from '../../config/icons.js'

defineProps({ name: { type: String, required: true } })
</script>

<template>
  <svg
    v-if="Object.hasOwn(iconPaths, name)"
    class="le-icon"
    viewBox="0 0 16 16"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="d in iconPaths[name]" :key="d" :d="d" />
  </svg>
</template>
