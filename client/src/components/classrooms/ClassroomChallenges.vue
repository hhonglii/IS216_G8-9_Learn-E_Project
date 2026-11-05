<script setup>
// The classroom's challenge list and, for the owning professor, the challenge
// editor, where drafts are written, saved, filled in with Gemini and published.
// The classroom page remounts this on every load, so a reload or a change of
// user starts it fresh, and the request counters drop any answer that arrives
// after the professor has moved on. The server checks ownership again on every
// request. The create fields, 201 DTO and failures are in
// docs/worksheets/PHASE_B_WORKSHEET.md. Saved block ids are kept on updates;
// temporary keys never enter requests. Publishing uses the stored draft and locks
// further edits. Hint suggestions are kept only when the professor saves them.
import { RouterLink } from 'vue-router'
import { computed, ref, onUnmounted } from 'vue'
import {
  createChallenge,
  getChallenge,
  updateChallenge,
  publishChallenge,
  deleteChallenge,
  draftHints,
  draftChallengeContent,
} from '@/services/challengesApi.js'
import ChallengeBuilder from '../challenges/ChallengeBuilder.vue'
import ChallengeProgress from '../challenges/ChallengeProgress.vue'
import QuestionRenderer from '../challenges/QuestionRenderer.vue'
import HintDraftSuggestions from '../challenges/HintDraftSuggestions.vue'
import ListEditor from '../shared/ListEditor.vue'
import InfoTip from '../shared/InfoTip.vue'
import ErrorSummary from '../shared/ErrorSummary.vue'
import ReadyChecklist from '../shared/ReadyChecklist.vue'
import AppLoading from '../shared/AppLoading.vue'
import AppAlert from '../shared/AppAlert.vue'
import { fieldHelp } from '@/config/fieldHelp.js'
import { copyDraft, workingCopy, draftPayload, publishChecklist } from '@/utils/challengeEditor.js'
import { describeChallengeError } from '@/utils/challengeErrors.js'
import { apiErrorMessage } from '@/utils/apiError.js'
import { confirmDeleteDraft, confirmPublish } from '@/utils/confirmations.js'
import { reviewStatusText } from '@/utils/reviewStatus.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { commonLanguages, languageHint } from '@/config/languages.js'

const props = defineProps({
  classroomId: { type: String, required: true },
  // The classroom's challenge summaries. Changes go back through update:challenges.
  challenges: { type: Array, default: () => [] },
  isOwningProfessor: { type: Boolean, default: false },
})
// refresh asks the page to load the classroom again.
const emit = defineEmits(['update:challenges', 'refresh'])
const { currentUserId } = useCurrentUser()
// Who the page was loaded for. If someone else has logged in since, an action
// reloads the page instead of acting for them.
const viewerId = currentUserId.value

// The saved DTO and the editable copy never share nested objects.
const savedChallenge = ref(null)
const workingDraft = ref(null)
const saveBusy = ref(false)
const publishBusy = ref(false)
const draftProblems = ref([]) // { message, field } items from the server's reply
const draftProblemAction = ref('publish')
const draftProblemIntro = ref('')
const hintBusy = ref(false)
const hintError = ref('')
const suggestedHints = ref([])
const contentBusy = ref(false)
const contentTarget = ref('')
const contentError = ref('')
const contentProblems = ref({})
// The same problems as a list for the summary beside the Create button, each a
// link up to its field.
const contentProblemList = computed(() =>
  Object.entries(contentProblems.value).map(([field, message]) => ({ field, message })),
)
const contentMessage = ref('')
const saveMessage = ref('')
// Deleting a draft from the list (heuristic 3, user control and freedom).
const deletingId = ref('')
const listMessage = ref('')
const listError = ref('')
const draftBusy = ref(false)
const draftError = ref('')
const authoringBusy = computed(
  () =>
    draftBusy.value || saveBusy.value || publishBusy.value || hintBusy.value || contentBusy.value,
)
const isPublished = computed(() => savedChallenge.value?.status === 'published')
const hasUnsavedChanges = computed(
  () =>
    workingDraft.value &&
    JSON.stringify(workingDraft.value) !== JSON.stringify(workingCopy(savedChallenge.value ?? {})),
)
const contentFields = [
  { key: 'title', label: 'Challenge title', rows: 0 },
  { key: 'language', label: 'Language', rows: 0, hint: languageHint },
  { key: 'objective', label: 'Learning objective', rows: 2 },
  {
    key: 'prompt',
    label: 'Challenge prompt',
    rows: 3,
    hint: 'For example: "averageScore([4, 6, 8]) should return 6, but it returns 4.67."',
  },
  { key: 'codeSnippet', label: 'Code snippet (optional)', rows: 6 },
  { key: 'explanation', label: 'Official explanation', rows: 3 },
]
const coreFields = ['title', 'language', 'objective']
// A field's hint and its error, whichever are showing, for aria-describedby.
function describedBy(field) {
  const ids = []
  if (field.hint) ids.push(`draft-${field.key}-hint`)
  if (contentProblems.value[field.key]) ids.push(`draft-${field.key}-error`)
  return ids.join(' ') || undefined
}

// UX audit items 2 and 4. The fields the server named stay outlined until the
// next save or publish, and the summary's links and the checklist's unticked
// items jump to them.
const problemFields = computed(() => draftProblems.value.map((item) => item.field).filter(Boolean))
const serverProblem = (...fields) => fields.some((field) => problemFields.value.includes(field))
const checklist = computed(() => (workingDraft.value ? publishChecklist(workingDraft.value) : []))
const draftFieldIds = {
  title: 'draft-title',
  language: 'draft-language',
  objective: 'draft-objective',
  prompt: 'draft-prompt',
  codeSnippet: 'draft-codeSnippet',
  explanation: 'draft-explanation',
  appliedCase: 'draft-applied-case',
  'appliedCase.prompt': 'draft-applied-case',
  progressiveHints: 'draft-hint-0',
}
// The id of the control for a field named the server's way (questions.0.options.1),
// so the summary and the checklist can link to it. Block controls follow
// ChallengeBuilder's ids: block-<block id>-prompt and so on.
function draftFieldId(field) {
  if (draftFieldIds[field]) return draftFieldIds[field]
  const hint = /^progressiveHints\.(\d+)$/.exec(field)
  if (hint) return `draft-hint-${hint[1]}`
  if (field === 'questions') return 'block-add'
  const question = /^questions\.(\d+)(?:\.(\w+))?(?:\.(\w+))?/.exec(field)
  const block = question && workingDraft.value?.questions?.[Number(question[1])]
  if (!block) return ''
  const [, , part = 'prompt', detail] = question
  const base = `block-${block.id}`
  const locate = block.type === 'locate-fault'
  if (part === 'options') {
    return locate ? `${base}-location-options-0` : `${base}-options-${Number(detail) || 0}`
  }
  if (part === 'acceptedAnswer') {
    return locate ? `${base}-${detail === 'category' ? 'category' : 'location'}` : `${base}-answer`
  }
  return part === 'explanation' ? `${base}-explanation` : `${base}-prompt`
}
const contentActions = {
  prompt: { label: 'Create challenge prompt', action: 'creating the challenge prompt' },
  codeSnippet: { label: 'Create code', action: 'creating code' },
  explanation: { label: 'Create explanation', action: 'creating the explanation' },
  appliedCasePrompt: {
    label: 'Create applied-case prompt',
    action: 'creating the applied-case prompt',
  },
}
const fieldLabels = {
  title: 'Challenge title',
  language: 'Language',
  objective: 'Learning objective',
  prompt: 'Challenge prompt',
  codeSnippet: 'Code snippet',
}
const contentLimits = {
  title: 200,
  language: 100,
  objective: 2000,
  prompt: 12000,
  codeSnippet: 20000,
}
// UX audit item 22: the draft as a student would see it, with the same question
// components. Answers stay in this page; nothing is saved or marked.
const showPreview = ref(false)
const previewAnswers = ref({})
const previewNote = ref('')
const previewQuestions = computed(() =>
  (workingDraft.value?.questions ?? []).map((question) => ({
    ...question,
    options: question.options.filter((option) => option.label.trim()),
  })),
)
function togglePreview() {
  showPreview.value = !showPreview.value
  previewAnswers.value = {}
  previewNote.value = ''
}
function closePreview() {
  showPreview.value = false
  previewAnswers.value = {}
  previewNote.value = ''
}

let draftRequest = 0
let hintRequest = 0
let contentRequest = 0
function closeDraft() {
  closePreview()
  resetHintSuggestions()
  resetContentGeneration()
  draftRequest++
  savedChallenge.value = null
  workingDraft.value = null
  saveBusy.value = false
  publishBusy.value = false
  draftProblems.value = []
  saveMessage.value = ''
  draftBusy.value = false
  draftError.value = ''
}

async function openDraft(challengeId) {
  if (saveBusy.value || publishBusy.value || hintBusy.value || contentBusy.value) return
  if (currentUserId.value !== viewerId) {
    emit('refresh')
    return
  }
  if (
    !props.isOwningProfessor ||
    !props.challenges.some(
      (challenge) => challenge.id === challengeId && challenge.status === 'draft',
    )
  )
    return
  closePreview()
  resetHintSuggestions()
  resetContentGeneration()
  const request = ++draftRequest
  const requestedClassroomId = props.classroomId
  const requestedUserId = viewerId
  const isCurrent = () =>
    request === draftRequest &&
    props.classroomId === requestedClassroomId &&
    currentUserId.value === requestedUserId &&
    props.isOwningProfessor
  savedChallenge.value = null
  workingDraft.value = null
  saveMessage.value = ''
  draftProblems.value = []
  draftBusy.value = true
  draftError.value = ''
  try {
    const response = await getChallenge(challengeId)
    if (!isCurrent()) return
    if (response.data.classroomId !== requestedClassroomId || response.data.status !== 'draft') {
      draftError.value = 'This draft is no longer available. Refresh the challenge list.'
      return
    }
    savedChallenge.value = copyDraft(response.data)
    workingDraft.value = workingCopy(response.data)
  } catch (err) {
    if (!isCurrent()) return
    draftError.value = describeChallengeError(err, 'open').message
  } finally {
    if (isCurrent()) {
      draftBusy.value = false
    }
  }
}

function startNewDraft() {
  if (saveBusy.value || publishBusy.value || hintBusy.value || contentBusy.value) return
  if (currentUserId.value !== viewerId) {
    emit('refresh')
    return
  }
  if (!props.isOwningProfessor) return
  closeDraft()
  workingDraft.value = workingCopy()
}

async function saveDraft() {
  if (authoringBusy.value || isPublished.value || !workingDraft.value || !props.isOwningProfessor)
    return
  if (currentUserId.value !== viewerId) {
    emit('refresh')
    return
  }
  const request = ++draftRequest
  const requestedClassroomId = props.classroomId
  const requestedUserId = viewerId
  const savedId = savedChallenge.value?.id
  const payload = draftPayload(workingDraft.value, Boolean(savedId))
  const isCurrent = () =>
    request === draftRequest &&
    props.classroomId === requestedClassroomId &&
    currentUserId.value === requestedUserId &&
    props.isOwningProfessor
  saveBusy.value = true
  draftError.value = ''
  draftProblems.value = []
  saveMessage.value = ''
  try {
    const response = savedId
      ? await updateChallenge(savedId, payload)
      : await createChallenge(requestedClassroomId, payload)
    if (!isCurrent()) return
    if (
      response.data.classroomId !== requestedClassroomId ||
      response.data.status !== 'draft' ||
      !response.data.id ||
      (savedId && response.data.id !== savedId)
    ) {
      draftError.value = 'Could not confirm the saved draft. Your edits have been kept.'
      return
    }
    adoptSavedChallenge(response.data)
    saveMessage.value = 'Draft saved.'
  } catch (err) {
    if (!isCurrent()) return
    const problem = describeChallengeError(err, savedId ? 'save' : 'create', workingDraft.value)
    showDraftProblem(problem)
    draftProblemAction.value = 'save'
  } finally {
    if (isCurrent()) saveBusy.value = false
  }
}

function clearDraftError() {
  draftError.value = ''
  draftProblems.value = []
  draftProblemIntro.value = ''
}
// With a list of problems, the advice goes in the summary by the pressed button;
// without one, it shows as the alert at the top of the editor.
function showDraftProblem(problem) {
  draftProblems.value = problem.items
  draftProblemIntro.value = problem.items.length ? problem.message : ''
  draftError.value = problem.items.length ? '' : problem.message
}

async function deleteChallengeDraft(challenge) {
  if (authoringBusy.value || deletingId.value || !confirmDeleteDraft(challenge.title)) return
  deletingId.value = challenge.id
  listMessage.value = ''
  listError.value = ''
  try {
    await deleteChallenge(challenge.id)
    emit(
      'update:challenges',
      props.challenges.filter((item) => item.id !== challenge.id),
    )
    if (savedChallenge.value?.id === challenge.id) closeDraft()
    listMessage.value = `Deleted the draft "${challenge.title}".`
  } catch (err) {
    listError.value = apiErrorMessage(err, "Couldn't delete the draft.")
  } finally {
    deletingId.value = ''
  }
}

function adoptSavedChallenge(data) {
  resetHintSuggestions()
  resetContentGeneration()
  savedChallenge.value = copyDraft(data)
  workingDraft.value = workingCopy(data)
  const summary = { id: data.id, title: data.title, status: data.status }
  const exists = props.challenges.some((item) => item.id === summary.id)
  emit(
    'update:challenges',
    exists
      ? props.challenges.map((item) => (item.id === summary.id ? summary : item))
      : [...props.challenges, summary],
  )
}

// Read the reactive form at click time. Generation never saves or publishes it.
function resetContentGeneration() {
  contentRequest++
  contentBusy.value = false
  contentTarget.value = ''
  contentError.value = ''
  contentProblems.value = {}
  contentMessage.value = ''
}

function clearContentProblem(field) {
  delete contentProblems.value[field]
  contentMessage.value = ''
}

async function generateContent(field) {
  if (
    authoringBusy.value ||
    isPublished.value ||
    !workingDraft.value ||
    !props.isOwningProfessor ||
    !Object.hasOwn(contentActions, field)
  )
    return
  if (currentUserId.value !== viewerId) {
    emit('refresh')
    return
  }
  contentTarget.value = field
  contentError.value = ''
  contentMessage.value = ''
  const required = [...coreFields]
  if (['codeSnippet', 'explanation', 'appliedCasePrompt'].includes(field)) required.push('prompt')
  if (['explanation', 'appliedCasePrompt'].includes(field)) required.push('codeSnippet')
  const problems = {}
  for (const key of required) {
    const value = workingDraft.value[key] ?? ''
    if (!value.trim()) {
      problems[key] =
        `${fieldLabels[key]} above is required before ${contentActions[field].action}.`
    } else if (value.length > contentLimits[key]) {
      problems[key] =
        `${fieldLabels[key]} is too long. Use ${contentLimits[key]} characters or fewer before ${contentActions[field].action}.`
    }
  }
  contentProblems.value = problems
  if (Object.keys(problems).length) return
  const request = ++contentRequest
  const requestedClassroomId = props.classroomId
  const requestedUserId = viewerId
  const draft = workingDraft.value
  const snapshot = JSON.stringify(draft)
  const context = Object.fromEntries(required.map((key) => [key, draft[key]]))
  const isCurrent = () =>
    request === contentRequest &&
    props.classroomId === requestedClassroomId &&
    currentUserId.value === requestedUserId &&
    props.isOwningProfessor &&
    workingDraft.value === draft &&
    !isPublished.value
  contentBusy.value = true
  try {
    const response = await draftChallengeContent(
      requestedClassroomId,
      field,
      context,
      requestedUserId,
    )
    if (!isCurrent()) return
    if (JSON.stringify(draft) !== snapshot) {
      contentError.value =
        'The draft changed while generating. Click the button again to use your latest edits.'
      return
    }
    if (
      response.data?.field !== field ||
      typeof response.data?.content !== 'string' ||
      !response.data.content.trim()
    ) {
      const invalid = new Error('Invalid generated content.')
      invalid.code = 'CONTENT_DRAFTS_FAILED'
      throw invalid
    }
    if (field === 'appliedCasePrompt') {
      workingDraft.value.appliedCase.prompt = response.data.content.trim()
    } else {
      workingDraft.value[field] = response.data.content.trim()
    }
    saveMessage.value = ''
    contentMessage.value = 'Created. Review the result, then save your draft to keep it.'
  } catch (err) {
    if (!isCurrent()) return
    contentError.value = describeChallengeError(err, 'content').message
  } finally {
    if (isCurrent()) contentBusy.value = false
  }
}

async function publishSavedDraft() {
  if (
    authoringBusy.value ||
    !savedChallenge.value?.id ||
    isPublished.value ||
    hasUnsavedChanges.value ||
    !props.isOwningProfessor
  )
    return
  if (currentUserId.value !== viewerId) {
    emit('refresh')
    return
  }
  // Publishing can't be undone, so ask first (third-pass audit S).
  if (!confirmPublish(savedChallenge.value.title, 'start it')) return
  const request = ++draftRequest
  const requestedClassroomId = props.classroomId
  const requestedUserId = viewerId
  const id = savedChallenge.value.id
  const isCurrent = () =>
    request === draftRequest &&
    props.classroomId === requestedClassroomId &&
    currentUserId.value === requestedUserId &&
    props.isOwningProfessor
  publishBusy.value = true
  draftError.value = ''
  draftProblems.value = []
  saveMessage.value = ''
  try {
    const response = await publishChallenge(id)
    if (!isCurrent()) return
    if (
      response.data.id !== id ||
      response.data.classroomId !== requestedClassroomId ||
      response.data.status !== 'published'
    ) {
      draftError.value = 'Could not confirm publication. Refresh the challenge list.'
      return
    }
    adoptSavedChallenge(response.data)
    saveMessage.value = 'Challenge published.'
  } catch (err) {
    if (!isCurrent()) return
    const problem = describeChallengeError(err, 'publish', savedChallenge.value)
    showDraftProblem(problem)
    draftProblemAction.value = 'publish'
  } finally {
    if (isCurrent()) publishBusy.value = false
  }
}

// Suggestions come from the stored draft and stay separate from typed hints.
function resetHintSuggestions() {
  hintRequest++
  hintBusy.value = false
  hintError.value = ''
  suggestedHints.value = []
}
async function suggestHints() {
  if (
    authoringBusy.value ||
    !savedChallenge.value?.id ||
    isPublished.value ||
    !props.isOwningProfessor
  )
    return
  if (currentUserId.value !== viewerId) {
    emit('refresh')
    return
  }
  const request = ++hintRequest
  const requestedClassroomId = props.classroomId
  const requestedUserId = viewerId
  const id = savedChallenge.value.id
  const isCurrent = () =>
    request === hintRequest &&
    props.classroomId === requestedClassroomId &&
    currentUserId.value === requestedUserId &&
    props.isOwningProfessor &&
    savedChallenge.value?.id === id &&
    !isPublished.value
  hintBusy.value = true
  hintError.value = ''
  try {
    const response = await draftHints(id)
    if (!isCurrent()) return
    const hints = response.data?.hints
    if (
      !Array.isArray(hints) ||
      hints.length < 2 ||
      hints.length > 3 ||
      hints.some((hint) => typeof hint !== 'string' || !hint.trim())
    ) {
      const invalid = new Error('Invalid hint suggestions.')
      invalid.code = 'HINT_DRAFTS_FAILED'
      throw invalid
    }
    suggestedHints.value = hints.map((hint) => hint.trim())
  } catch (err) {
    if (!isCurrent()) return
    hintError.value = describeChallengeError(err, 'hints').message
  } finally {
    if (isCurrent()) hintBusy.value = false
  }
}
function useHintSuggestion(hint) {
  if (
    authoringBusy.value ||
    isPublished.value ||
    !workingDraft.value ||
    !savedChallenge.value ||
    !props.isOwningProfessor ||
    !hint.trim()
  )
    return
  if (currentUserId.value !== viewerId) {
    emit('refresh')
    return
  }
  // A suggestion fills the first blank hint row before adding a new one.
  const hints = [...workingDraft.value.progressiveHints]
  const blank = hints.findIndex((item) => !item.trim())
  if (blank === -1) hints.push(hint.trim())
  else hints[blank] = hint.trim()
  workingDraft.value.progressiveHints = hints
}

onUnmounted(() => {
  draftRequest++
  hintRequest++
  contentRequest++
})
</script>
<template>
  <section class="card mt-4" aria-labelledby="classroom-challenges-heading">
    <div class="card-body">
      <div class="le-card-head justify-content-between">
        <div class="d-flex align-items-center gap-2">
          <span class="le-section-icon" aria-hidden="true">
            <svg class="le-icon" viewBox="0 0 16 16">
              <path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" />
            </svg>
          </span>
          <h2 id="classroom-challenges-heading" class="h4 mb-0">Challenges</h2>
        </div>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          :disabled="saveBusy || publishBusy || hintBusy || contentBusy"
          @click="$emit('refresh')"
        >
          Refresh challenges
        </button>
      </div>
      <button
        v-if="isOwningProfessor"
        type="button"
        class="btn btn-primary mb-3"
        :disabled="saveBusy || publishBusy || hintBusy || contentBusy"
        @click="startNewDraft"
      >
        New challenge
      </button>
      <p v-if="listMessage" class="text-success" role="status">{{ listMessage }}</p>
      <!-- The editor opens below the list, which can be long. -->
      <p v-if="isOwningProfessor && (draftBusy || draftError || workingDraft)" class="small">
        <a href="#challenge-authoring">Go to the editor</a>
      </p>
      <AppAlert variant="danger" :message="listError" @dismiss="listError = ''" />
      <ul v-if="challenges.length" class="list-group list-group-flush">
        <li
          v-for="challenge in challenges"
          :key="challenge.id"
          class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-3"
        >
          <template v-if="isOwningProfessor">
            <div>
              <span>{{ challenge.title }}</span>
              <span
                class="badge ms-2"
                :class="challenge.status === 'draft' ? 'le-badge-draft' : 'le-badge-published'"
              >
                <svg
                  v-if="challenge.status === 'draft'"
                  class="le-icon"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path d="M10.5 2.5l3 3L6 13H3v-3z" />
                </svg>
                <svg v-else class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m3 8.5 3 3 7-7" />
                </svg>
                {{ challenge.status === 'draft' ? 'Draft' : 'Published' }}
              </span>
            </div>
            <div v-if="challenge.status === 'draft'" class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-outline-primary btn-sm"
                :disabled="saveBusy || publishBusy || hintBusy || contentBusy"
                :aria-label="`Open draft: ${challenge.title}`"
                @click="openDraft(challenge.id)"
              >
                Open draft
              </button>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                :disabled="authoringBusy || deletingId !== ''"
                :aria-label="`Delete draft: ${challenge.title}`"
                @click="deleteChallengeDraft(challenge)"
              >
                Delete draft
              </button>
            </div>
            <RouterLink
              v-else
              class="btn btn-outline-primary btn-sm"
              :to="{ name: 'challenge', params: { challengeId: challenge.id } }"
              :aria-label="`View challenge: ${challenge.title}`"
            >
              View challenge
            </RouterLink>
          </template>
          <div v-else class="w-100">
            <span class="d-flex align-items-center gap-2">
              <svg class="le-icon text-body-secondary" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
              <RouterLink :to="{ name: 'challenge', params: { challengeId: challenge.id } }">{{
                challenge.title
              }}</RouterLink>
            </span>
            <!-- The student's own progress, as on the challenge page (UX audit item 11) -->
            <ChallengeProgress
              v-if="challenge.progress"
              class="small mt-2"
              :current="challenge.progress.answered"
              :total="challenge.progress.total"
              :status="reviewStatusText[challenge.progress.reviewStatus]"
              :live="false"
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-body-secondary mb-0">
        {{ isOwningProfessor ? 'No challenges yet.' : 'No published challenges yet.' }}
      </p>
    </div>
  </section>
  <section
    v-if="isOwningProfessor && (draftBusy || draftError || workingDraft)"
    id="challenge-authoring"
    tabindex="-1"
    class="card mt-3"
    aria-labelledby="challenge-editor-heading"
    :aria-busy="authoringBusy"
  >
    <div class="card-body">
      <div class="le-card-head">
        <span class="le-section-icon" aria-hidden="true">
          <svg class="le-icon" viewBox="0 0 16 16">
            <path d="M10.5 2.5l3 3L6 13H3v-3z" />
          </svg>
        </span>
        <h2 id="challenge-editor-heading" class="h4 mb-0">
          {{ isPublished ? 'Published challenge' : savedChallenge ? 'Edit draft' : 'New draft' }}
        </h2>
      </div>
      <AppLoading v-if="draftBusy" label="Opening draft" />
      <AppAlert
        v-if="draftError"
        variant="danger"
        :message="draftError"
        @dismiss="clearDraftError"
      />
      <p v-if="savedChallenge" class="text-body-secondary" data-testid="last-saved-title">
        Last saved title: {{ savedChallenge.title }}
      </p>
      <form v-if="workingDraft" @submit.prevent="saveDraft">
        <p class="form-text mt-0">
          Every field is needed to publish except those marked (optional). You can save a draft once
          it has a title, language and learning objective.
        </p>
        <p class="le-callout small">
          Generate each section using the fields above it. Those fields are sent to Google Gemini.
          Review generated content, then save your draft to keep it.
        </p>
        <fieldset :disabled="saveBusy || publishBusy || hintBusy || contentBusy || isPublished">
          <div v-for="field in contentFields" :key="field.key" class="mb-3">
            <label :for="'draft-' + field.key" class="form-label">{{ field.label }}</label>
            <InfoTip v-if="fieldHelp[field.key]" :topic="field.key" />
            <textarea
              v-if="field.rows"
              :id="'draft-' + field.key"
              v-model="workingDraft[field.key]"
              class="form-control"
              :class="{
                'font-monospace': field.key === 'codeSnippet',
                'is-invalid': contentProblems[field.key] || serverProblem(field.key),
              }"
              :rows="field.rows"
              :name="field.key"
              :required="coreFields.includes(field.key)"
              :spellcheck="field.key !== 'codeSnippet'"
              :aria-invalid="
                contentProblems[field.key] || serverProblem(field.key) ? 'true' : undefined
              "
              :aria-describedby="describedBy(field)"
              @input="clearContentProblem(field.key)"
            />
            <input
              v-else
              :id="'draft-' + field.key"
              v-model="workingDraft[field.key]"
              class="form-control"
              :class="{ 'is-invalid': contentProblems[field.key] || serverProblem(field.key) }"
              :name="field.key"
              :list="field.key === 'language' ? 'language-options' : undefined"
              autocomplete="off"
              :required="coreFields.includes(field.key)"
              :aria-invalid="
                contentProblems[field.key] || serverProblem(field.key) ? 'true' : undefined
              "
              :aria-describedby="describedBy(field)"
              @input="clearContentProblem(field.key)"
            />
            <datalist v-if="field.key === 'language'" id="language-options">
              <option v-for="language in commonLanguages" :key="language" :value="language" />
            </datalist>
            <p v-if="field.hint" :id="`draft-${field.key}-hint`" class="form-text mb-0">
              {{ field.hint }}
            </p>
            <p
              v-if="contentProblems[field.key]"
              :id="`draft-${field.key}-error`"
              class="invalid-feedback d-block"
            >
              {{ contentProblems[field.key] }}
            </p>
            <p v-if="field.key === 'codeSnippet'" class="form-text mb-0">
              Add or create code before generating an explanation or applied-case prompt. Code stays
              optional when writing those sections yourself.
            </p>
            <template v-if="contentActions[field.key] && !isPublished">
              <button
                type="button"
                class="btn btn-outline-primary btn-sm mt-2 d-inline-flex align-items-center gap-2"
                :disabled="authoringBusy"
                :aria-describedby="`draft-${field.key}-generation-status`"
                @click="generateContent(field.key)"
              >
                <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M7 1.5l1.2 3.3 3.3 1.2-3.3 1.2L7 10.5 5.8 7.2 2.5 6l3.3-1.2zM12 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"
                  />
                </svg>
                {{ contentActions[field.key].label }}
              </button>
              <ErrorSummary
                v-if="contentTarget === field.key"
                class="mt-2 mb-0"
                heading="Fill these in first"
                list-label="Missing fields"
                :problems="contentProblemList"
                :id-for="draftFieldId"
              />
              <div :id="`draft-${field.key}-generation-status`" aria-live="polite">
                <p
                  v-if="contentBusy && contentTarget === field.key"
                  class="small text-body-secondary mt-2 mb-0"
                  role="status"
                >
                  {{
                    field.key === 'prompt'
                      ? 'Creating challenge prompt…'
                      : field.key === 'codeSnippet'
                        ? 'Creating code…'
                        : 'Creating explanation…'
                  }}
                </p>
                <p
                  v-if="contentError && contentTarget === field.key"
                  class="text-danger mt-2 mb-0"
                  role="alert"
                >
                  {{ contentError }}
                </p>
                <p
                  v-if="contentMessage && contentTarget === field.key"
                  class="small text-success mt-2 mb-0"
                  role="status"
                >
                  {{ contentMessage }}
                </p>
              </div>
            </template>
          </div>
          <ChallengeBuilder
            v-model="workingDraft.questions"
            :problem-fields="problemFields"
            :code-snippet="workingDraft.codeSnippet"
          />
          <div class="mt-4 mb-3">
            <label for="draft-applied-case" class="form-label">Applied-case prompt</label>
            <InfoTip topic="appliedCase" />
            <textarea
              id="draft-applied-case"
              v-model="workingDraft.appliedCase.prompt"
              class="form-control"
              :class="{ 'is-invalid': serverProblem('appliedCase', 'appliedCase.prompt') }"
              rows="3"
              name="appliedCasePrompt"
              :aria-invalid="
                serverProblem('appliedCase', 'appliedCase.prompt') ? 'true' : undefined
              "
              aria-describedby="draft-applied-case-hint"
              @input="clearContentProblem('appliedCasePrompt')"
            />
            <p id="draft-applied-case-hint" class="form-text mb-0">
              For example: "A shop's checkout total leaves out the last item in the cart. Explain
              why, and how you would fix it."
            </p>
            <template v-if="!isPublished">
              <button
                type="button"
                class="btn btn-outline-primary btn-sm mt-2 d-inline-flex align-items-center gap-2"
                :disabled="authoringBusy"
                aria-describedby="draft-applied-case-generation-status"
                @click="generateContent('appliedCasePrompt')"
              >
                <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M7 1.5l1.2 3.3 3.3 1.2-3.3 1.2L7 10.5 5.8 7.2 2.5 6l3.3-1.2zM12 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"
                  />
                </svg>
                {{ contentActions.appliedCasePrompt.label }}
              </button>
              <ErrorSummary
                v-if="contentTarget === 'appliedCasePrompt'"
                class="mt-2 mb-0"
                heading="Fill these in first"
                list-label="Missing fields"
                :problems="contentProblemList"
                :id-for="draftFieldId"
              />
              <div id="draft-applied-case-generation-status" aria-live="polite">
                <p
                  v-if="contentBusy && contentTarget === 'appliedCasePrompt'"
                  class="small text-body-secondary mt-2 mb-0"
                  role="status"
                >
                  Creating applied-case prompt…
                </p>
                <p
                  v-if="contentError && contentTarget === 'appliedCasePrompt'"
                  class="text-danger mt-2 mb-0"
                  role="alert"
                >
                  {{ contentError }}
                </p>
                <p
                  v-if="contentMessage && contentTarget === 'appliedCasePrompt'"
                  class="small text-success mt-2 mb-0"
                  role="status"
                >
                  {{ contentMessage }}
                </p>
              </div>
            </template>
          </div>
          <section aria-label="Progressive hints" class="mb-3">
            <div class="le-heading-tip">
              <h3 class="h5">Progressive hints</h3>
              <InfoTip topic="progressiveHints" />
            </div>
            <ListEditor
              v-model="workingDraft.progressiveHints"
              class="mb-3"
              id-base="draft-hint"
              item-name="Hint"
              add-label="Add hint"
              :min-rows="2"
            />
            <HintDraftSuggestions
              v-if="savedChallenge && !isPublished"
              v-model="suggestedHints"
              :busy="hintBusy"
              :disabled="saveBusy || publishBusy || contentBusy"
              :error="hintError"
              @suggest="suggestHints"
              @use-hint="useHintSuggestion"
            />
          </section>
          <ErrorSummary
            v-if="draftProblemAction === 'save'"
            heading="Fix these to save"
            list-label="Draft problems"
            :intro="draftProblemIntro"
            :problems="draftProblems"
            :id-for="draftFieldId"
          />
          <button v-if="!isPublished" type="submit" class="btn btn-primary mt-2">
            {{ savedChallenge ? 'Save changes' : 'Save draft' }}
          </button>
          <!-- One line: what the last save or publish did, else the save state. It sits under
               the Save button (fifth pass W2), where the professor is looking after a save. -->
          <p v-if="saveMessage && !hasUnsavedChanges" class="text-success mt-2 mb-0" role="status">
            {{ saveMessage }}
          </p>
          <p v-else class="text-body-secondary mt-2 mb-0" role="status">
            {{
              savedChallenge
                ? hasUnsavedChanges
                  ? 'Unsaved changes.'
                  : 'All changes saved.'
                : 'This draft has not been saved yet.'
            }}
          </p>
        </fieldset>
      </form>
      <ReadyChecklist
        v-if="workingDraft && !isPublished"
        class="mt-3"
        heading="Ready to publish?"
        :items="checklist"
        :id-for="draftFieldId"
      />
      <button
        v-if="workingDraft"
        type="button"
        class="btn btn-outline-primary mt-3"
        aria-controls="student-preview"
        :aria-expanded="showPreview ? 'true' : 'false'"
        @click="togglePreview"
      >
        {{ showPreview ? 'Hide student preview' : 'Preview as student' }}
      </button>
      <section
        v-if="workingDraft && showPreview"
        id="student-preview"
        class="card mt-3"
        aria-labelledby="student-preview-heading"
      >
        <div class="card-body p-4">
          <h3 id="student-preview-heading" class="h5">Student preview</h3>
          <p class="text-body-secondary">
            This is how students will see this draft, including unsaved changes. Answers here aren't
            saved or marked, and hints and your explanations stay hidden.
          </p>
          <h4 class="h5">{{ workingDraft.title || 'Untitled challenge' }}</h4>
          <p v-if="workingDraft.objective" class="text-body-secondary">
            {{ workingDraft.objective }}
          </p>
          <p v-if="workingDraft.language" class="le-chip">
            Language: <span class="font-monospace">{{ workingDraft.language }}</span>
          </p>
          <p v-if="workingDraft.prompt" class="le-request-text">{{ workingDraft.prompt }}</p>
          <template v-if="workingDraft.codeSnippet">
            <h5 class="h6 text-body-secondary">Code snippet</h5>
            <pre class="le-code le-code-numbered mb-3"><code><span
              v-for="(line, index) in workingDraft.codeSnippet.split('\n')"
              :key="index"
              class="le-code-line"
            >{{ line }}</span></code></pre>
          </template>
          <p v-if="previewQuestions.length === 0" class="text-body-secondary">No questions yet.</p>
          <div v-for="(question, index) in previewQuestions" :key="question.id" class="card mb-3">
            <div class="card-body p-4">
              <h5 class="h6 card-title">Question {{ index + 1 }}</h5>
              <QuestionRenderer
                :question="question"
                :answer="previewAnswers[question.id]"
                @update:answer="(value) => (previewAnswers[question.id] = value)"
                @submit="previewNote = 'Nothing is marked in the preview.'"
              />
            </div>
          </div>
          <p class="text-body-secondary" role="status">{{ previewNote }}</p>
          <template v-if="workingDraft.appliedCase.prompt">
            <h5 class="h6">Applied case</h5>
            <p class="le-request-text mb-0">{{ workingDraft.appliedCase.prompt }}</p>
          </template>
        </div>
      </section>
      <div v-if="savedChallenge && !isPublished" class="mt-3">
        <ErrorSummary
          v-if="draftProblemAction === 'publish'"
          heading="Fix these to publish"
          list-label="Publication problems"
          :intro="draftProblemIntro"
          :problems="draftProblems"
          :id-for="draftFieldId"
        />
        <p v-if="hasUnsavedChanges" class="text-body-secondary">
          Save your changes before publishing.
        </p>
        <button
          type="button"
          class="btn btn-success"
          :disabled="authoringBusy || hasUnsavedChanges"
          @click="publishSavedDraft"
        >
          Publish challenge
        </button>
      </div>
      <AppLoading v-if="saveBusy" label="Saving draft" />
      <AppLoading v-if="publishBusy" label="Publishing challenge" />
      <p v-if="isPublished" class="text-body-secondary">
        Published challenges are locked for editing.
      </p>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm mt-3"
        :disabled="saveBusy || publishBusy || hintBusy || contentBusy"
        @click="closeDraft"
      >
        {{ isPublished ? 'Close challenge' : 'Close draft' }}
      </button>
    </div>
  </section>
</template>
