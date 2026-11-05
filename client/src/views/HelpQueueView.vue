<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — help queue
//  Students ask for one of two kinds of help (decision H-14): question help
//  about one question of a published challenge, or general class help about
//  anything else in the classroom. A mentor claims the request and answers it,
//  and the asker marks the hint helpful or unresolved. A ?challenge= id in the
//  address picks that challenge when it is listed.
//  Professors only follow the queue: the server refuses their requests and
//  claims, so the ask form and the Claim buttons are hidden for them.
//  Each card has its own pending flag and error, and every claim reloads the
//  queue, because a 409 means someone else claimed it first. The asker can
//  withdraw a request nobody has claimed (UX audit A2), and a mentor can give
//  a claimed request back before sending a hint (UX audit A3).
// ════════════════════════════════════════════════════════════════════
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import HelpRequestForm from '@/components/mentoring/HelpRequestForm.vue'
import HelpRequestCard from '@/components/mentoring/HelpRequestCard.vue'
import * as helpRequestsApi from '@/services/helpRequestsApi.js'
import * as classroomsApi from '@/services/classroomsApi.js'
import { getChallenge } from '@/services/challengesApi.js'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { apiErrorMessage } from '@/utils/apiError.js'
import { hintTypes } from '@/config/hintTypes.js'
const route = useRoute()

const mentorGuide = (hintType) => hintTypes.find((hint) => hint.value === hintType)?.mentor ?? ''

//get from url
const classroomId = computed(() => route.params.classroomId)

const { currentUser, currentUserId } = useCurrentUser()
const isProfessor = computed(() => currentUser.value?.role === 'professor')

//reactive variables
const requests = ref([])
const loading = ref(false)
const loadError = ref('')
const challenges = ref([]) // published challenges
const helpKind = ref('question') // 'question' or 'general'
const chosenChallengeId = ref('') // question help: the form's contextId
const questions = ref([]) // the chosen challenge's questions, in the order students see them
const questionsError = ref('')
const chosenQuestionId = ref('')
const selectedId = ref(null)
const responseDraft = ref('')
const pending = ref({}) // per request: { [id]: true }
const actionErrors = ref({}) // per request: { [id]: "message" }
const queueMessage = ref('') // says what the last withdraw or give-back did
const formMessage = ref('') // says the last request was sent, beside the form
const notes = ref({}) // per request: what the last claim or hint did, beside the card
const formBusy = ref(false)
const formError = ref('')
const formKey = ref(0) // empty form after a successful send

// message for the user
const statusText = {
  open: 'Waiting for a mentor to pick it up',
  claimed: 'A mentor is writing a hint',
  responded: 'A hint has been sent; waiting for the asker to say if it helped',
  resolved: 'Resolved',
}
// The caption speaks to the viewer when the request is theirs to act on
// (third-pass audit F and L).
function captionFor(request) {
  const me = currentUserId.value
  if (request.status === 'claimed' && request.mentorId === me) {
    return selectedId.value === request.id
      ? 'You claimed this. Write your hint below.'
      : 'You claimed this. Open it to write your hint.'
  }
  if (request.status === 'responded' && request.requesterId === me) {
    return 'Your mentor sent a hint. Open it to say if it helped.'
  }
  if (request.status === 'responded' && request.mentorId === me) {
    return 'You sent a hint. Waiting for the asker to say if it helped.'
  }
  return statusText[request.status]
}

//error-handling
function errorInfo(err) {
  return { status: err.status ?? err.response?.status, message: apiErrorMessage(err) }
}

//load the queue
let latestLoad = 0
async function loadQueue() {
  if (!classroomId.value) return
  const thisLoad = ++latestLoad
  loading.value = true
  loadError.value = ''
  try {
    const result = await helpRequestsApi.listHelpRequests(classroomId.value)
    if (thisLoad !== latestLoad) {
      return
    } // a newer load exists, ignore this answer
    requests.value = result.data // the server's { data: [...] } envelope
  } catch (err) {
    if (thisLoad !== latestLoad) return
    loadError.value = errorInfo(err).message
  } finally {
    if (thisLoad === latestLoad) loading.value = false
  }
}

//load published challenges
async function loadChallenges() {
  if (!classroomId.value) return
  try {
    const result = await classroomsApi.getClassroom(classroomId.value)
    challenges.value = result.data.challenges ?? []
    const fromAddress = route.query.challenge
    if (challenges.value.some((c) => c.id === fromAddress)) {
      chosenChallengeId.value = fromAddress
      loadQuestions(fromAddress, route.query.question)
    }
  } catch {
    challenges.value = []
  }
}

// The question list comes with the challenge itself. A newer pick wins. A question id
// from the address (the challenge page's Ask a classmate link) is picked for the student.
let latestQuestions = 0
async function loadQuestions(challengeId, questionFromAddress) {
  const thisLoad = ++latestQuestions
  questions.value = []
  questionsError.value = ''
  chosenQuestionId.value = ''
  if (!challengeId) return
  try {
    const result = await getChallenge(challengeId)
    if (thisLoad !== latestQuestions) return
    questions.value = result.data.questions ?? []
    if (questions.value.some((q) => q.id === questionFromAddress)) {
      chosenQuestionId.value = questionFromAddress
    }
  } catch (err) {
    if (thisLoad !== latestQuestions) return
    questionsError.value = apiErrorMessage(err, "Couldn't load this challenge's questions.")
  }
}

const chosenQuestionNumber = computed(
  () => questions.value.findIndex((q) => q.id === chosenQuestionId.value) + 1,
)
const chosenQuestion = computed(() => questions.value[chosenQuestionNumber.value - 1] ?? null)

// Short labels for the question list, so a long prompt fits in the menu.
function questionOption(question, index) {
  const prompt = question.prompt.length > 70 ? question.prompt.slice(0, 69) + '…' : question.prompt
  return prompt ? `Question ${index + 1}: ${prompt}` : `Question ${index + 1}`
}

// What a request is about, for headings and messages. Requests from before
// H-14 have a challenge but no question number.
function requestTopic(request) {
  if (request.kind === 'general') return 'general class help'
  const title = `"${request.challengeTitle ?? 'this challenge'}"`
  return request.questionNumber ? `question ${request.questionNumber} of ${title}` : title
}
function requestHeading(request) {
  if (request.kind === 'general') return 'General class help'
  return request.questionNumber
    ? `${request.challengeTitle}, question ${request.questionNumber}`
    : request.challengeTitle
}

//
function resetAndReload() {
  // Clear whatever was selected for the previous classroom/user
  selectedId.value = null
  helpKind.value = 'question'
  chosenChallengeId.value = ''
  loadQuestions('')

  loadQueue()
  loadChallenges()
}

watch([classroomId, currentUserId], resetAndReload, { immediate: true })

//ask for help
async function onSubmitRequest(payload) {
  formBusy.value = true
  formError.value = ''
  formMessage.value = ''
  try {
    await helpRequestsApi.createHelpRequest(payload)
    if (payload.contextType === 'classroom') {
      formMessage.value = 'Sent your general class help request. A classmate will pick it up.'
    } else {
      const title = challenges.value.find((c) => c.id === chosenChallengeId.value)?.title
      formMessage.value = `Sent your help request about question ${chosenQuestionNumber.value} of "${title ?? 'this challenge'}". A mentor will pick it up.`
    }
    formKey.value++ // reset the form
    await loadQueue()
  } catch (err) {
    formError.value = errorInfo(err).message // the form keeps its text on failure
  } finally {
    formBusy.value = false
  }
}

// per request
async function runAction(requestId, action) {
  queueMessage.value = ''
  notes.value = { ...notes.value, [requestId]: '' }
  pending.value = { ...pending.value, [requestId]: true }
  actionErrors.value = { ...actionErrors.value, [requestId]: '' }
  try {
    await action()
    return true
  } catch (err) {
    const { status, message } = errorInfo(err)
    actionErrors.value = {
      ...actionErrors.value,
      [requestId]:
        status === 409 ? 'Someone else got there first, or this request just changed.' : message,
    }
    return false
  } finally {
    pending.value = { ...pending.value, [requestId]: false }
  }
}

// claim event
// A successful claim opens the request, so the hint box is right below the card.
async function onClaim(requestId) {
  const ok = await runAction(requestId, () => helpRequestsApi.claimHelpRequest(requestId))
  await loadQueue() // success or 409
  if (ok) {
    onOpen(requestId)
    notes.value = { ...notes.value, [requestId]: 'You claimed this request.' }
  }
}

// card "withdraw" event: asks first, because the request and its details go for good
async function onWithdraw(requestId) {
  const request = requests.value.find((r) => r.id === requestId)
  const topic = request ? requestTopic(request) : '"this challenge"'
  if (!window.confirm(`Withdraw your help request about ${topic}? This can't be undone.`)) return
  const ok = await runAction(requestId, () => helpRequestsApi.withdrawHelpRequest(requestId))
  if (ok) queueMessage.value = `Withdrew your help request about ${topic}.`
  await loadQueue()
}

// mentor gives a claimed request back; a 409 means the hint was already sent
async function onUnclaim() {
  const request = selected.value
  if (!request) return
  const ok = await runAction(request.id, () => helpRequestsApi.unclaimHelpRequest(request.id))
  if (ok) queueMessage.value = `Gave the request about ${requestTopic(request)} back to the queue.`
  await loadQueue()
}

// card "open" event
function onOpen(requestId) {
  if (selectedId.value !== requestId) {
    responseDraft.value = ''
  }
  selectedId.value = requestId
}

async function onSendResponse() {
  const request = selected.value
  if (!request) return
  const updating = request.status === 'responded'
  const ok = await runAction(request.id, () =>
    helpRequestsApi.respondToHelpRequest(request.id, responseDraft.value),
  )
  if (ok) {
    responseDraft.value = '' // on failure the text stays
    notes.value = {
      ...notes.value,
      [request.id]: updating ? 'Updated your hint.' : 'Sent your hint.',
    }
  }
  await loadQueue()
}

async function onResolve(value) {
  const request = selected.value
  if (!request) return
  await runAction(request.id, () => helpRequestsApi.resolveHelpRequest(request.id, value))
  await loadQueue()
}

const selected = computed(() => requests.value.find((r) => r.id === selectedId.value) ?? null)
const isRequester = computed(
  () => !!selected.value && selected.value.requesterId === currentUserId.value,
)
const isMentor = computed(() => !!selected.value && selected.value.mentorId === currentUserId.value)
const canRespond = computed(
  () => isMentor.value && ['claimed', 'responded'].includes(selected.value.status),
)
const canUnclaim = computed(() => isMentor.value && selected.value?.status === 'claimed')
const canResolve = computed(() => isRequester.value && selected.value?.status === 'responded')
const showHint = computed(
  () =>
    !!selected.value?.mentorResponse && ['responded', 'resolved'].includes(selected.value.status),
)
</script>
<template>
  <section aria-labelledby="help-queue-heading">
    <header class="mb-4">
      <h1 id="help-queue-heading" class="le-page-title le-title-dot">Help queue</h1>
      <p class="text-body-secondary mb-0">
        {{
          isProfessor
            ? "Follow your students' help requests and the hints their mentors send."
            : 'Ask for a targeted hint, or help a classmate with a question or a problem in this class.'
        }}
      </p>
    </header>

    <section v-if="!isProfessor" class="card mb-4" aria-labelledby="ask-heading">
      <div class="card-body p-4">
        <div class="le-card-head">
          <span class="le-section-icon" aria-hidden="true">
            <svg class="le-icon" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" />
              <path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M8 11.2v.1" />
            </svg>
          </span>
          <h2 id="ask-heading" class="h4 mb-0">Ask for help</h2>
        </div>
        <fieldset class="mb-3">
          <legend class="form-label fs-6 fw-semibold">What do you need help with?</legend>
          <div class="form-check le-hint-choice">
            <input
              id="help-kind-question"
              v-model="helpKind"
              class="form-check-input"
              type="radio"
              name="help-kind"
              value="question"
            />
            <label for="help-kind-question" class="form-check-label">
              <span class="fw-semibold">A challenge question</span>
              <span class="d-block form-text mt-0">
                Pick the challenge and the question. Classmates whose diagnosis on that challenge
                was approved can answer.
              </span>
            </label>
          </div>
          <div class="form-check le-hint-choice">
            <input
              id="help-kind-general"
              v-model="helpKind"
              class="form-check-input"
              type="radio"
              name="help-kind"
              value="general"
            />
            <label for="help-kind-general" class="form-check-label">
              <span class="fw-semibold">Something else in this class</span>
              <span class="d-block form-text mt-0">
                Share the code, what you expected and what happened instead. Any classmate can
                answer.
              </span>
            </label>
          </div>
        </fieldset>

        <template v-if="helpKind === 'question'">
          <div class="mb-3 le-help-pick">
            <label for="challenge-pick" class="form-label"
              >Which challenge do you need help with?</label
            >
            <select
              id="challenge-pick"
              v-model="chosenChallengeId"
              class="form-select"
              @change="loadQuestions($event.target.value)"
            >
              <option value="" disabled>Choose a challenge</option>
              <option v-for="c in challenges" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
          <p v-if="questionsError" role="alert" class="alert alert-danger">{{ questionsError }}</p>
          <div v-if="questions.length" class="mb-3 le-help-pick">
            <label for="question-pick" class="form-label">Which question?</label>
            <select id="question-pick" v-model="chosenQuestionId" class="form-select">
              <option value="" disabled>Choose a question</option>
              <option v-for="(q, index) in questions" :key="q.id" :value="q.id">
                {{ questionOption(q, index) }}
              </option>
            </select>
          </div>
          <div v-if="chosenQuestion" class="le-callout mb-3">
            <h3 class="h6">Question {{ chosenQuestionNumber }}</h3>
            <p class="mb-0 le-request-text">{{ chosenQuestion.prompt }}</p>
          </div>
          <HelpRequestForm
            v-if="chosenQuestion"
            :key="formKey"
            kind="question"
            :context-id="chosenChallengeId"
            :question-id="chosenQuestionId"
            :busy="formBusy"
            @submit="onSubmitRequest"
          />
        </template>
        <HelpRequestForm
          v-else
          :key="'general' + formKey"
          kind="general"
          :context-id="classroomId"
          :busy="formBusy"
          @submit="onSubmitRequest"
        />
        <p v-if="formError" role="alert" class="alert alert-danger mt-3 mb-0">{{ formError }}</p>
        <p v-if="formMessage" role="status" class="text-success mt-3 mb-0">{{ formMessage }}</p>
      </div>
    </section>

    <section aria-labelledby="queue-heading">
      <div class="le-card-head justify-content-between">
        <h2 id="queue-heading" class="h4 mb-0">Requests</h2>
        <span v-if="requests.length" class="le-chip le-num">
          {{ requests.length }} {{ requests.length === 1 ? 'request' : 'requests' }}
        </span>
      </div>

      <div v-if="loadError" role="alert" class="alert alert-danger le-alert-row">
        <span>{{ loadError }}</span>
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="loadQueue">
          Try again
        </button>
      </div>
      <p v-if="queueMessage" class="text-success" role="status">{{ queueMessage }}</p>
      <p v-if="loading && requests.length === 0" class="le-chip">Loading the help queue…</p>

      <div v-else-if="requests.length === 0 && !loadError" class="card">
        <p class="card-body text-body-secondary mb-0">No help requests yet.</p>
      </div>

      <ul v-else-if="requests.length" class="le-queue">
        <li
          v-for="request in requests"
          :key="request.id"
          :aria-current="selectedId === request.id ? 'true' : undefined"
        >
          <HelpRequestCard
            :class="{ 'le-card-selected': selectedId === request.id }"
            :request="request"
            :can-claim="request.canClaim"
            :busy="!!pending[request.id]"
            :own="request.requesterId === currentUserId"
            :show-claim="!isProfessor"
            @claim="onClaim"
            @open="onOpen"
            @withdraw="onWithdraw"
          />
          <p class="le-queue-caption">{{ captionFor(request) }}</p>
          <p v-if="notes[request.id]" role="status" class="text-success mt-2 mb-0">
            {{ notes[request.id] }}
          </p>
          <p v-if="actionErrors[request.id]" role="alert" class="alert alert-danger mt-2 mb-0">
            {{ actionErrors[request.id] }}
          </p>

          <section
            v-if="selected && selected.id === request.id"
            class="card mt-3"
            :aria-labelledby="`request-details-${selected.id}`"
          >
            <div class="card-body p-4">
              <h3 :id="`request-details-${selected.id}`" class="h5">
                {{ requestHeading(selected) }}
              </h3>
              <!-- Question help shows the question; general class help and requests
                   from before H-14 show what the asker wrote. -->
              <dl class="le-details">
                <template v-if="selected.questionPrompt">
                  <dt>Question</dt>
                  <dd>{{ selected.questionPrompt }}</dd>
                </template>
                <!-- The server sends these two only to people who may see them (items 12, 17). -->
                <template v-if="selected.askerAnswer">
                  <dt>{{ isRequester ? 'Your last answer' : 'Their last answer' }}</dt>
                  <dd class="le-pre-line">{{ selected.askerAnswer }}</dd>
                </template>
                <template v-if="selected.challengeCode">
                  <dt>Challenge code</dt>
                  <dd>
                    <pre class="le-code le-code-numbered"><code><span
                      v-for="(line, index) in selected.challengeCode.split('\n')"
                      :key="index"
                      class="le-code-line"
                    >{{ line }}</span></code></pre>
                  </dd>
                </template>
                <template v-if="selected.codeSnippet">
                  <dt>Code</dt>
                  <dd>
                    <pre class="le-code"><code>{{ selected.codeSnippet }}</code></pre>
                  </dd>
                </template>
                <template v-if="selected.expectedBehaviour">
                  <dt>Expected</dt>
                  <dd>{{ selected.expectedBehaviour }}</dd>
                </template>
                <template v-if="selected.actualBehaviour">
                  <dt>Actual</dt>
                  <dd>{{ selected.actualBehaviour }}</dd>
                </template>
                <template v-if="selected.attemptedReasoning">
                  <dt>Tried</dt>
                  <dd>{{ selected.attemptedReasoning }}</dd>
                </template>
                <template v-if="selected.suspectedCause">
                  <dt>Suspected cause</dt>
                  <dd>{{ selected.suspectedCause }}</dd>
                </template>
                <dt>Hint wanted</dt>
                <dd>{{ selected.hintType }}</dd>
              </dl>
              <p v-if="selected.reopenCount > 0" class="le-chip le-num">
                Reopened {{ selected.reopenCount }}
                {{ selected.reopenCount === 1 ? 'time' : 'times' }}.
              </p>

              <div v-if="showHint" class="le-callout mb-3">
                <h4 class="h6">Mentor's hint</h4>
                <p>{{ selected.mentorResponse }}</p>
              </div>

              <div v-if="canRespond" class="le-subpanel mb-3">
                <label for="hint" class="form-label">
                  Your hint ({{ selected.hintType }}), up to 1000 characters
                </label>
                <!-- What a good hint is, in view while writing it (UX audit item 13). -->
                <p id="hint-guide" class="form-text mt-0 mb-2">
                  Point them in the right direction, but don't give them the answer.
                  {{ mentorGuide(selected.hintType) }}
                </p>
                <textarea
                  id="hint"
                  v-model="responseDraft"
                  class="form-control"
                  maxlength="1000"
                  rows="4"
                  aria-describedby="hint-guide hint-count"
                />
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                  <span id="hint-count" class="form-text le-num mt-0">
                    {{ responseDraft.length }} / 1000
                    <template v-if="selected.status === 'responded'">
                      · Sending again replaces your hint.
                    </template>
                  </span>
                  <div class="d-flex flex-wrap gap-2">
                    <button
                      v-if="canUnclaim"
                      type="button"
                      class="btn btn-outline-secondary"
                      :disabled="pending[selected.id]"
                      @click="onUnclaim"
                    >
                      Give back to the queue
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary"
                      :disabled="!responseDraft.trim() || pending[selected.id]"
                      @click="onSendResponse"
                    >
                      {{ selected.status === 'responded' ? 'Update hint' : 'Send hint' }}
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="canResolve" class="le-subpanel mb-3">
                <p class="fw-semibold">Did this hint help?</p>
                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="pending[selected.id]"
                    @click="onResolve('helpful')"
                  >
                    Helpful
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    :disabled="pending[selected.id]"
                    @click="onResolve('unresolved')"
                  >
                    Unresolved
                  </button>
                </div>
              </div>
            </div>
          </section>
        </li>
      </ul>
    </section>
  </section>
</template>
