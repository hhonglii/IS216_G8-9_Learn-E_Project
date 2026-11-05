<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — (i) button beside a label (UX audit item 1)
//  Says what a field is for or what a term means. Pressing it shows the text
//  on the line below; pressing it again hides it. Rules a person must follow
//  to succeed belong in visible hint text instead, because this can be closed.
//  It sits beside the label, never inside it, so clicking the label still
//  focuses the field.
// ════════════════════════════════════════════════════════════════════
import { computed, ref, useId } from 'vue'
import AppIcon from './AppIcon.vue'
import { fieldHelp } from '../../config/fieldHelp.js'

const props = defineProps({
  // A key of config/fieldHelp.js, which holds the label and the text.
  topic: { type: String, required: true },
})
const open = ref(false)
const textId = useId()
const help = computed(() => fieldHelp[props.topic] ?? { label: props.topic, text: '' })
</script>

<template>
  <button
    type="button"
    class="btn btn-link le-infotip"
    :aria-label="`About ${help.label}`"
    :aria-expanded="open ? 'true' : 'false'"
    :aria-controls="textId"
    @click="open = !open"
  >
    <AppIcon name="info" />
  </button>
  <span v-if="open" :id="textId" class="form-text le-infotip-text">{{ help.text }}</span>
</template>
