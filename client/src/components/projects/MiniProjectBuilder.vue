<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — mini-project builder
//  Saves the brief as a draft as often as the professor likes, and publishes
//  it when it is complete. A published brief can't be edited (H-8), so the
//  page closes this form after publishing. Files for students (H-10) attach to
//  the saved draft, so they can be added once the first save has happened.
// ════════════════════════════════════════════════════════════════════
import { ref, computed } from 'vue'
import ListEditor from '@/components/shared/ListEditor.vue'
import InfoTip from '@/components/shared/InfoTip.vue'
import ErrorSummary from '@/components/shared/ErrorSummary.vue'
import { MATERIAL_MAX_FILES, formatSize, materialProblem } from '@/utils/materials.js'

// Props: data comes DOWN from the page.
const props = defineProps({
  busy: { type: Boolean, default: false }, // true while the page is sending the request
  problems: { type: Array, default: () => [] }, // { message, field } from the server
  challenges: { type: Array, default: () => [] }, // the classroom's challenges
  draft: { type: Object, default: null }, // the saved draft being edited, or null for a new one
  materialStatus: { type: String, default: '' }, // what the last upload or removal did
  materialError: { type: String, default: '' }, // why the last upload or removal failed
})

// Events: intent goes UP to the page. save and publish both carry the form's
// payload; upload carries the chosen File and remove-material the file's entry.
const emit = defineEmits(['save', 'publish', 'cancel', 'upload', 'remove-material'])

const stages = ['Diagnose', 'Repair', 'Extend', 'Verify', 'Reflect']

// Form values, filled from the saved draft when there is one.
const saved = props.draft ?? {}
const form = ref({
  title: saved.title ?? '',
  brief: saved.brief ?? '',
  stageInstructions: Object.fromEntries(
    stages.map((stage) => [stage, saved.stageInstructions?.[stage] ?? '']),
  ),
  acceptanceCriteria: [...(saved.acceptanceCriteria ?? [])],
  rubric: saved.rubric ?? '',
  maxGroupSize: saved.maxGroupSize ?? 2,
  starterRepoUrl: saved.starterRepoUrl ?? '',
  qualifyingChallengeId: saved.qualifyingChallengeId ?? '',
})

// What the browser-side checks below found (the server checks again), as
// { message, field } items for the error summary.
const validationProblems = ref([])

// The dropdown may only offer PUBLISHED challenges.
const publishedChallenges = computed(() =>
  props.challenges.filter((challenge) => challenge.status === 'published'),
)

// Everything typed so far. Blank optional fields are sent as "" so saving a
// draft can clear one saved earlier; the server stores them as "none".
function payload() {
  return {
    title: form.value.title.trim(),
    brief: form.value.brief.trim(),
    stageInstructions: Object.fromEntries(
      stages.map((stage) => [stage, form.value.stageInstructions[stage].trim()]),
    ),
    // Blank rows from the list editor are dropped.
    acceptanceCriteria: form.value.acceptanceCriteria.map((item) => item.trim()).filter(Boolean),
    rubric: form.value.rubric.trim(),
    maxGroupSize: Number(form.value.maxGroupSize),
    starterRepoUrl: form.value.starterRepoUrl.trim(),
    qualifyingChallengeId: form.value.qualifyingChallengeId,
  }
}

// What every save needs, all listed at once (UX audit item 4). These checks
// only save the professor a round trip.
function draftProblems() {
  const found = []
  if (!form.value.title.trim())
    found.push({ field: 'title', message: 'Enter a mini-project title.' })
  if (!Number.isInteger(Number(form.value.maxGroupSize)) || Number(form.value.maxGroupSize) < 1) {
    found.push({
      field: 'maxGroupSize',
      message: 'Maximum group size must be a whole number of at least 1.',
    })
  }
  return found
}

// What publishing needs on top of that; the server checks the saved draft again.
function publishProblems() {
  const found = []
  if (!form.value.brief.trim()) found.push({ field: 'brief', message: 'Enter a project brief.' })
  for (const stage of stages) {
    if (!form.value.stageInstructions[stage].trim()) {
      found.push({
        field: `stageInstructions.${stage}`,
        message: `Enter the ${stage} instructions.`,
      })
    }
  }
  if (!form.value.acceptanceCriteria.some((item) => item.trim())) {
    found.push({
      field: 'acceptanceCriteria',
      message: 'Enter at least one acceptance criterion.',
    })
  }
  if (!form.value.rubric.trim()) found.push({ field: 'rubric', message: 'Enter a rubric.' })
  return found
}

// The summary shows the browser's findings, or else the server's.
const shownProblems = computed(() =>
  validationProblems.value.length ? validationProblems.value : props.problems,
)
const fieldIds = {
  title: 'project-title',
  brief: 'project-brief',
  acceptanceCriteria: 'acceptance-criterion-0',
  rubric: 'rubric',
  maxGroupSize: 'max-group-size',
  qualifyingChallengeId: 'qualifying-challenge',
  starterRepoUrl: 'starter-url',
}
// The server names a stage's box stageInstructions.Diagnose and a criterion
// acceptanceCriteria.0, so both are read from the field.
function idFor(field = '') {
  const stage = /^stageInstructions\.(\w+)$/.exec(field)
  if (stage) return `stage-${stage[1]}`
  const criterion = /^acceptanceCriteria\.(\d+)$/.exec(field)
  if (criterion) return `acceptance-criterion-${criterion[1]}`
  return fieldIds[field]
}
// Outlines a field the summary lists; criteria share one mark for the list.
function flagged(field) {
  return shownProblems.value.some(
    (problem) => problem.field === field || problem.field?.startsWith(`${field}.`),
  )
}

// The draft's files, from the page's copy of the draft, so an upload shows at once.
const materials = computed(() => props.draft?.materials ?? [])
const fileError = ref('')

function chooseFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // so choosing the same file again still fires change
  if (!file) return
  fileError.value = materialProblem(file)
  if (!fileError.value) emit('upload', file)
}

function saveDraft() {
  validationProblems.value = draftProblems()
  if (!validationProblems.value.length) emit('save', payload())
}

function publish() {
  validationProblems.value = [...draftProblems(), ...publishProblems()]
  if (!validationProblems.value.length) emit('publish', payload())
}
</script>

<template>
  <form class="le-subpanel mb-3" novalidate @submit.prevent="saveDraft">
    <h3 class="h5 mb-2">{{ draft ? `Edit draft: ${draft.title}` : 'New mini-project' }}</h3>
    <p class="text-body-secondary small mb-3">
      Save a draft as often as you like. Students see the mini-project only once you publish it, and
      it can't be edited after that.
    </p>
    <p class="form-text mt-0 mb-3">
      Every field is needed to publish except those marked (optional). A draft needs only a title.
    </p>

    <fieldset :disabled="busy">
      <div class="mb-3">
        <label for="project-title" class="form-label">Mini-project title</label>
        <input
          id="project-title"
          v-model="form.title"
          class="form-control"
          :class="{ 'is-invalid': flagged('title') }"
          :aria-invalid="flagged('title') ? 'true' : undefined"
          required
        />
      </div>

      <div class="mb-3">
        <label for="project-brief" class="form-label">Project brief</label>
        <InfoTip topic="brief" />
        <textarea
          id="project-brief"
          v-model="form.brief"
          class="form-control"
          :class="{ 'is-invalid': flagged('brief') }"
          :aria-invalid="flagged('brief') ? 'true' : undefined"
          rows="4"
        ></textarea>
      </div>

      <div class="le-heading-tip mt-4">
        <h4 class="h6">Stage instructions</h4>
        <InfoTip topic="stageInstructions" />
      </div>

      <!-- One instruction box per stage, drawn by v-for -->
      <div class="row g-3 mb-3">
        <div v-for="stage in stages" :key="stage" class="col-md-6">
          <label :for="'stage-' + stage" class="form-label">{{ stage }}</label>
          <InfoTip :topic="'stage' + stage" />
          <textarea
            :id="'stage-' + stage"
            v-model="form.stageInstructions[stage]"
            class="form-control"
            :class="{ 'is-invalid': flagged(`stageInstructions.${stage}`) }"
            :aria-invalid="flagged(`stageInstructions.${stage}`) ? 'true' : undefined"
            rows="3"
          ></textarea>
        </div>
      </div>

      <section class="mb-3" aria-labelledby="acceptance-criteria-heading">
        <div class="le-heading-tip mt-4">
          <h4 id="acceptance-criteria-heading" class="h6">Acceptance criteria</h4>
          <InfoTip topic="acceptanceCriteria" />
        </div>
        <p id="acceptance-criteria-hint" class="form-text mt-0">
          One checkable statement per box. For example: "Adding an item updates the cart total."
        </p>
        <ListEditor
          v-model="form.acceptanceCriteria"
          id-base="acceptance-criterion"
          item-name="Criterion"
          add-label="Add criterion"
          describedby="acceptance-criteria-hint"
        />
      </section>

      <div class="mb-3">
        <label for="rubric" class="form-label">Rubric</label>
        <InfoTip topic="rubric" />
        <textarea
          id="rubric"
          v-model="form.rubric"
          class="form-control"
          :class="{ 'is-invalid': flagged('rubric') }"
          :aria-invalid="flagged('rubric') ? 'true' : undefined"
          rows="3"
        ></textarea>
      </div>

      <div class="mb-3" style="max-width: 12rem">
        <label for="max-group-size" class="form-label">Maximum group size</label>
        <InfoTip topic="maxGroupSize" />
        <!-- .number turns the typed text into a real number -->
        <input
          id="max-group-size"
          v-model.number="form.maxGroupSize"
          type="number"
          min="1"
          step="1"
          class="form-control"
          :class="{ 'is-invalid': flagged('maxGroupSize') }"
          :aria-invalid="flagged('maxGroupSize') ? 'true' : undefined"
          required
        />
      </div>

      <div class="mb-3">
        <label for="qualifying-challenge" class="form-label">
          Qualifying challenge for help requests (optional)
        </label>
        <InfoTip topic="qualifyingChallenge" />
        <select
          id="qualifying-challenge"
          v-model="form.qualifyingChallengeId"
          class="form-select"
          :class="{ 'is-invalid': flagged('qualifyingChallengeId') }"
          :aria-invalid="flagged('qualifyingChallengeId') ? 'true' : undefined"
        >
          <option value="">No qualifying challenge</option>
          <option
            v-for="challenge in publishedChallenges"
            :key="challenge.id"
            :value="challenge.id"
          >
            {{ challenge.title }}
          </option>
        </select>
      </div>

      <div class="mb-3">
        <label for="starter-url" class="form-label">
          Starter GitHub repository URL (optional)
        </label>
        <InfoTip topic="starterRepo" />
        <input
          id="starter-url"
          v-model="form.starterRepoUrl"
          type="url"
          class="form-control"
          :class="{ 'is-invalid': flagged('starterRepoUrl') }"
          :aria-invalid="flagged('starterRepoUrl') ? 'true' : undefined"
          placeholder="https://github.com/owner/repo"
        />
      </div>

      <section class="mb-3" aria-labelledby="materials-heading">
        <h4 id="materials-heading" class="h6 mt-4">Materials for students (optional)</h4>
        <p class="text-body-secondary small mb-2">
          Detailed instructions, starter code or sample data, as PDF or zip files. Up to 4 MB each
          and {{ MATERIAL_MAX_FILES }} in all.
        </p>
        <p v-if="!draft?.id" class="small mb-0">Save the draft first, then add files here.</p>
        <template v-else>
          <ul v-if="materials.length" class="list-group mb-2">
            <li
              v-for="material in materials"
              :key="material.id"
              class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2"
            >
              <span class="text-break">
                {{ material.name }}
                <span class="text-body-secondary small le-num ms-1">{{
                  formatSize(material.size)
                }}</span>
              </span>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                :aria-label="`Remove ${material.name}`"
                @click="emit('remove-material', material)"
              >
                Remove
              </button>
            </li>
          </ul>
          <p v-if="materials.length >= MATERIAL_MAX_FILES" class="small mb-0">
            This draft has {{ MATERIAL_MAX_FILES }} files. Remove one to add another.
          </p>
          <template v-else>
            <label for="material-file" class="form-label">Add a file</label>
            <input
              id="material-file"
              type="file"
              class="form-control"
              accept=".pdf,.zip,application/pdf,application/zip"
              :aria-describedby="fileError || materialError ? 'material-file-error' : undefined"
              @change="chooseFile"
            />
          </template>
          <p
            v-if="fileError || materialError"
            id="material-file-error"
            class="text-danger small mt-1 mb-0"
            role="alert"
          >
            {{ fileError || materialError }}
          </p>
          <p v-else-if="materialStatus" class="text-success small mt-1 mb-0" role="status">
            {{ materialStatus }}
          </p>
        </template>
      </section>

      <!-- Every problem at once, just above the buttons, each linking to its field. -->
      <ErrorSummary
        class="mt-4 mb-0"
        heading="Fix these first"
        list-label="Problems to fix"
        :problems="shownProblems"
        :id-for="idFor"
      />
      <div class="d-flex flex-wrap gap-2 mt-4">
        <button type="submit" class="btn btn-outline-primary" :disabled="busy">
          {{ busy ? 'Saving...' : 'Save draft' }}
        </button>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="publish">
          Publish mini-project
        </button>
        <button type="button" class="btn btn-outline-secondary" @click="emit('cancel')">
          {{ draft ? 'Close' : 'Cancel' }}
        </button>
      </div>
    </fieldset>
  </form>
</template>
