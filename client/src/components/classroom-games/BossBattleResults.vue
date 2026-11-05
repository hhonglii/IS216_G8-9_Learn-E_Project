<script setup>
// Class results. First tries show what the class understood before retries. The
// Students table says who played and how they did (G11), but never which answers
// each one picked.
import { onMounted, ref } from 'vue'
import * as classroomGamesApi from '@/services/classroomGamesApi.js'

const props = defineProps({
  classroomId: { type: String, required: true },
  errorMessage: { type: Function, required: true },
})
const results = ref(null)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    results.value = (await classroomGamesApi.getClassroomGameResults(props.classroomId)).data
  } catch (err) {
    error.value = props.errorMessage(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const bestWords = {
  won: 'Beat the boss',
  lost: 'Ran out of hearts',
  playing: 'Playing now',
  'not-played': 'Not played yet',
}

const percent = (question) =>
  question.firstTryTotal
    ? Math.round((question.firstTryCorrect / question.firstTryTotal) * 100)
    : null
</script>

<template>
  <section class="card mb-4" aria-labelledby="game-results-heading">
    <div class="card-body p-4">
      <div class="le-card-head justify-content-between">
        <h2 id="game-results-heading" class="h4 mb-0">Class results</h2>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          :disabled="loading"
          @click="load"
        >
          Refresh
        </button>
      </div>
      <p v-if="error" role="alert" class="alert alert-danger">{{ error }}</p>
      <p v-if="loading && !results" class="le-chip">Loading results…</p>
      <template v-if="results">
        <p v-if="!results.studentsPlayed" class="text-body-secondary mb-0">
          No students have played this version yet.
        </p>
        <template v-else>
          <p class="le-num">
            {{ results.studentsPlayed }}
            {{ results.studentsPlayed === 1 ? 'student has' : 'students have' }} played, and
            {{ results.studentsDefeatedBoss }} defeated the boss.
          </p>
          <ol class="ps-3 mb-0">
            <li v-for="question in results.questions" :key="question.id" class="mb-3">
              <p class="mb-1 game-result-text">{{ question.prompt }}</p>
              <p v-if="percent(question) === null" class="small text-body-secondary mb-0">
                Not answered yet.
              </p>
              <template v-else>
                <div
                  class="progress game-result-bar"
                  role="progressbar"
                  :aria-label="`First-try correct for question: ${question.prompt}`"
                  :aria-valuenow="percent(question)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div class="progress-bar" :style="{ width: `${percent(question)}%` }"></div>
                </div>
                <p class="small text-body-secondary mt-1 mb-0 le-num game-result-text">
                  {{ percent(question) }}% correct on the first try ({{
                    question.firstTryCorrect
                  }}
                  of {{ question.firstTryTotal }}).
                  <template v-if="question.topWrongAnswer">
                    Most common wrong answer: "{{ question.topWrongAnswer.label }}" ({{
                      question.topWrongAnswer.count
                    }}).
                  </template>
                </p>
              </template>
            </li>
          </ol>
        </template>
        <template v-if="results.students?.length">
          <h3 class="h5 mt-4">Students</h3>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <caption>
                Each student's attempts at this version of the battle
              </caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col" class="text-end">Attempts</th>
                  <th scope="col">Best result</th>
                </tr>
              </thead>
              <tbody>
                <!-- No ids come back, and two students can share a name, so key by place. -->
                <tr v-for="(student, index) in results.students" :key="index">
                  <td class="game-result-text">{{ student.name }}</td>
                  <td class="text-end le-num">{{ student.attempts }}</td>
                  <td>{{ bestWords[student.best] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </template>
    </div>
  </section>
</template>

<style scoped>
.game-result-bar {
  height: 0.5rem;
}
.game-result-bar .progress-bar {
  background: var(--section-accent);
}
.game-result-text {
  overflow-wrap: anywhere;
}
</style>
