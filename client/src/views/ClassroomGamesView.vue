<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — Classroom Games
//  The server says who is looking. The owning professor gets the editor, and a
//  student gets the published battle or a "no classroom game" message.
// ════════════════════════════════════════════════════════════════════
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as classroomGamesApi from '@/services/classroomGamesApi.js'
import AppLoading from '@/components/shared/AppLoading.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { apiErrorMessage } from '@/utils/apiError.js'
import BossBattle from '@/components/classroom-games/BossBattle.vue'
import BossBattleEditor from '@/components/classroom-games/BossBattleEditor.vue'

const route = useRoute()
const classroomId = computed(() => route.params.classroomId)

const page = ref(null)
const loading = ref(false)
const loadError = ref('')
const loadCount = ref(0)
const notice = ref('')

// Handed to the editor and the battle so every message on this page reads alike.
const errorMessage = (err) => apiErrorMessage(err)

let latestLoad = 0
async function load() {
  const thisLoad = ++latestLoad
  loading.value = true
  loadError.value = ''
  try {
    const result = await classroomGamesApi.getClassroomGame(classroomId.value)
    if (thisLoad !== latestLoad) return
    page.value = result.data
    loadCount.value++
  } catch (err) {
    if (thisLoad !== latestLoad) return
    page.value = null
    loadError.value = errorMessage(err)
  } finally {
    if (thisLoad === latestLoad) loading.value = false
  }
}

watch(
  classroomId,
  () => {
    page.value = null
    notice.value = ''
    if (classroomId.value) load()
  },
  { immediate: true },
)

async function onStale() {
  notice.value = 'This battle changed, so it has been reloaded.'
  await load()
}

const studentEngine = computed(() => ({
  start: async () => (await classroomGamesApi.startGamePlay(classroomId.value)).data.play,
  answer: async (playId, questionId, optionId, answerCount) =>
    (await classroomGamesApi.answerGamePlay(playId, questionId, optionId, answerCount)).data,
}))
</script>

<template>
  <section aria-labelledby="classroom-games-heading">
    <header class="mb-4">
      <!-- The classroom page is the only way in since H-20, so link back to it (fifth pass W8) -->
      <RouterLink class="le-back-link" :to="{ name: 'classroom', params: { classroomId } }">
        <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
        Back to classroom
      </RouterLink>
      <h1 id="classroom-games-heading" class="le-page-title le-title-dot">Classroom games</h1>
      <p v-if="page" class="text-body-secondary mb-0">
        {{
          page?.viewer === 'professor'
            ? 'Build a boss battle for your class. You write the questions, and the game does the rest.'
            : 'Practise with a boss battle set by your professor. It has no effect on your grades.'
        }}
      </p>
    </header>

    <div v-if="loadError" role="alert" class="alert alert-danger le-alert-row">
      <span>{{ loadError }}</span>
      <button type="button" class="btn btn-outline-secondary btn-sm" @click="load">
        Try again
      </button>
    </div>
    <AppLoading v-else-if="loading && !page" label="Loading classroom games" />

    <template v-else-if="page">
      <p v-if="notice" role="status" class="alert alert-info">{{ notice }}</p>

      <BossBattleEditor
        v-if="page.viewer === 'professor'"
        :key="`${classroomId}-${loadCount}`"
        :classroom-id="classroomId"
        :initial-game="page.game"
        :error-message="errorMessage"
      />

      <BossBattle
        v-else-if="page.game"
        :key="`${classroomId}-${loadCount}`"
        :game="page.game"
        :engine="studentEngine"
        :initial-play="page.play"
        :already-defeated="page.defeated"
        :error-message="errorMessage"
        @stale="onStale"
      />

      <!-- Worded for both before the first publish and after an unpublish (G16). -->
      <EmptyState
        v-else
        title="No Boss Battle right now"
        message="Your professor hasn't put up a battle to play. Check back later."
      />
    </template>
  </section>
</template>
