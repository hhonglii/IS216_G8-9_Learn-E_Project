<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — the professor's Boss Battle editor
//  Choose a monster and hearts, add questions, check the readiness list, fight
//  the boss, publish. Each edit calls edited(), which autosaves one request at a
//  time. Publishing locks the questions, and unpublishing unlocks them. Course
//  techniques only (decision H-17): new questions and the checklist are reached
//  through #id links, not by moving the focus from the script.
// ════════════════════════════════════════════════════════════════════
import { computed, onBeforeUnmount, ref } from 'vue'
import * as classroomGamesApi from '@/services/classroomGamesApi.js'
import {
  MAX_QUESTIONS,
  duplicateQuestion,
  newQuestion,
  readinessChecklist,
} from '@/utils/bossBattleEditor.js'
import { createPreviewEngine, playableQuestions } from '@/utils/bossBattlePreview.js'
import { bosses, findBoss } from './bosses.js'
import BossPortrait from './BossPortrait.vue'
import BossBattle from './BossBattle.vue'
import BossBattleResults from './BossBattleResults.vue'
import GameQuestionCard from './GameQuestionCard.vue'
import QuestionGeneratePanel from './QuestionGeneratePanel.vue'
import InfoTip from '@/components/shared/InfoTip.vue'

const props = defineProps({
  classroomId: { type: String, required: true },
  initialGame: { type: Object, default: null },
  errorMessage: { type: Function, required: true },
})

const AUTOSAVE_DELAY = 800
const heartChoices = Array.from({ length: 10 }, (_, index) => index + 1)

const draft = ref({
  title: props.initialGame?.title ?? '',
  bossId: props.initialGame?.bossId ?? bosses[0].id,
  hearts: props.initialGame?.hearts ?? 3,
  questions: props.initialGame?.questions ?? [],
})
const status = ref(props.initialGame?.status ?? 'draft')
const isPublished = computed(() => status.value === 'published')

const saveState = ref(props.initialGame ? 'saved' : 'new') // new | dirty | saving | saved | error
const saveError = ref('')
const actionBusy = ref(false)
const actionError = ref('')
const publishProblems = ref([])
const panel = ref('') // '' | 'generate'
const previewing = ref(false)
const previewKey = ref(0)
const added = ref(null) // the last questions added: { id of the first, count }

const checklist = computed(() => readinessChecklist(draft.value))
const spaceLeft = computed(() => MAX_QUESTIONS - draft.value.questions.length)
const canPreview = computed(() => playableQuestions(draft.value).length > 0)
const previewEngine = computed(() => createPreviewEngine(draft.value))
const previewGame = computed(() => ({
  title: draft.value.title.trim() || 'Your battle',
  bossId: draft.value.bossId,
  hearts: draft.value.hearts,
  questionCount: playableQuestions(draft.value).length,
}))
// The note under the add buttons, with a link to the first new question.
const addedNote = computed(() => {
  if (!added.value) return null
  const number = draft.value.questions.findIndex((item) => item.id === added.value.id) + 1
  if (!number) return null
  const text =
    added.value.count === 1 ? `Question ${number} added.` : `Added ${added.value.count} questions.`
  return { text, number, href: `#game-question-${added.value.id}-prompt` }
})
const saveLabel = computed(
  () =>
    ({
      // Nothing to say until the first change (G13).
      new: '',
      dirty: 'Unsaved changes',
      saving: 'Saving…',
      saved: 'All changes saved',
      error: 'Not saved',
    })[saveState.value],
)

// ── Autosave: only ever one request in flight. Changes made during a save
//    trigger another save when it finishes, so the last edit always lands.
let timer
let inFlight = null
let changedDuringSave = false

async function runSave() {
  saveState.value = 'saving'
  saveError.value = ''
  try {
    await classroomGamesApi.saveClassroomGame(props.classroomId, draft.value)
    saveState.value = changedDuringSave ? 'dirty' : 'saved'
    return true
  } catch (err) {
    saveState.value = 'error'
    saveError.value = props.errorMessage(err)
    return false
  } finally {
    inFlight = null
    if (changedDuringSave) {
      changedDuringSave = false
      scheduleSave()
    }
  }
}

function saveNow() {
  clearTimeout(timer)
  if (inFlight) {
    changedDuringSave = true
    return inFlight
  }
  inFlight = runSave()
  return inFlight
}

function scheduleSave() {
  clearTimeout(timer)
  timer = setTimeout(saveNow, AUTOSAVE_DELAY)
}

// Every change to the draft calls this, from the field's own event or the function
// that made the change.
function edited() {
  if (isPublished.value) return
  saveState.value = 'dirty'
  if (inFlight) changedDuringSave = true
  else scheduleSave()
}

onBeforeUnmount(() => {
  clearTimeout(timer)
  if (saveState.value === 'dirty' || saveState.value === 'error') {
    classroomGamesApi.saveClassroomGame(props.classroomId, draft.value).catch(() => {})
  }
})

// ── Questions
function addQuestion() {
  if (spaceLeft.value <= 0) return
  const question = newQuestion()
  draft.value.questions.push(question)
  added.value = { id: question.id, count: 1 }
  edited()
}

function updateQuestion(id, changes) {
  const question = draft.value.questions.find((item) => item.id === id)
  if (!question) return
  Object.assign(question, changes)
  edited()
}

function moveQuestion(index, direction) {
  const list = draft.value.questions
  const destination = index + direction
  if (destination < 0 || destination >= list.length) return
  ;[list[index], list[destination]] = [list[destination], list[index]]
  edited()
}

function duplicate(index) {
  if (spaceLeft.value <= 0) return
  const copy = duplicateQuestion(draft.value.questions[index])
  draft.value.questions.splice(index + 1, 0, copy)
  added.value = { id: copy.id, count: 1 }
  edited()
}

// Autosave stores a removal at once and there is no undo, so a question with
// anything typed in it is only removed once the professor confirms.
function removeQuestion(index) {
  const question = draft.value.questions[index]
  const hasContent =
    question.prompt.trim() ||
    question.code.trim() ||
    question.explanation.trim() ||
    question.options.some((option) => option.label.trim())
  if (hasContent && !window.confirm(`Remove question ${index + 1}? This can't be undone.`)) return
  draft.value.questions.splice(index, 1)
  edited()
}

function addMany(questions) {
  if (!questions.length) return
  draft.value.questions.push(...questions)
  panel.value = ''
  added.value = { id: questions[0].id, count: questions.length }
  edited()
}

// Where each checklist link goes: the title box, the Add question button, or the
// question box of the question that needs work.
function targetId(target) {
  if (target === 'title') return 'game-title'
  if (target === 'questions') return 'game-add-question'
  return `game-question-${target}-prompt`
}

// ── Publishing
async function publish() {
  const sure = window.confirm(
    'Publish this battle? Students can play it straight away, and its questions stay locked until you unpublish it.',
  )
  if (!sure) return
  actionBusy.value = true
  actionError.value = ''
  publishProblems.value = []
  try {
    // Publishing checks what is stored, so the latest edits must be stored first.
    if (inFlight) await inFlight
    if (saveState.value !== 'saved' && !(await saveNow())) {
      actionError.value = saveError.value
      return
    }
    await classroomGamesApi.publishClassroomGame(props.classroomId)
    status.value = 'published'
    panel.value = ''
  } catch (err) {
    actionError.value = props.errorMessage(err)
    const details = err.response?.data?.error?.details
    if (Array.isArray(details)) publishProblems.value = details.map((detail) => detail.message)
  } finally {
    actionBusy.value = false
  }
}

async function unpublish() {
  const sure = window.confirm(
    'Unpublish this battle? Students will see that no game has been created, any battle in progress ends, and results start fresh when you publish again.',
  )
  if (!sure) return
  actionBusy.value = true
  actionError.value = ''
  try {
    await classroomGamesApi.unpublishClassroomGame(props.classroomId)
    status.value = 'draft'
    saveState.value = 'saved'
  } catch (err) {
    actionError.value = props.errorMessage(err)
  } finally {
    actionBusy.value = false
  }
}

function openPreview() {
  previewKey.value++
  previewing.value = true
}
</script>

<template>
  <!-- The preview swaps in over the editor, whose fields stay exactly as they were. -->
  <section v-if="previewing" aria-label="Boss battle preview">
    <div class="le-callout game-preview-bar mb-3">
      <span>Preview: this is what students see, and nothing is recorded.</span>
      <!-- The link takes the keyboard back to the Preview button it came from. -->
      <a
        href="#game-preview-button"
        class="btn btn-outline-secondary btn-sm"
        @click="previewing = false"
      >
        Back to editing
      </a>
    </div>
    <BossBattle
      :key="previewKey"
      :game="previewGame"
      :engine="previewEngine"
      :error-message="errorMessage"
    />
  </section>

  <div v-show="!previewing">
    <div id="game-status" class="game-status-row mb-3">
      <span class="le-chip" :class="isPublished ? 'le-badge-published' : 'le-badge-draft'">
        {{ isPublished ? 'Published' : 'Draft, hidden from students' }}
      </span>
      <span v-if="!isPublished" class="small text-body-secondary" role="status">
        {{ saveLabel }}
      </span>
      <button
        v-if="saveState === 'error'"
        type="button"
        class="btn btn-outline-secondary btn-sm"
        @click="saveNow"
      >
        Try saving again
      </button>
    </div>
    <p v-if="saveError" role="alert" class="alert alert-danger">{{ saveError }}</p>

    <!-- Once live, results matter more than the locked questions, so they come first. -->
    <template v-if="isPublished">
      <div class="le-callout mb-3">
        <p>
          Students can play this battle now, so its questions are locked. Unpublish it to make
          changes.
        </p>
        <div class="d-flex flex-wrap gap-2">
          <button
            id="game-preview-button"
            type="button"
            class="btn btn-outline-secondary"
            :disabled="!canPreview"
            @click="openPreview"
          >
            Preview the battle
          </button>
          <button
            type="button"
            class="btn btn-outline-danger"
            :disabled="actionBusy"
            @click="unpublish"
          >
            Unpublish to edit
          </button>
        </div>
      </div>
      <p v-if="actionError" role="alert" class="alert alert-danger">{{ actionError }}</p>
      <BossBattleResults :classroom-id="classroomId" :error-message="errorMessage" />
    </template>

    <fieldset :disabled="isPublished" class="game-edit-fields">
      <legend class="visually-hidden">Battle details and questions</legend>

      <section class="card mb-4" aria-labelledby="game-setup-heading">
        <div class="card-body p-4">
          <h2 id="game-setup-heading" class="h4">Set up the battle</h2>
          <div class="game-setup">
            <div class="game-setup-preview">
              <BossPortrait :boss-id="draft.bossId" decorative />
              <p class="fw-semibold text-center mt-2 mb-0">{{ findBoss(draft.bossId).name }}</p>
            </div>
            <div class="game-setup-fields">
              <!-- Bottom-aligned, so opening one field's (i) keeps both boxes level (G17). -->
              <div class="row g-3 mb-3 align-items-end">
                <div class="col-sm-8">
                  <label for="game-title" class="form-label">Battle title</label>
                  <InfoTip topic="gameTitle" />
                  <input
                    id="game-title"
                    v-model="draft.title"
                    class="form-control"
                    maxlength="120"
                    placeholder="For example, Week 3: Loops"
                    @input="edited"
                  />
                </div>
                <div class="col-sm-4">
                  <label for="game-hearts" class="form-label">Hearts</label>
                  <InfoTip topic="gameHearts" />
                  <select
                    id="game-hearts"
                    v-model.number="draft.hearts"
                    class="form-select"
                    aria-describedby="game-hearts-help"
                    @change="edited"
                  >
                    <option v-for="choice in heartChoices" :key="choice" :value="choice">
                      {{ choice }}
                    </option>
                  </select>
                </div>
              </div>
              <p id="game-hearts-help" class="form-text mt-0">
                The number of wrong answers a student can give before the boss wins.
              </p>
              <fieldset>
                <legend class="form-label fs-6">Choose a monster</legend>
                <InfoTip topic="gameMonster" />
                <div class="game-monsters">
                  <label
                    v-for="boss in bosses"
                    :key="boss.id"
                    class="game-monster"
                    :class="{ 'game-monster--chosen': draft.bossId === boss.id }"
                    :style="{ '--boss-color': boss.color }"
                  >
                    <input
                      v-model="draft.bossId"
                      class="visually-hidden"
                      type="radio"
                      name="game-boss"
                      :value="boss.id"
                      @change="edited"
                    />
                    <img :src="boss.image" alt="" />
                    <span>{{ boss.name }}</span>
                  </label>
                </div>
              </fieldset>
            </div>
          </div>
        </div>
      </section>

      <section class="mb-4" aria-labelledby="game-questions-heading">
        <div class="le-card-head justify-content-between">
          <h2 id="game-questions-heading" class="h4 mb-0">Questions</h2>
          <span class="le-chip le-num">{{ draft.questions.length }} / {{ MAX_QUESTIONS }}</span>
        </div>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button
            id="game-add-question"
            type="button"
            class="btn btn-primary"
            :disabled="spaceLeft <= 0"
            @click="addQuestion"
          >
            Add question
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary"
            :aria-expanded="panel === 'generate'"
            @click="panel = panel === 'generate' ? '' : 'generate'"
          >
            Generate with AI
          </button>
        </div>
        <p class="small" :class="addedNote ? 'mb-3' : 'mb-0'" role="status">
          <template v-if="addedNote">
            {{ addedNote.text }}
            <a :href="addedNote.href">Go to question {{ addedNote.number }}</a>
          </template>
        </p>

        <QuestionGeneratePanel
          v-if="panel === 'generate'"
          :classroom-id="classroomId"
          :space-left="spaceLeft"
          :error-message="errorMessage"
          @add="addMany"
          @close="panel = ''"
        />

        <p v-if="!draft.questions.length" class="text-body-secondary">
          No questions yet. Add one, or generate a few drafts to check and approve.
        </p>
        <GameQuestionCard
          v-for="(question, index) in draft.questions"
          :key="question.id"
          :question="question"
          :index="index"
          :total="draft.questions.length"
          @update="updateQuestion(question.id, $event)"
          @move="moveQuestion(index, $event)"
          @duplicate="duplicate(index)"
          @remove="removeQuestion(index)"
          @add-next="addQuestion"
        />
        <template v-if="draft.questions.length && !isPublished">
          <button
            type="button"
            class="btn btn-outline-primary"
            :disabled="spaceLeft <= 0"
            @click="addQuestion"
          >
            Add next question
          </button>
          <span class="small text-body-secondary ms-2">
            or press Ctrl+Enter (Cmd+Enter on a Mac)
          </span>
        </template>
      </section>
    </fieldset>

    <section v-if="!isPublished" class="card mb-4" aria-labelledby="game-ready-heading">
      <div class="card-body p-4">
        <h2 id="game-ready-heading" class="h4">Ready to publish?</h2>
        <ul v-if="checklist.length" class="game-checklist">
          <li v-for="item in checklist" :key="item.message">
            <a :href="`#${targetId(item.target)}`">{{ item.message }}</a>
          </li>
        </ul>
        <p v-else class="text-body-secondary">Everything is ready. Try it, then publish it.</p>

        <div v-if="actionError" role="alert" class="alert alert-danger">
          <p class="mb-0">{{ actionError }}</p>
          <ul v-if="publishProblems.length" class="mt-2 mb-0">
            <li v-for="problem in publishProblems" :key="problem">{{ problem }}</li>
          </ul>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <button
            id="game-preview-button"
            type="button"
            class="btn btn-outline-secondary"
            :disabled="!canPreview"
            @click="openPreview"
          >
            Preview the battle
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="actionBusy || checklist.length > 0"
            @click="publish"
          >
            Publish to class
          </button>
        </div>
      </div>
    </section>
    <p v-else class="le-callout" role="status">
      This battle is published. Its status and the class results are at the
      <a href="#game-status">top of the page</a>.
    </p>
  </div>
</template>

<style scoped>
.game-status-row,
.game-preview-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.game-preview-bar {
  justify-content: space-between;
}
.game-edit-fields {
  min-width: 0;
}
.game-setup {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}
.game-setup-preview {
  flex: 0 0 11rem;
  margin-inline: auto;
}
.game-setup-fields {
  flex: 1 1 18rem;
  min-width: 0;
}
.game-monsters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 0.5rem;
}
.game-monster {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--le-border);
  border-radius: var(--le-radius-input);
  font-size: 0.8125rem;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  transition: var(--le-transition);
}
.game-monster img {
  width: 3.5rem;
  height: 3.5rem;
}
.game-monster:hover,
.game-monster--chosen {
  border-color: var(--boss-color);
  background: color-mix(in srgb, var(--boss-color) 14%, transparent);
}
.game-monster--chosen {
  box-shadow: 0 0 0 1px var(--boss-color);
}
.game-monster:has(input:focus-visible) {
  outline: 2px solid var(--le-focus);
  outline-offset: 2px;
}
fieldset:disabled .game-monster {
  cursor: not-allowed;
  opacity: 0.7;
}
.game-checklist {
  padding-left: 1.25rem;
}
</style>
