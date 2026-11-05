<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — avatar
//  A picture from the DiceBear avatar service, made from the user id so it
//  stays the same for that person. If the image can't load, the person's
//  initials show instead.
// ════════════════════════════════════════════════════════════════════
import { computed, ref } from 'vue'
const props = defineProps({
  userId: { type: String, required: true },
  displayName: { type: String, required: true },
  size: { type: String, default: '2.5rem' },
})
const src = computed(
  () => `https://api.dicebear.com/10.x/thumbs/svg?seed=${encodeURIComponent(props.userId)}`,
)
const initials = computed(() =>
  props.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase(),
)
const failed = ref(false)
</script>
<template>
  <img
    v-if="!failed"
    :src="src"
    alt=""
    class="rounded-circle flex-shrink-0"
    :style="{ width: size, height: size }"
    @error="failed = true"
  />
  <span v-else class="le-person-icon" :style="{ width: size, height: size }" aria-hidden="true">{{
    initials
  }}</span>
</template>
