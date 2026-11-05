<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — challenge page
//  A student answers the structured questions, then sends an applied
//  diagnosis for the professor to review. The server marks every answer and
//  works out progress; the page only shows them.
// ════════════════════════════════════════════════════════════════════
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

import QuestionRenderer from '../components/challenges/QuestionRenderer.vue'
import ChallengeProgress from '../components/challenges/ChallengeProgress.vue'
import AppliedCaseForm from '../components/challenges/AppliedCaseForm.vue'

import { getChallenge, createAttempt, submitAppliedDiagnosis } from '../services/challengesApi.js'

import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { usePageClassroom } from '@/composables/usePageClassroom.js'
import { apiErrorMessage } from '../utils/apiError.js'
import { reviewStatusText } from '@/utils/reviewStatus.js'

const route = useRoute()
const { pageClassroomId } = usePageClassroom()

// Challenge and Attempt data
const challengeId = computed(() => route.params.challengeId)
const { currentUserId } = useCurrentUser()

const challenge = ref(null)
const attempt = ref(null)
const draftAnswers = ref({})

// Applied diagnosis draft
const diagnosisDraft = ref('')
const diagnosisSubmitting = ref(false)
const diagnosisError = ref('')
const diagnosisSuccess = ref('')

// Loading and error states
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const submissionError = ref('')

// Each load bumps requestVersion. A reply to an older load, or one that lands
// after someone else logs in, is dropped rather than shown.
const activeUserId = ref(currentUserId.value)
let requestVersion = 0

const questions = computed(() => challenge.value?.questions ?? [])

// The server works out progress; the page only shows it.
const structuredScore = computed(() => attempt.value?.structuredScore ?? 0)

const structuredComplete = computed(() => attempt.value?.structuredComplete === true)

const reviewStatus = computed(() => attempt.value?.reviewStatus ?? 'not-submitted')

const reviewStatusLabel = computed(() => reviewStatusText[reviewStatus.value] ?? reviewStatus.value)

// Structured answers are locked during review and after approval.
const answersLocked = computed(() => ['pending', 'approved'].includes(reviewStatus.value))

// When the diagnosis form can appear
const canSubmitDiagnosis = computed(() => {
  return (
    structuredComplete.value &&
    attempt.value?.id &&
    ['not-submitted', 'pending', 'returned'].includes(reviewStatus.value)
  )
})

// The latest result for a question
function getQuestionResult(questionId) {
  return attempt.value?.questionResults?.find(
    (result) => String(result.questionId) === String(questionId),
  )
}

// Progressive hints (H-7): each wrong answer unlocks the next one, and the
// server sends only the unlocked hints with the attempt.
const hintCount = computed(() => challenge.value?.hintCount ?? 0)
const unlockedHints = computed(() => attempt.value?.unlockedHints ?? [])

// Keep each question draft separately
function updateDraft(questionId, value) {
  draftAnswers.value = {
    ...draftAnswers.value,
    [questionId]: value,
  }
}

// Extract backend error messages
// Load the challenge and any existing attempt. pageClassroomId tells the
// sidebar which classroom this is; it is cleared first, so a failed load shows
// no classroom links.
async function loadChallenge() {
  const version = ++requestVersion
  const id = challengeId.value
  const userId = currentUserId.value

  activeUserId.value = userId

  challenge.value = null
  pageClassroomId.value = ''
  attempt.value = null
  draftAnswers.value = {}
  diagnosisDraft.value = ''

  error.value = ''
  submissionError.value = ''
  diagnosisError.value = ''
  diagnosisSuccess.value = ''
  loading.value = true

  if (!id) {
    error.value = 'Challenge ID is missing.'
    loading.value = false
    return
  }

  try {
    const response = await getChallenge(id)

    if (version !== requestVersion) return
    if (currentUserId.value !== userId) return

    challenge.value = response.data
    pageClassroomId.value = response.data.classroomId ?? ''
    attempt.value = response.data.attempt ?? null

    // Restore the saved diagnosis after a refresh
    diagnosisDraft.value = attempt.value?.appliedDiagnosis ?? ''
  } catch (err) {
    if (version !== requestVersion) return

    error.value = apiErrorMessage(err)
  } finally {
    if (version === requestVersion) {
      loading.value = false
    }
  }
}

// Submit one structured question
async function submitAnswer(questionId) {
  if (submitting.value || loading.value || diagnosisSubmitting.value || answersLocked.value) {
    return
  }

  const version = requestVersion
  const userId = activeUserId.value
  const id = challengeId.value

  if (currentUserId.value !== userId) {
    await loadChallenge()
    return
  }

  const value = draftAnswers.value[questionId]

  submissionError.value = ''
  submitting.value = true

  try {
    const response = await createAttempt(id, {
      questionId,
      value,
    })

    if (version !== requestVersion || currentUserId.value !== userId) return

    attempt.value = {
      ...attempt.value,
      ...response.data,
    }
  } catch (err) {
    if (version !== requestVersion) return

    submissionError.value = apiErrorMessage(err)

    // The typed or selected answer stays, so the student can try again.
  } finally {
    submitting.value = false
  }
}

// Submit the applied diagnosis
async function handleDiagnosisSubmit() {
  if (!canSubmitDiagnosis.value || diagnosisSubmitting.value || submitting.value) {
    return
  }

  const diagnosis = diagnosisDraft.value.trim()

  // Client-side validation for convenience
  if (!diagnosis) {
    diagnosisError.value = 'Please enter your diagnosis before submitting.'
    return
  }

  const version = requestVersion
  const userId = activeUserId.value
  const attemptId = attempt.value.id

  if (currentUserId.value !== userId) {
    await loadChallenge()
    return
  }

  diagnosisError.value = ''
  diagnosisSuccess.value = ''
  diagnosisSubmitting.value = true

  try {
    // PUT /api/attempts/:id/applied
    const response = await submitAppliedDiagnosis(attemptId, {
      appliedDiagnosis: diagnosis,
    })

    if (version !== requestVersion || currentUserId.value !== userId) return

    // Replace Attempt state using the server response
    attempt.value = {
      ...attempt.value,
      ...response.data,
    }

    diagnosisDraft.value = response.data.appliedDiagnosis ?? diagnosis
    diagnosisSuccess.value = 'Your diagnosis has been submitted for review.'
  } catch (err) {
    if (version !== requestVersion) return

    diagnosisError.value = apiErrorMessage(err)

    // Keep the diagnosis draft after a failed request
  } finally {
    diagnosisSubmitting.value = false
  }
}

// Reload when the challenge or the logged-in user changes
watch([challengeId, currentUserId], loadChallenge, { immediate: true })

onUnmounted(() => {
  requestVersion++
})
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="py-5">
      <p class="le-chip">Loading challenge...</p>
    </div>

    <!-- Challenge loading error -->
    <div v-else-if="error" role="alert" class="alert alert-danger le-alert-row">
      <span>{{ error }}</span>
      <button type="button" class="btn btn-outline-secondary btn-sm" @click="loadChallenge">
        Retry
      </button>
    </div>

    <div v-else-if="challenge">
      <!-- Challenge information -->
      <header class="mb-4">
        <RouterLink
          v-if="challenge.classroomId"
          class="le-back-link"
          :to="{ name: 'classroom', params: { classroomId: challenge.classroomId } }"
        >
          <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
          Back to classroom
        </RouterLink>
        <h1 class="le-page-title">{{ challenge.title }}</h1>

        <p v-if="challenge.objective" class="text-body-secondary">
          {{ challenge.objective }}
        </p>

        <p v-if="challenge.language" class="le-chip mb-0">
          Language: <span class="font-monospace">{{ challenge.language }}</span>
        </p>
      </header>

      <!-- Prompt and code snippet -->
      <section
        v-if="challenge.prompt || challenge.codeSnippet"
        class="card mb-4"
        aria-label="Challenge"
      >
        <div class="card-body p-4">
          <p v-if="challenge.prompt" class="le-request-text">
            {{ challenge.prompt }}
          </p>

          <section
            v-if="challenge.codeSnippet"
            id="challenge-code"
            class="le-snippet-target"
            tabindex="-1"
            aria-labelledby="code-snippet-heading"
          >
            <h2 id="code-snippet-heading" class="h6 text-body-secondary">Code snippet</h2>
            <!-- One span per line, so CSS can number them for the locate-fault questions. -->
            <pre class="le-code le-code-numbered"><code><span
              v-for="(line, index) in challenge.codeSnippet.split('\n')"
              :key="index"
              class="le-code-line"
            >{{ line }}</span></code></pre>
          </section>
        </div>
      </section>

      <!-- Structured progress -->
      <section class="card mb-4" aria-labelledby="progress-heading">
        <div class="card-body p-4">
          <h2 id="progress-heading" class="h5">Your progress</h2>

          <ChallengeProgress
            :current="structuredScore"
            :total="questions.length"
            :status="reviewStatusLabel"
          />

          <p v-if="structuredComplete" class="text-success mt-2 mb-0">
            All structured questions completed!
          </p>
        </div>
      </section>

      <!-- Progressive hints, unlocked one at a time by wrong answers -->
      <section
        v-if="hintCount > 0"
        id="challenge-hints"
        class="card mb-4 le-snippet-target"
        tabindex="-1"
        aria-labelledby="hints-heading"
      >
        <div class="card-body p-4">
          <h2 id="hints-heading" class="h5">Hints</h2>
          <p class="text-body-secondary small">
            {{ unlockedHints.length }} of {{ hintCount }} unlocked.
            {{
              unlockedHints.length < hintCount
                ? 'A new hint unlocks each time you get a question wrong.'
                : 'Every hint is unlocked.'
            }}
          </p>
          <ol v-if="unlockedHints.length" class="mb-0">
            <li v-for="(hint, index) in unlockedHints" :key="index">{{ hint }}</li>
          </ol>
        </div>
      </section>

      <section class="mb-4" aria-labelledby="questions-heading">
        <h2 id="questions-heading" class="h4 mb-3">Structured questions</h2>

        <p v-if="questions.length === 0" class="text-body-secondary">No questions are available.</p>

        <div v-for="(question, index) in questions" :key="question.id" class="card mb-3">
          <div class="card-body p-4">
            <div class="le-card-head">
              <h3 class="h5 card-title">Question {{ index + 1 }}</h3>
              <!-- The snippet and the hints are shown once near the top, and plain #id
                   links lead back to them. Their tabindex="-1" lets the browser move
                   focus there as well as the scroll position. -->
              <a
                v-if="challenge.codeSnippet"
                href="#challenge-code"
                class="btn btn-outline-secondary btn-sm le-card-action"
              >
                View code snippet<span class="visually-hidden"> for question {{ index + 1 }}</span>
              </a>
            </div>

            <fieldset
              :disabled="
                answersLocked ||
                submitting ||
                diagnosisSubmitting ||
                getQuestionResult(question.id)?.correct === true
              "
              class="border-0 p-0 m-0 w-100"
            >
              <QuestionRenderer
                :question="question"
                :answer="draftAnswers[question.id]"
                :solved="getQuestionResult(question.id)?.correct === true"
                @update:answer="
                  (value) => {
                    if (!answersLocked) updateDraft(question.id, value)
                  }
                "
                @submit="submitAnswer(question.id)"
              />
            </fieldset>

            <p v-if="answersLocked" class="text-body-secondary mt-2">
              {{
                reviewStatus === 'pending'
                  ? 'Structured answers are locked while your diagnosis is pending professor review.'
                  : 'Structured answers are locked because this challenge has been approved.'
              }}
            </p>

            <p v-if="submitting" class="text-body-secondary mt-2">Submitting...</p>

            <!-- Display latest server result. The wrapper is always rendered so
                 screen readers announce the result when it appears inside it. -->
            <div role="status" :class="{ 'mt-3': getQuestionResult(question.id) }">
              <template v-if="getQuestionResult(question.id)">
                <div
                  v-if="getQuestionResult(question.id).correct === true"
                  class="alert alert-success"
                >
                  Correct answer!
                </div>

                <div
                  v-else-if="getQuestionResult(question.id).correct === false"
                  class="alert alert-warning"
                >
                  Incorrect answer. Please try again.
                  <a v-if="unlockedHints.length" href="#challenge-hints" class="alert-link ms-1">
                    View hints
                  </a>
                  <RouterLink
                    v-if="challenge.classroomId"
                    class="alert-link ms-1"
                    :to="{
                      name: 'help-queue',
                      params: { classroomId: challenge.classroomId },
                      query: { challenge: challengeId, question: question.id },
                    }"
                    >Ask a classmate for a hint</RouterLink
                  >
                </div>

                <div v-if="getQuestionResult(question.id).explanation" class="alert alert-info">
                  <strong>Explanation:</strong>
                  {{ getQuestionResult(question.id).explanation }}
                </div>
              </template>
            </div>
          </div>
        </div>

        <div v-if="submissionError" role="alert" class="alert alert-danger">
          {{ submissionError }}
        </div>
      </section>

      <section class="card mb-4" aria-labelledby="diagnosis-heading">
        <div class="card-body p-4">
          <div class="le-card-head">
            <span class="le-section-icon" aria-hidden="true">
              <svg class="le-icon" viewBox="0 0 16 16">
                <circle cx="7" cy="7" r="4.5" />
                <path d="m10.5 10.5 3.5 3.5" />
              </svg>
            </span>
            <h2 id="diagnosis-heading" class="h4 mb-0">Applied diagnosis</h2>
          </div>

          <!-- Structured work is incomplete -->
          <div
            v-if="!structuredComplete && questions.length === 0"
            class="alert alert-secondary mb-0"
          >
            Complete all structured questions correctly to unlock the applied diagnosis.
          </div>
          <div v-else-if="!structuredComplete" class="alert alert-secondary mb-0">
            Unlocks after {{ questions.length - structuredScore }} more correct
            {{ questions.length - structuredScore === 1 ? 'answer' : 'answers' }}. You'll explain a
            real bug in your own words, and your professor reviews it.
          </div>

          <!-- Professor approved -->
          <div v-else-if="reviewStatus === 'approved'" class="alert alert-success mb-0">
            <h3 class="h6">Completed</h3>
            <p>Your professor has approved your diagnosis.</p>

            <p v-if="attempt?.professorFeedback" class="mb-0">
              <strong>Professor feedback:</strong>
              {{ attempt.professorFeedback }}
            </p>
          </div>

          <!-- Structured work complete -->
          <template v-else>
            <!-- Waiting for professor -->
            <div v-if="reviewStatus === 'pending'" class="alert alert-info">
              <strong>Waiting for review</strong>
              <p class="mb-0">
                Your diagnosis has been submitted. You may update it before your professor reviews
                it.
              </p>
            </div>

            <!-- Returned diagnosis -->
            <div v-if="reviewStatus === 'returned'" class="alert alert-warning">
              <h3 class="h6">Diagnosis returned</h3>

              <p>Your professor has requested corrections.</p>

              <p v-if="attempt?.professorFeedback" class="mb-0">
                <strong>Professor feedback:</strong>
                {{ attempt.professorFeedback }}
              </p>
            </div>

            <!-- Diagnosis submission form -->
            <AppliedCaseForm
              v-if="canSubmitDiagnosis"
              v-model="diagnosisDraft"
              :applied-case="challenge.appliedCase"
              :disabled="diagnosisSubmitting || submitting"
              :sent="reviewStatus !== 'not-submitted'"
              @submit="handleDiagnosisSubmit"
            />

            <!-- Submission progress -->
            <p v-if="diagnosisSubmitting" class="text-body-secondary mt-2">
              Submitting diagnosis...
            </p>

            <!-- Submission success -->
            <div v-if="diagnosisSuccess" class="alert alert-success mt-3">
              {{ diagnosisSuccess }}
            </div>

            <!-- Submission error -->
            <div v-if="diagnosisError" role="alert" class="alert alert-danger mt-3">
              {{ diagnosisError }}
            </div>
          </template>
        </div>
      </section>
    </div>

    <div v-else class="py-5">
      <p class="text-body-secondary">No challenge found.</p>
    </div>
  </div>
</template>
