<script setup>
// The classroom's leaderboard. Totals and their tie order come from the server
// (G-6); this only shows them. The classroom page remounts it on every load, so
// it fetches once when it appears.
import { ref, onMounted, onUnmounted } from 'vue'
import { getLeaderboard } from '@/services/classroomsApi.js'
import LeaderboardTable from '../mentoring/LeaderboardTable.vue'
import AppLoading from '../shared/AppLoading.vue'
import AppAlert from '../shared/AppAlert.vue'
import { apiErrorMessage } from '@/utils/apiError.js'

const props = defineProps({
  classroomId: { type: String, required: true },
})
const leaderboard = ref([])
const leaderboardBusy = ref(false)
const leaderboardError = ref('')
let leaderboardRequest = 0
async function retrieveLeaderboard() {
  leaderboardRequest += 1
  const request = leaderboardRequest
  // a newer request, or leaving the page, makes this answer stale
  function isStale() {
    return request !== leaderboardRequest
  }
  leaderboard.value = []
  leaderboardBusy.value = true
  leaderboardError.value = ''
  try {
    const response = await getLeaderboard(props.classroomId)
    if (isStale()) {
      return
    }
    leaderboard.value = response.data
  } catch (err) {
    if (isStale()) {
      return
    }
    leaderboardError.value = apiErrorMessage(err, "We couldn't load the leaderboard.")
  } finally {
    if (isStale() === false) {
      leaderboardBusy.value = false
    }
  }
}
onMounted(retrieveLeaderboard)
onUnmounted(() => {
  leaderboardRequest += 1
})
</script>
<template>
  <section class="card mt-4 section-progress" aria-labelledby="leaderboard-heading">
    <div class="card-body">
      <div class="le-card-head">
        <span class="le-section-icon" aria-hidden="true">
          <svg class="le-icon" viewBox="0 0 16 16">
            <path d="M5 2.5h6v3a3 3 0 0 1-6 0zM5 3.5H3v1a2 2 0 0 0 2 2M11 3.5h2v1a2 2 0 0 1-2 2" />
            <path d="M8 8.5v3M5.5 13.5h5" />
          </svg>
        </span>
        <h2 id="leaderboard-heading" class="h4 mb-0">Leaderboard</h2>
      </div>
      <AppLoading v-if="leaderboardBusy" label="Loading leaderboard" />
      <template v-else-if="leaderboardError">
        <AppAlert variant="danger" :message="leaderboardError" @dismiss="leaderboardError = ''" />
        <button type="button" class="btn btn-outline-primary btn-sm" @click="retrieveLeaderboard">
          Try again
        </button>
      </template>
      <p v-else-if="leaderboard.length === 0" class="text-body-secondary mb-0">
        No contributions yet. Points appear when a mentor's hint is marked helpful.
      </p>
      <LeaderboardTable v-else :entries="leaderboard" />
    </div>
  </section>
</template>
