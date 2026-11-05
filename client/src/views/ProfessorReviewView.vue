<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — Professor Review
//  The owning professor's two queues, applied diagnoses and submitted group
//  projects, both read from the insights endpoint, with a form to approve or
//  return each one. A return needs feedback, and the server checks that too.
//  Each queue switches between Waiting and Reviewed, so a decision stays
//  findable after it is made (UX audit item 14).
// ════════════════════════════════════════════════════════════════════
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

import { getInsights } from '../services/classroomsApi.js'
import { reviewAttempt } from '../services/challengesApi.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { reviewGroup } from '../services/groupsApi.js'
import UserAvatar from '../components/shared/UserAvatar.vue'
import { formatDateTime } from '../utils/formatDate.js'
import { apiErrorMessage } from '../utils/apiError.js'

const route = useRoute()

// Classroom and pending reviews
const classroomId = computed(() => route.params.classroomId)
const { currentUserId } = useCurrentUser()

const insights = ref(null)
const pendingAttempts = computed(() => insights.value?.pendingAppliedAttempts ?? [])
const pendingGroups = computed(() => insights.value?.pendingGroups ?? [])
// Decisions already made, newest first (UX audit item 14). Each list has a
// Waiting / Reviewed switch, and one reviewed item at a time can be opened.
const reviewedAttempts = computed(() => insights.value?.reviewedAttempts ?? [])
const reviewedGroups = computed(() => insights.value?.reviewedGroups ?? [])
const diagnosisView = ref('waiting')
const groupView = ref('waiting')
const openReviewedAttemptId = ref(null)
const openReviewedGroupId = ref(null)
const openReviewedAttempt = computed(
  () =>
    reviewedAttempts.value.find((attempt) => attempt.id === openReviewedAttemptId.value) ?? null,
)
const openReviewedGroup = computed(
  () => reviewedGroups.value.find((group) => group.id === openReviewedGroupId.value) ?? null,
)
function toggleReviewedAttempt(id) {
  openReviewedAttemptId.value = openReviewedAttemptId.value === id ? null : id
}
function toggleReviewedGroup(id) {
  openReviewedGroupId.value = openReviewedGroupId.value === id ? null : id
}
const decisionText = { approved: 'Approved', returned: 'Returned' }

const loading = ref(false)
const error = ref('')

// Selected attempt and review form
const selectedAttempt = ref(null)
const decision = ref('approve')
const feedback = ref('')

const submitting = ref(false)
const reviewError = ref('')
const reviewSuccess = ref('') // what the last diagnosis decision did, where its form was
const groupReviewSuccess = ref('') // the same for the last group decision

const selectedGroup = ref(null)
const groupDecision = ref('approve')
const groupFeedback = ref('')
const groupSubmitting = ref(false)
const groupReviewError = ref('')
const groupStages = ['Diagnose', 'Repair', 'Extend', 'Verify', 'Reflect']

// Each load bumps requestVersion. A reply to an older load, or one that lands
// after someone else logs in, is dropped rather than shown.
const activeUserId = ref(currentUserId.value)
let requestVersion = 0

// Both queues come from the insights endpoint; there is no separate review list.
async function loadReviews() {
  const version = ++requestVersion
  const id = classroomId.value
  const userId = currentUserId.value

  activeUserId.value = userId

  loading.value = true
  error.value = ''
  insights.value = null

  selectedAttempt.value = null
  decision.value = 'approve'
  feedback.value = ''
  reviewError.value = ''

  selectedGroup.value = null
  groupDecision.value = 'approve'
  groupFeedback.value = ''
  groupReviewError.value = ''

  if (!id) {
    error.value = 'Classroom ID is missing.'
    loading.value = false
    return
  }

  try {
    const response = await getInsights(id)

    if (version !== requestVersion || currentUserId.value !== userId) {
      return
    }

    insights.value = response.data
  } catch (err) {
    if (version !== requestVersion) return

    error.value = apiErrorMessage(err)
  } finally {
    if (version === requestVersion) {
      loading.value = false
    }
  }
}

// Select one attempt for review
function selectAttempt(attempt) {
  selectedAttempt.value = attempt

  decision.value = 'approve'
  feedback.value = ''

  reviewError.value = ''
  reviewSuccess.value = ''
  groupReviewSuccess.value = ''
}

function selectGroup(group) {
  selectedGroup.value = group

  groupDecision.value = 'approve'
  groupFeedback.value = ''

  groupReviewError.value = ''
  reviewSuccess.value = ''
  groupReviewSuccess.value = ''
}

// Cancel the selected review
function cancelReview() {
  selectedAttempt.value = null
  decision.value = 'approve'
  feedback.value = ''
  reviewError.value = ''
}

function cancelGroupReview() {
  selectedGroup.value = null
  groupDecision.value = 'approve'
  groupFeedback.value = ''
  groupReviewError.value = ''
}

// Submit the professor's decision
async function submitReview() {
  if (!selectedAttempt.value || submitting.value) return

  if (!['approve', 'return'].includes(decision.value)) {
    reviewError.value = 'Please select a valid decision.'
    return
  }

  if (decision.value === 'return' && !feedback.value.trim()) {
    reviewError.value = 'Feedback is required when returning a diagnosis.'
    return
  }

  const version = requestVersion
  const userId = activeUserId.value
  const attemptId = selectedAttempt.value.id
  const { studentName, challengeTitle } = selectedAttempt.value

  if (currentUserId.value !== userId) {
    await loadReviews()
    return
  }

  submitting.value = true
  reviewError.value = ''
  reviewSuccess.value = ''
  groupReviewSuccess.value = ''

  try {
    const response = await reviewAttempt(
      attemptId,
      {
        decision: decision.value,
        feedback: feedback.value.trim(),
      },
      userId,
    )

    if (version !== requestVersion || currentUserId.value !== userId) {
      return
    }

    const savedStatus = response.data.reviewStatus

    // Refetch the list from the server after a successful review.
    await loadReviews()

    if (savedStatus === 'approved') {
      reviewSuccess.value = `Approved ${studentName}'s diagnosis for "${challengeTitle}".`
    } else if (savedStatus === 'returned') {
      reviewSuccess.value = `Returned ${studentName}'s diagnosis for "${challengeTitle}" with your feedback.`
    }
  } catch (err) {
    if (version !== requestVersion) return

    reviewError.value = apiErrorMessage(err)

    // Keep selection and feedback after failure.
  } finally {
    submitting.value = false
  }
}

async function submitGroupReview() {
  if (!selectedGroup.value || groupSubmitting.value) return

  if (!['approve', 'return'].includes(groupDecision.value)) {
    groupReviewError.value = 'Please select a valid decision.'
    return
  }

  if (groupDecision.value === 'return' && !groupFeedback.value.trim()) {
    groupReviewError.value = 'Feedback is required when returning a group project.'
    return
  }

  const version = requestVersion
  const userId = activeUserId.value
  const groupId = selectedGroup.value.id
  const groupName = selectedGroup.value.name

  if (currentUserId.value !== userId) {
    await loadReviews()
    return
  }

  groupSubmitting.value = true
  groupReviewError.value = ''
  reviewSuccess.value = ''
  groupReviewSuccess.value = ''

  try {
    const response = await reviewGroup(
      groupId,
      {
        decision: groupDecision.value,
        feedback: groupFeedback.value.trim(),
      },
      userId,
    )

    if (version !== requestVersion || currentUserId.value !== userId) {
      return
    }

    const savedStatus = response.data.submissionStatus

    // Refetch the list from the server after a successful review.
    await loadReviews()

    if (savedStatus === 'approved') {
      groupReviewSuccess.value = `Approved ${groupName}'s project.`
    } else if (savedStatus === 'returned') {
      groupReviewSuccess.value = `Returned ${groupName}'s project with your feedback.`
    }
  } catch (err) {
    if (version !== requestVersion) return

    groupReviewError.value = apiErrorMessage(err)

    // Keep selection and feedback after failure.
  } finally {
    groupSubmitting.value = false
  }
}

const summary = computed(() => insights.value?.summary ?? null)

// Reload when the classroom or the logged-in user changes
watch([classroomId, currentUserId], loadReviews, { immediate: true })

onUnmounted(() => {
  requestVersion++
})
</script>

<template>
  <div>
    <header class="mb-4">
      <RouterLink
        v-if="classroomId"
        class="le-back-link"
        :to="{ name: 'classroom', params: { classroomId } }"
      >
        <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
        Back to classroom
      </RouterLink>
      <h1 class="le-page-title le-title-dot">Professor review</h1>
      <p class="text-muted">
        Review students' applied diagnoses and group projects, and give feedback.
      </p>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-5">
      <p>Loading pending reviews...</p>
    </div>

    <!-- Loading error -->
    <div v-else-if="error" role="alert" class="alert alert-danger">
      {{ error }}

      <button class="btn btn-outline-danger btn-sm ms-3" @click="loadReviews">Retry</button>
    </div>

    <template v-else>
      <section class="mb-4" aria-labelledby="diagnoses-heading">
        <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
          <h2 id="diagnoses-heading">Applied diagnoses</h2>

          <button
            class="btn btn-outline-secondary flex-shrink-0"
            :disabled="submitting"
            @click="loadReviews"
          >
            Refresh
          </button>
        </div>

        <div class="btn-group mb-3" role="group" aria-label="Which diagnoses to show">
          <input
            id="diagnoses-waiting"
            v-model="diagnosisView"
            type="radio"
            class="btn-check"
            name="diagnosis-view"
            value="waiting"
          />
          <label class="btn btn-outline-primary" for="diagnoses-waiting"
            >Waiting ({{ pendingAttempts.length }})</label
          >
          <input
            id="diagnoses-reviewed"
            v-model="diagnosisView"
            type="radio"
            class="btn-check"
            name="diagnosis-view"
            value="reviewed"
          />
          <label class="btn btn-outline-primary" for="diagnoses-reviewed"
            >Reviewed ({{ reviewedAttempts.length }})</label
          >
        </div>

        <template v-if="diagnosisView === 'reviewed'">
          <div v-if="reviewedAttempts.length === 0" class="alert alert-info">
            No diagnoses reviewed yet.
          </div>
          <div v-else class="card overflow-hidden mb-3">
            <div class="le-rows-head" aria-hidden="true">
              <span>Student</span>
              <span>Challenge</span>
              <span>Decision</span>
              <span>Action</span>
            </div>
            <ul class="le-rows">
              <li v-for="attempt in reviewedAttempts" :key="attempt.id" class="le-row">
                <div class="le-person">
                  <UserAvatar :user-id="attempt.studentId" :display-name="attempt.studentName" />
                  <div>
                    <p class="le-person-name">
                      <span class="visually-hidden">Student:</span> {{ attempt.studentName }}
                    </p>
                    <p class="le-person-role">Reviewed: {{ formatDateTime(attempt.reviewedAt) }}</p>
                  </div>
                </div>
                <h3 class="h6 mb-0 le-request-text">
                  <span class="visually-hidden">Challenge:</span> {{ attempt.challengeTitle }}
                </h3>
                <span
                  class="badge le-status"
                  :class="{ 'is-active': attempt.reviewStatus === 'approved' }"
                >
                  <span class="visually-hidden">Decision:</span>
                  {{ decisionText[attempt.reviewStatus] }}
                </span>
                <button
                  type="button"
                  class="btn btn-outline-primary"
                  :aria-expanded="openReviewedAttemptId === attempt.id ? 'true' : 'false'"
                  @click="toggleReviewedAttempt(attempt.id)"
                >
                  {{ openReviewedAttemptId === attempt.id ? 'Hide' : 'Show' }}
                  <span class="visually-hidden"> {{ attempt.studentName }}'s diagnosis</span>
                </button>
              </li>
            </ul>
          </div>
          <section
            v-if="openReviewedAttempt"
            class="card mb-4"
            aria-labelledby="reviewed-diagnosis-heading"
          >
            <div class="card-body">
              <h3 id="reviewed-diagnosis-heading" class="h5">
                {{ openReviewedAttempt.studentName }}, {{ openReviewedAttempt.challengeTitle }}
              </h3>
              <p v-if="openReviewedAttempt.reviewStatus === 'returned'" class="text-body-secondary">
                Returned. It moves back to Waiting when the student sends a new diagnosis.
              </p>
              <h4 class="h6">Their diagnosis</h4>
              <div class="le-subpanel mb-3">
                <p class="mb-0" style="white-space: pre-wrap">
                  {{ openReviewedAttempt.appliedDiagnosis }}
                </p>
              </div>
              <h4 class="h6">Your feedback</h4>
              <p class="mb-0" style="white-space: pre-wrap">
                {{ openReviewedAttempt.feedback || 'No feedback given.' }}
              </p>
            </div>
          </section>
        </template>

        <template v-else>
          <p class="text-muted">
            {{ pendingAttempts.length }}
            pending {{ pendingAttempts.length === 1 ? 'submission' : 'submissions' }}
          </p>

          <!-- Empty state -->
          <div v-if="pendingAttempts.length === 0" class="alert alert-info">
            No pending diagnoses to review.
          </div>

          <!-- Pending review list -->
          <div v-if="pendingAttempts.length > 0" class="card overflow-hidden mb-3">
            <div class="le-rows-head" aria-hidden="true">
              <span>Student</span>
              <span>Challenge</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            <ul class="le-rows">
              <li v-for="attempt in pendingAttempts" :key="attempt.id" class="le-row">
                <div class="le-person">
                  <UserAvatar :user-id="attempt.studentId" :display-name="attempt.studentName" />
                  <div>
                    <p class="le-person-name">
                      <span class="visually-hidden">Student:</span> {{ attempt.studentName }}
                    </p>
                    <p v-if="attempt.submittedAt" class="le-person-role">
                      Last updated:
                      {{ formatDateTime(attempt.submittedAt) }}
                    </p>
                  </div>
                </div>

                <h3 class="h6 mb-0 le-request-text">
                  <span class="visually-hidden">Challenge:</span> {{ attempt.challengeTitle }}
                </h3>

                <span class="badge le-status is-active">
                  <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="5.5" />
                    <path d="M8 5v3l2 1.5" />
                  </svg>
                  <span class="visually-hidden">Status:</span> Submitted
                </span>

                <button
                  class="btn btn-primary"
                  :disabled="submitting"
                  @click="selectAttempt(attempt)"
                >
                  Review
                </button>
              </li>
            </ul>
          </div>
        </template>
      </section>

      <!-- Where the form was, so the outcome shows where the professor is looking -->
      <p v-if="reviewSuccess" role="status" class="alert alert-success">{{ reviewSuccess }}</p>

      <!-- Selected review form -->
      <section v-if="selectedAttempt" class="card mb-4">
        <div class="card-body">
          <h2 class="mb-3">Review student diagnosis</h2>

          <p>
            <strong>Student:</strong>
            {{ selectedAttempt.studentName }}
          </p>

          <p>
            <strong>Challenge:</strong>
            {{ selectedAttempt.challengeTitle }}
          </p>

          <template v-if="selectedAttempt.previousFeedback">
            <h4>Your earlier feedback</h4>
            <div class="le-callout mb-4">
              <p class="mb-0" style="white-space: pre-wrap">
                {{ selectedAttempt.previousFeedback }}
              </p>
            </div>
          </template>
          <!-- What they were asked and the official explanation, beside what they
               wrote, so nobody opens the challenge to compare (UX audit item 14). -->
          <div class="row g-3 mb-4">
            <div class="col-lg-6">
              <h4>Applied-case prompt</h4>
              <div class="le-subpanel mb-3">
                <p class="mb-0" style="white-space: pre-wrap">
                  {{ selectedAttempt.appliedCasePrompt || 'No prompt saved.' }}
                </p>
              </div>
              <h4>Official explanation</h4>
              <div class="le-subpanel">
                <p class="mb-0" style="white-space: pre-wrap">
                  {{ selectedAttempt.officialExplanation || 'No explanation saved.' }}
                </p>
              </div>
            </div>
            <div class="col-lg-6">
              <h4>Submitted diagnosis</h4>
              <div class="le-subpanel">
                <p class="mb-0" style="white-space: pre-wrap">
                  {{ selectedAttempt.appliedDiagnosis }}
                </p>
              </div>
            </div>
          </div>

          <!-- Decision -->
          <div class="mb-3">
            <h4>Review decision</h4>

            <div class="form-check">
              <input
                id="approveDecision"
                v-model="decision"
                type="radio"
                value="approve"
                name="reviewDecision"
                class="form-check-input"
                :disabled="submitting"
              />

              <label class="form-check-label" for="approveDecision"> Approve diagnosis </label>
              <p class="form-text mt-0">
                Completes the challenge for them, and lets them answer classmates' questions on it
                in the help queue.
              </p>
            </div>

            <div class="form-check">
              <input
                id="returnDecision"
                v-model="decision"
                type="radio"
                value="return"
                name="reviewDecision"
                class="form-check-input"
                :disabled="submitting"
              />

              <label class="form-check-label" for="returnDecision"> Return for corrections </label>
            </div>
          </div>

          <!-- Feedback -->
          <div class="mb-3">
            <label for="professorFeedback" class="form-label">
              Professor feedback
              <span v-if="decision === 'return'" class="text-danger"> * </span>
            </label>

            <textarea
              id="professorFeedback"
              v-model="feedback"
              class="form-control"
              rows="4"
              :disabled="submitting"
              :placeholder="
                decision === 'return'
                  ? 'Explain what the student should correct...'
                  : 'Optional feedback for the student...'
              "
            ></textarea>

            <small v-if="decision === 'return'" class="text-muted">
              Feedback is required when returning a diagnosis.
            </small>
          </div>

          <!-- Review error -->
          <div v-if="reviewError" role="alert" class="alert alert-danger">
            {{ reviewError }}
          </div>

          <!-- Actions -->
          <div class="d-flex gap-2">
            <button
              class="btn"
              :class="decision === 'approve' ? 'btn-success' : 'btn-warning'"
              :disabled="submitting || (decision === 'return' && !feedback.trim())"
              @click="submitReview"
            >
              {{
                submitting
                  ? 'Submitting...'
                  : decision === 'approve'
                    ? 'Approve diagnosis'
                    : 'Return diagnosis'
              }}
            </button>

            <button class="btn btn-outline-secondary" :disabled="submitting" @click="cancelReview">
              Cancel
            </button>
          </div>
        </div>
      </section>
      <section class="mb-4" aria-labelledby="groups-heading">
        <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
          <h2 id="groups-heading">Group projects</h2>
        </div>

        <div class="btn-group mb-3" role="group" aria-label="Which group projects to show">
          <input
            id="groups-waiting"
            v-model="groupView"
            type="radio"
            class="btn-check"
            name="group-view"
            value="waiting"
          />
          <label class="btn btn-outline-primary" for="groups-waiting"
            >Waiting ({{ pendingGroups.length }})</label
          >
          <input
            id="groups-reviewed"
            v-model="groupView"
            type="radio"
            class="btn-check"
            name="group-view"
            value="reviewed"
          />
          <label class="btn btn-outline-primary" for="groups-reviewed"
            >Reviewed ({{ reviewedGroups.length }})</label
          >
        </div>

        <template v-if="groupView === 'reviewed'">
          <div v-if="reviewedGroups.length === 0" class="alert alert-info">
            No group projects reviewed yet.
          </div>
          <div v-else class="card overflow-hidden mb-3">
            <div class="le-rows-head" aria-hidden="true">
              <span>Group</span>
              <span>Mini-project</span>
              <span>Decision</span>
              <span>Action</span>
            </div>
            <ul class="le-rows">
              <li v-for="group in reviewedGroups" :key="group.id" class="le-row">
                <div>
                  <p class="mb-0 le-request-text">
                    <span class="visually-hidden">Group:</span> {{ group.name }}
                  </p>
                  <p class="le-person-role">Reviewed: {{ formatDateTime(group.reviewedAt) }}</p>
                </div>
                <h3 class="h6 mb-0 le-request-text">
                  <span class="visually-hidden">Mini-project:</span> {{ group.miniProjectTitle }}
                </h3>
                <span
                  class="badge le-status"
                  :class="{ 'is-active': group.submissionStatus === 'approved' }"
                >
                  <span class="visually-hidden">Decision:</span>
                  {{ decisionText[group.submissionStatus] }}
                </span>
                <button
                  type="button"
                  class="btn btn-outline-primary"
                  :aria-expanded="openReviewedGroupId === group.id ? 'true' : 'false'"
                  @click="toggleReviewedGroup(group.id)"
                >
                  {{ openReviewedGroupId === group.id ? 'Hide' : 'Show' }}
                  <span class="visually-hidden"> {{ group.name }}'s review</span>
                </button>
              </li>
            </ul>
          </div>
          <section
            v-if="openReviewedGroup"
            class="card mb-4"
            aria-labelledby="reviewed-group-heading"
          >
            <div class="card-body">
              <h3 id="reviewed-group-heading" class="h5">
                {{ openReviewedGroup.name }}, {{ openReviewedGroup.miniProjectTitle }}
              </h3>
              <p
                v-if="openReviewedGroup.submissionStatus === 'returned'"
                class="text-body-secondary"
              >
                Returned. It moves back to Waiting when the group submits again.
              </p>
              <p>
                <strong>Members:</strong>
                {{ openReviewedGroup.members.map((m) => m.displayName).join(', ') }}
              </p>
              <h4 class="h6">Your feedback</h4>
              <p class="mb-0" style="white-space: pre-wrap">
                {{ openReviewedGroup.feedback || 'No feedback given.' }}
              </p>
            </div>
          </section>
        </template>

        <template v-else>
          <p class="text-muted">
            {{ pendingGroups.length }}
            group {{ pendingGroups.length === 1 ? 'project' : 'projects' }} waiting for review
          </p>

          <!-- Empty state -->
          <div v-if="pendingGroups.length === 0" class="alert alert-info">
            No group projects to review.
          </div>

          <!-- Pending review list -->
          <div v-if="pendingGroups.length > 0" class="card overflow-hidden mb-3">
            <div class="le-rows-head" aria-hidden="true">
              <span>Group</span>
              <span>Mini-project</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            <ul class="le-rows">
              <li v-for="group in pendingGroups" :key="group.id" class="le-row">
                <p class="mb-0 le-request-text">
                  <span class="visually-hidden">Group:</span> {{ group.name }}
                </p>

                <h3 class="h6 mb-0 le-request-text">
                  <span class="visually-hidden">Mini-project:</span> {{ group.miniProjectTitle }}
                </h3>

                <span class="badge le-status is-active">
                  <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="5.5" />
                    <path d="M8 5v3l2 1.5" />
                  </svg>
                  <span class="visually-hidden">Status:</span> Submitted
                </span>

                <button
                  class="btn btn-primary"
                  :disabled="groupSubmitting"
                  @click="selectGroup(group)"
                >
                  Review
                </button>
              </li>
            </ul>
          </div>
        </template>
      </section>

      <p v-if="groupReviewSuccess" role="status" class="alert alert-success">
        {{ groupReviewSuccess }}
      </p>

      <section v-if="selectedGroup" class="card mb-4">
        <div class="card-body">
          <h2 class="mb-3">Review group project</h2>

          <p>
            <strong>Group:</strong>
            {{ selectedGroup.name }}
          </p>

          <p>
            <strong>Mini-project:</strong>
            {{ selectedGroup.miniProjectTitle }}
          </p>

          <template v-if="selectedGroup.acceptanceCriteria?.length || selectedGroup.rubric">
            <h4>What the brief asks for</h4>
            <div class="le-subpanel mb-4">
              <template v-if="selectedGroup.acceptanceCriteria?.length">
                <p class="fw-semibold mb-1">Acceptance criteria</p>
                <ul>
                  <li v-for="criterion in selectedGroup.acceptanceCriteria" :key="criterion">
                    {{ criterion }}
                  </li>
                </ul>
              </template>
              <template v-if="selectedGroup.rubric">
                <p class="fw-semibold mb-1">Rubric</p>
                <p class="mb-0" style="white-space: pre-wrap">{{ selectedGroup.rubric }}</p>
              </template>
            </div>
          </template>
          <template v-if="selectedGroup.previousFeedback">
            <h4>Your earlier feedback</h4>
            <div class="le-callout mb-4">
              <p class="mb-0" style="white-space: pre-wrap">
                {{ selectedGroup.previousFeedback }}
              </p>
            </div>
          </template>
          <h4>Members</h4>

          <div class="le-subpanel mb-4">
            <p class="mb-0" style="white-space: pre-wrap">
              {{ selectedGroup.members.map((m) => m.displayName).join(', ') }}
            </p>
          </div>

          <h4>Stage evidence</h4>

          <dl class="le-details mb-4">
            <template v-for="stage in groupStages" :key="stage">
              <dt>{{ stage }}</dt>
              <dd>{{ selectedGroup.stageEvidence[stage] || 'No evidence yet.' }}</dd>
            </template>
          </dl>

          <h4>Reflection</h4>
          <div class="le-subpanel mb-4">
            <p class="mb-0" style="white-space: pre-wrap">
              {{ selectedGroup.reflection }}
            </p>
          </div>

          <!-- Decision -->
          <div class="mb-3">
            <h4>Review decision</h4>

            <div class="form-check">
              <input
                id="approveGroup"
                v-model="groupDecision"
                type="radio"
                value="approve"
                name="groupReviewDecision"
                class="form-check-input"
                :disabled="groupSubmitting"
              />

              <label class="form-check-label" for="approveGroup"> Approve group project </label>
            </div>

            <div class="form-check">
              <input
                id="returnGroup"
                v-model="groupDecision"
                type="radio"
                value="return"
                name="groupReviewDecision"
                class="form-check-input"
                :disabled="groupSubmitting"
              />

              <label class="form-check-label" for="returnGroup"> Return for corrections </label>
            </div>
          </div>

          <!-- Feedback -->
          <div class="mb-3">
            <label for="groupProfessorFeedback" class="form-label">
              Professor feedback
              <span v-if="groupDecision === 'return'" class="text-danger"> * </span>
            </label>

            <textarea
              id="groupProfessorFeedback"
              v-model="groupFeedback"
              class="form-control"
              rows="4"
              :disabled="groupSubmitting"
              :placeholder="
                groupDecision === 'return'
                  ? 'Explain what the group should correct...'
                  : 'Optional feedback for the group...'
              "
            ></textarea>

            <small v-if="groupDecision === 'return'" class="text-muted">
              Feedback is required when returning a group project.
            </small>
          </div>

          <!-- Review error -->
          <div v-if="groupReviewError" role="alert" class="alert alert-danger">
            {{ groupReviewError }}
          </div>

          <!-- Actions -->
          <div class="d-flex gap-2">
            <button
              class="btn"
              :class="groupDecision === 'approve' ? 'btn-success' : 'btn-warning'"
              :disabled="groupSubmitting || (groupDecision === 'return' && !groupFeedback.trim())"
              @click="submitGroupReview"
            >
              {{
                groupSubmitting
                  ? 'Submitting...'
                  : groupDecision === 'approve'
                    ? 'Approve group project'
                    : 'Return group project'
              }}
            </button>

            <button
              class="btn btn-outline-secondary"
              :disabled="groupSubmitting"
              @click="cancelGroupReview"
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
      <section v-if="summary" class="card mb-4" aria-labelledby="summary-heading">
        <div class="card-body">
          <h2 id="summary-heading">Classroom summary</h2>
          <p v-if="summary.startedAttempts === 0" class="text-muted">
            No attempts yet. Numbers appear once students start a challenge.
          </p>
          <dl class="le-tiles">
            <div class="le-tile">
              <dt>Challenge attempts started</dt>
              <dd>{{ summary.startedAttempts }}</dd>
            </div>
            <div class="le-tile">
              <dt>Challenge attempts completed (approved)</dt>
              <dd>{{ summary.completedAttempts }}</dd>
            </div>
            <div class="le-tile">
              <dt>Diagnoses waiting for review</dt>
              <dd>{{ summary.pendingAttemptReviews }}</dd>
            </div>
            <div class="le-tile">
              <dt>Group projects waiting for review</dt>
              <dd>{{ summary.pendingGroupReviews }}</dd>
            </div>
            <div class="le-tile">
              <dt>Help requests waiting for a mentor</dt>
              <dd>{{ summary.openHelpRequests }}</dd>
            </div>
            <div class="le-tile">
              <dt>Times a mentor's answer was marked unresolved</dt>
              <dd>{{ summary.timesMarkedUnresolved }}</dd>
            </div>
          </dl>
          <dl class="le-details mb-4">
            <dt>Most requested kind of hint</dt>
            <dd>{{ summary.mostRequestedHintType.join(', ') || 'None yet' }}</dd>
            <dt>Groups by submission status</dt>
            <dd>
              Draft {{ summary.groupsByStatus.draft }} · Submitted
              {{ summary.groupsByStatus.submitted }} · Approved
              {{ summary.groupsByStatus.approved }} · Returned {{ summary.groupsByStatus.returned }}
            </dd>
          </dl>
          <h3 class="h5">Wrong options on predict-output questions</h3>
          <p class="text-muted small">Times this option was chosen, including retries</p>
          <p v-if="summary.wrongOptions.length === 0" class="text-muted">
            No wrong options chosen yet.
          </p>
          <div
            v-for="question in summary.wrongOptions"
            :key="question.challengeTitle + question.questionPrompt"
            class="mb-3"
          >
            <h4 class="h6 mb-1">{{ question.challengeTitle }}: {{ question.questionPrompt }}</h4>
            <p v-if="question.correctLabel" class="small text-body-secondary mb-1">
              Right answer: {{ question.correctLabel }}
            </p>
            <ul class="le-bars">
              <li v-for="option in question.options" :key="option.optionId" class="le-bar-row">
                <span class="le-bar-label">{{ option.label }}</span>
                <div class="le-bar-track" aria-hidden="true">
                  <div
                    class="le-bar"
                    :style="{ width: (option.count / question.options[0].count) * 100 + '%' }"
                  ></div>
                </div>
                <span class="le-bar-count"
                  >{{ option.count }}<span class="visually-hidden"> times</span></span
                >
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
