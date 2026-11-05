<script setup>
// Generate draft questions from a topic or the professor's code. Nothing goes live
// from here: each one arrives as a draft that must be approved before publishing.
import { computed, ref } from 'vue'
import * as classroomGamesApi from '@/services/classroomGamesApi.js'
import { questionFromDraft } from '@/utils/bossBattleEditor.js'
import InfoTip from '@/components/shared/InfoTip.vue'
import { commonLanguages, languageHint } from '@/config/languages.js'

const props = defineProps({
  classroomId: { type: String, required: true },
  spaceLeft: { type: Number, required: true },
  errorMessage: { type: Function, required: true },
})
const emit = defineEmits(['add', 'close'])

const topic = ref('')
const language = ref('')
const code = ref('')
const count = ref(5)
const busy = ref(false)
const error = ref('')
const countChoices = computed(() =>
  Array.from({ length: Math.min(10, props.spaceLeft) }, (_, index) => index + 1),
)
const canGenerate = computed(
  () => !busy.value && props.spaceLeft > 0 && !!(topic.value.trim() || code.value.trim()),
)

async function generate() {
  busy.value = true
  error.value = ''
  try {
    const { data } = await classroomGamesApi.draftGameQuestions(props.classroomId, {
      topic: topic.value,
      language: language.value,
      code: code.value,
      count: Math.min(count.value, props.spaceLeft),
    })
    emit('add', data.questions.map(questionFromDraft))
  } catch (err) {
    error.value = props.errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="le-subpanel mb-3">
    <h3 class="h6">Generate with AI</h3>
    <p class="form-text mt-0">
      Generated questions are drafts. You check and approve each one before you can publish.
    </p>
    <div class="row g-2 mb-2">
      <div class="col-sm-8">
        <label for="game-topic" class="form-label">Topic</label>
        <InfoTip topic="generateTopic" />
        <input
          id="game-topic"
          v-model="topic"
          class="form-control"
          maxlength="500"
          placeholder="For example, Python loops"
        />
      </div>
      <div class="col-6 col-sm-2">
        <label for="game-language" class="form-label">Language</label>
        <InfoTip topic="generateLanguage" />
        <input
          id="game-language"
          v-model="language"
          class="form-control"
          maxlength="100"
          list="game-language-options"
          autocomplete="off"
          aria-describedby="game-language-hint"
        />
        <datalist id="game-language-options">
          <option v-for="choice in commonLanguages" :key="choice" :value="choice" />
        </datalist>
        <p id="game-language-hint" class="form-text mb-0">{{ languageHint }}</p>
      </div>
      <div class="col-6 col-sm-2">
        <label for="game-count" class="form-label">How many</label>
        <InfoTip topic="generateCount" />
        <select id="game-count" v-model.number="count" class="form-select">
          <option v-for="choice in countChoices" :key="choice" :value="choice">{{ choice }}</option>
        </select>
      </div>
    </div>
    <label for="game-source-code" class="form-label">Your code (optional)</label>
    <InfoTip topic="generateCode" />
    <textarea
      id="game-source-code"
      v-model="code"
      class="form-control game-source mb-2"
      rows="3"
      maxlength="4000"
      spellcheck="false"
    />
    <p v-if="error" role="alert" class="game-problem small mb-2">{{ error }}</p>
    <div class="d-flex flex-wrap gap-2">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="!canGenerate"
        @click="generate"
      >
        {{ busy ? 'Generating…' : 'Generate questions' }}
      </button>
      <button type="button" class="btn btn-outline-secondary btn-sm" @click="emit('close')">
        Close
      </button>
    </div>
  </div>
</template>

<style scoped>
.game-problem {
  color: var(--le-danger);
}
.game-source {
  font-family: var(--bs-font-monospace);
  font-size: 0.875rem;
}
</style>
