<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — mini-project page
//  The brief, then groups to create or join. A member gets the group's tasks,
//  stage evidence, GitHub repository and submission. The owning professor sees
//  every group's work read-only (E-6), and can refresh each group's GitHub data.
//  Files the professor attached (H-10) are listed with the brief to download.
// ════════════════════════════════════════════════════════════════════
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrentUser } from '@/composables/useCurrentUser'
import {
  getMiniProject,
  createGroup,
  joinGroup,
  leaveGroup,
  replaceTasks,
  updateStageEvidence,
  attachRepository,
  submitGroup,
  downloadMaterial,
} from '@/services/groupsApi.js'
import { formatSize, saveFile } from '@/utils/materials.js'
import AppLoading from '@/components/shared/AppLoading.vue'
import AppAlert from '@/components/shared/AppAlert.vue'
import InfoTip from '@/components/shared/InfoTip.vue'
import ErrorSummary from '@/components/shared/ErrorSummary.vue'
import ReadyChecklist from '@/components/shared/ReadyChecklist.vue'
import GroupBrowser from '@/components/projects/GroupBrowser.vue'
import GroupTaskList from '@/components/projects/GroupTaskList.vue'
import ProjectStagePanel from '@/components/projects/ProjectStagePanel.vue'
import { taskStatusLabels } from '@/config/taskStatuses.js'
import GitHubRepositoryPanel from '@/components/github/GitHubRepositoryPanel.vue'
import { refreshGroupGitHub } from '@/services/githubApi.js'
import { usePageClassroom } from '@/composables/usePageClassroom.js'
import { apiErrorDetails } from '@/utils/apiError.js'

const route = useRoute()
const { pageClassroomId } = usePageClassroom()

// The five stages in order. One list lets v-for draw all of them.
const stages = ['Diagnose', 'Repair', 'Extend', 'Verify', 'Reflect']
// Submitting needs saved evidence for these three; Extend and Reflect are optional.
const neededStages = ['Diagnose', 'Repair', 'Verify']
const { currentUserId } = useCurrentUser()

// ── Loading the brief ────────────────────────────────────────────────
const miniProject = ref(null) // server response: brief, groups, myGroup, workspaces
const busy = ref(false) // true while waiting for the server
const error = ref('') // message shown if loading fails

const miniProjectId = computed(() => route.params.miniProjectId)
// The server says whether the caller owns the classroom (professor view).
const isProfessorView = computed(() => miniProject.value?.isOwningProfessor === true)
const hasNoGroups = computed(() => miniProject.value && miniProject.value.groups.length === 0)

// Turns a server error into one readable message. Validation errors carry a
// list of problems in `details`; other errors carry a single `message`.
// ── Materials (H-10) ─────────────────────────────────────────────────
// A plain link can't send the session header, so the file is fetched and then
// handed to the browser to save.
const downloadingId = ref('') // the file being fetched, so only its button waits
const downloadError = ref('')

async function handleDownload(material) {
  if (downloadingId.value) return
  downloadingId.value = material.id
  downloadError.value = ''
  try {
    const blob = await downloadMaterial(miniProjectId.value, material.id)
    saveFile(blob, material.name)
  } catch (err) {
    downloadError.value = err.response
      ? apiErrorDetails(err, `Couldn't download ${material.name}.`)
      : 'Could not reach the server.'
  } finally {
    downloadingId.value = ''
  }
}

// Counter that lets a slow, out-of-date response be ignored.
let loadRequest = 0

async function loadMiniProject() {
  const request = ++loadRequest
  const requestedId = miniProjectId.value
  const requestedUserId = currentUserId.value
  // "Current" = nothing changed while we waited (same call, same page, same user).
  const isCurrent = () =>
    request === loadRequest &&
    miniProjectId.value === requestedId &&
    currentUserId.value === requestedUserId
  busy.value = true
  error.value = ''
  // Tells the sidebar this page's classroom; cleared first, so a failed load
  // shows no classroom links.
  pageClassroomId.value = ''
  try {
    const response = await getMiniProject(requestedId)
    if (!isCurrent()) return
    miniProject.value = response.data
    pageClassroomId.value = response.data.classroomId ?? ''
    syncStageDrafts() // fill the stage boxes (only the ones not being edited)
    syncReflectionDrafts()
  } catch (err) {
    if (!isCurrent()) return
    miniProject.value = null
    error.value = apiErrorDetails(err, "We couldn't load this mini-project.")
  } finally {
    if (isCurrent()) busy.value = false
  }
}

// ── Groups ───────────────────────────────────────────────────────────
const newGroupName = ref('') // v-model binds the name input to this
const groupBusy = ref(false) // true while a create/join request runs
const groupError = ref('') // separate from `error`, so the page stays visible
const groupMessage = ref('') // says what leaving did

// Runs when GroupBrowser emits "create"
async function handleCreateGroup() {
  if (groupBusy.value) return
  // The browser check only helps the user; the server validates again.
  if (!newGroupName.value) {
    groupError.value = 'Enter a group name first.'
    return
  }
  groupBusy.value = true
  groupError.value = ''
  groupMessage.value = ''
  try {
    await createGroup(miniProjectId.value, { name: newGroupName.value })
    newGroupName.value = '' // clear the box only after success
    await loadMiniProject()
  } catch (err) {
    // The typed name is kept on failure.
    groupError.value = apiErrorDetails(err, "Couldn't create the group.")
    await loadMiniProject() // refresh from the server after a conflict
  } finally {
    groupBusy.value = false
  }
}

// Runs when GroupBrowser emits "join" (it sends the group id)
async function handleJoinGroup(groupId) {
  if (groupBusy.value) return
  groupBusy.value = true
  groupError.value = ''
  groupMessage.value = ''
  try {
    await joinGroup(groupId)
    await loadMiniProject()
  } catch (err) {
    // e.g. the group is full, or the student is already in a group
    groupError.value = apiErrorDetails(err, "Couldn't join the group.")
    await loadMiniProject() // the place count may have changed
  } finally {
    groupBusy.value = false
  }
}

// Leave group (UX audit A4): only while the work is still the group's to change.
// The last member out deletes the group, so the confirm says so.
const canLeaveGroup = computed(() =>
  ['draft', 'returned'].includes(miniProject.value?.myGroup?.submissionStatus),
)
async function handleLeaveGroup() {
  const group = miniProject.value.myGroup
  if (groupBusy.value) return
  const consequence =
    group.members.length === 1
      ? "You're its only member, so the group and its work will be deleted. This can't be undone."
      : 'Your tasks stay with the group without an owner.'
  if (!window.confirm(`Leave "${group.name}"? ${consequence}`)) return
  groupBusy.value = true
  groupError.value = ''
  groupMessage.value = ''
  try {
    await leaveGroup(group.id)
    taskEditor.value = null
    groupMessage.value = `You left "${group.name}".`
    await loadMiniProject()
  } catch (err) {
    groupError.value = apiErrorDetails(err, "Couldn't leave the group.")
    await loadMiniProject() // e.g. it was submitted in the meantime
  } finally {
    groupBusy.value = false
  }
}

// ── Tasks ────────────────────────────────────────────────────────────
const taskStatuses = ['todo', 'in-progress', 'done']
const taskEditor = ref(null) // the task being created/edited; null = closed
const taskBusy = ref(false)
const taskError = ref('')
const taskMessage = ref('') // what the last removal did

// GroupTaskList emits "create-task": open an empty editor.
function openCreateTask() {
  taskError.value = ''
  taskMessage.value = ''
  taskEditor.value = { id: null, title: '', ownerId: '', status: 'todo', evidenceUrl: '' }
}

// GroupTaskList emits "update-task" with ONE task: open the editor with a copy.
function openEditTask(task) {
  taskError.value = ''
  taskMessage.value = ''
  taskEditor.value = {
    id: task.id,
    title: task.title,
    ownerId: task.ownerId || '',
    status: task.status,
    evidenceUrl: task.evidenceUrl || '',
  }
}

function cancelTaskEdit() {
  taskEditor.value = null
  taskError.value = ''
}

async function saveTask() {
  if (taskBusy.value || !taskEditor.value) return
  const group = miniProject.value.myGroup
  const draft = taskEditor.value

  if (!draft.title) {
    taskError.value = 'Enter a task title first.'
    return
  }

  // 1. Start from every saved task.
  const tasks = savedTasks(group)

  // 2. Merge the one change into the full list.
  const edited = {
    title: draft.title,
    ownerId: draft.ownerId,
    status: draft.status,
    evidenceUrl: draft.evidenceUrl,
  }
  if (draft.id) {
    // Existing task: replace it by id, keeping the same id.
    const index = tasks.findIndex((task) => task.id === draft.id)
    if (index !== -1) tasks[index] = { id: draft.id, ...edited }
  } else {
    // New task: no id key, so the server creates one.
    tasks.push(edited)
  }

  // 3. Send it. The editor closes only after success, so a failure keeps the typing.
  if (await sendTasks(group, tasks, "Couldn't save the task.")) taskEditor.value = null
}

// GroupTaskList emits "remove-task" with ONE task (UX audit A5). It asks
// first, then sends every other saved task.
async function removeTask(task) {
  if (taskBusy.value) return
  if (!window.confirm(`Remove the task "${task.title}"? This can't be undone.`)) return
  const group = miniProject.value.myGroup
  const tasks = savedTasks(group).filter((item) => item.id !== task.id)
  if (await sendTasks(group, tasks, "Couldn't remove the task.")) {
    if (taskEditor.value?.id === task.id) taskEditor.value = null
    taskMessage.value = `Removed the task "${task.title}".`
  }
}

// Every saved task in the shape replaceTasks sends. replaceTasks replaces the
// whole list, so sending only one task would delete the rest.
function savedTasks(group) {
  return group.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    ownerId: task.ownerId || '',
    status: task.status,
    evidenceUrl: task.evidenceUrl || '',
  }))
}

// Sends the complete list plus the updatedAt we loaded (stale-edit check),
// then reloads. Answers true when the save went through.
async function sendTasks(group, tasks, fallback) {
  taskBusy.value = true
  taskError.value = ''
  taskMessage.value = ''
  try {
    await replaceTasks(group.id, tasks, group.updatedAt)
    await loadMiniProject()
    return true
  } catch (err) {
    taskError.value = apiErrorDetails(err, fallback)
    // 409 = a teammate saved first. Reload so the next try uses fresh data.
    if (err.response?.status === 409) await loadMiniProject()
    return false
  } finally {
    taskBusy.value = false
  }
}

// ── Stage evidence ───────────────────────────────────────────────────
// What the member has typed, kept apart from the saved data so a failed save
// or a reload never throws the typed text away.
const stageDrafts = ref({ Diagnose: '', Repair: '', Extend: '', Verify: '', Reflect: '' })
// Which stages have unsaved typing.
const stageTouched = ref({
  Diagnose: false,
  Repair: false,
  Extend: false,
  Verify: false,
  Reflect: false,
})
const stageBusy = ref(false) // true while the stages are being saved
const stageError = ref('')
const stageSaved = ref(false) // true after a save, for the "Saved." message
// The stages with unsaved typing, which are the ones the Save button sends.
const stagesToSave = computed(() => stages.filter((stage) => stageTouched.value[stage]))

// Copy the server's saved text into the boxes, but only for stages the member
// has not edited.
function syncStageDrafts() {
  const saved = miniProject.value?.myGroup?.stageEvidence
  if (!saved) return
  for (const stage of stages) {
    if (!stageTouched.value[stage]) stageDrafts.value[stage] = saved[stage] ?? ''
  }
}

// ProjectStagePanel emits "update:evidence" with the new text.
function editStage(stage, text) {
  stageDrafts.value[stage] = text
  stageTouched.value[stage] = true
  stageSaved.value = false
}

// Save every stage with unsaved typing in one request. The server
// merges what is sent, so the stages left out are never touched.
async function saveStages() {
  if (stageBusy.value) return
  const changed = {}
  for (const stage of stagesToSave.value) {
    changed[stage] = stageDrafts.value[stage]
  }
  stageBusy.value = true
  stageError.value = ''
  stageSaved.value = false
  try {
    await updateStageEvidence(miniProject.value.myGroup.id, changed)
    for (const stage of Object.keys(changed)) {
      stageTouched.value[stage] = false
    }
    stageSaved.value = true
    await loadMiniProject()
  } catch (err) {
    // The typed text stays in the boxes and stays marked as unsaved.
    stageError.value = apiErrorDetails(err, "Couldn't save the stage evidence.")
  } finally {
    stageBusy.value = false
  }
}

// ── Reload when the mini-project or the logged-in user changes ───────
// Clear everything typed or loaded, so one user's data never shows for another.
function resetProjectState() {
  miniProject.value = null
  taskEditor.value = null
  taskError.value = ''
  taskBusy.value = false
  groupError.value = ''
  groupBusy.value = false
  newGroupName.value = ''
  stageDrafts.value = { Diagnose: '', Repair: '', Extend: '', Verify: '', Reflect: '' }
  stageTouched.value = {
    Diagnose: false,
    Repair: false,
    Extend: false,
    Verify: false,
    Reflect: false,
  }
  stageError.value = ''
  stageSaved.value = false
  stageBusy.value = false
  repoUrlDraft.value = ''
  repoBusy.value = false
  repoError.value = ''
  refreshingGroupId.value = ''
  refreshErrors.value = {}
  reflectionDraft.value = ''
  reflectionTouched.value = false
  submitBusy.value = false
  submitError.value = ''
}

watch([miniProjectId, currentUserId], () => {
  loadRequest++
  resetProjectState()
  loadMiniProject()
})

onMounted(() => {
  loadMiniProject()
})

onUnmounted(() => {
  loadRequest++
})

// ── GitHub repository ────────────────────────────────────────────────
const repoUrlDraft = ref('')
const repoBusy = ref(false)
const repoError = ref('')
const refreshingGroupId = ref('')
const refreshErrors = ref({})

async function handleAttachRepository() {
  if (repoBusy.value) {
    return
  }
  repoBusy.value = true
  repoError.value = ''
  try {
    await attachRepository(miniProject.value.myGroup.id, repoUrlDraft.value)
    await loadMiniProject()
  } catch (err) {
    repoError.value = apiErrorDetails(err, "Couldn't attach the repository.")
  } finally {
    repoBusy.value = false
  }
}

async function handleRefresh(groupId) {
  if (refreshingGroupId.value) {
    return
  }
  refreshingGroupId.value = groupId
  delete refreshErrors.value[groupId]
  try {
    await refreshGroupGitHub(groupId)
    await loadMiniProject()
  } catch (err) {
    refreshErrors.value[groupId] = apiErrorDetails(err, "Couldn't refresh GitHub data.")
  } finally {
    refreshingGroupId.value = ''
  }
}

// ── Submission ───────────────────────────────────────────────────────
const reflectionDraft = ref('')
const reflectionTouched = ref(false)
const submitBusy = ref(false)
const submitError = ref('')
const submitProblems = ref([]) // { message, field } when the server refused a submit

// UX audit item 2: what submitting needs, ticked as the group works. Evidence
// counts once it's saved, because the server checks the saved copy.
const submitChecklist = computed(() => {
  const saved = miniProject.value?.myGroup?.stageEvidence ?? {}
  return [
    ...neededStages.map((stage) => ({
      field: `stageEvidence.${stage}`,
      label: `${stage} evidence, saved`,
      done: Boolean(saved[stage]?.trim()),
    })),
    { field: 'reflection', label: 'A reflection', done: reflectionDraft.value.trim() !== '' },
  ]
})
const submitFieldId = (field) =>
  field === 'reflection'
    ? 'reflection-input'
    : field?.startsWith('stageEvidence.')
      ? `stage-evidence-${field.slice('stageEvidence.'.length)}`
      : ''
const submitFlagged = (field) => submitProblems.value.some((problem) => problem.field === field)

const submissionMessages = {
  draft: 'Not submitted yet.',
  // The badge beside it already names the status, so the sentence doesn't repeat it.
  submitted: "Waiting for your professor's review.",
  returned: 'Read the feedback, update your evidence and submit again.',
  approved: 'Your professor approved this work.',
}

function syncReflectionDrafts() {
  const saved = miniProject.value?.myGroup?.reflection
  if (!saved) {
    return
  } else if (!reflectionTouched.value) {
    reflectionDraft.value = saved
  }
}
async function handleSubmit() {
  if (submitBusy.value) {
    return
  }
  submitBusy.value = true
  submitError.value = ''
  submitProblems.value = []
  try {
    await submitGroup(miniProject.value.myGroup.id, { reflection: reflectionDraft.value })
    reflectionTouched.value = false
    // The work is read-only now, so earlier save notes and errors no longer apply.
    stageSaved.value = false
    stageError.value = ''
    repoError.value = ''
    taskMessage.value = ''
    taskError.value = ''

    await loadMiniProject()
  } catch (err) {
    // A refusal that names fields becomes a linked summary (UX audit item 4).
    const details = err.response?.data?.error?.details
    if (Array.isArray(details) && details.length) {
      submitProblems.value = details.map(({ message, field }) => ({ message, field }))
    } else {
      submitError.value = apiErrorDetails(err, "Couldn't submit your work.")
    }
  } finally {
    submitBusy.value = false
  }
}
</script>

<template>
  <!-- Permanent page heading (the shell test looks for it, even when loading fails) -->
  <header class="mb-4">
    <RouterLink
      v-if="miniProject?.classroomId"
      class="le-back-link"
      :to="{ name: 'classroom', params: { classroomId: miniProject.classroomId } }"
    >
      <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
      Back to classroom
    </RouterLink>
    <h1 class="le-page-title le-title-dot mb-0">{{ miniProject?.title ?? 'Mini-project' }}</h1>
  </header>

  <!-- Loading and error states -->
  <AppLoading v-if="busy" label="Loading mini-project" />
  <template v-if="error">
    <AppAlert variant="danger" :message="error" @dismiss="error = ''" />
    <button type="button" class="btn btn-outline-primary" @click="loadMiniProject">
      Try again
    </button>
  </template>

  <!-- EVERYTHING that reads miniProject lives inside this one div -->
  <div v-if="miniProject">
    <!-- The brief -->
    <section class="card mb-4" aria-labelledby="brief-heading">
      <div class="card-body p-4">
        <div class="le-card-head justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <span class="le-section-icon" aria-hidden="true">
              <svg class="le-icon" viewBox="0 0 16 16">
                <path
                  d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.1v.7h4v-.7c0-.4.2-.8.6-1.1A4.5 4.5 0 0 0 8 1.5z"
                />
              </svg>
            </span>
            <h2 id="brief-heading" class="h4 mb-0">Brief</h2>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="loadMiniProject">
            Refresh
          </button>
        </div>
        <!-- Only the owning professor can open a draft; students get a 404 (H-8). -->
        <p v-if="miniProject.status === 'draft'" class="alert alert-secondary">
          This is a draft, so students can't see it yet. Edit or publish it from the classroom page.
        </p>
        <p class="le-request-text">{{ miniProject.brief }}</p>
        <p v-if="miniProject.starterRepoUrl">
          Starter repository:
          <a :href="miniProject.starterRepoUrl" target="_blank" rel="noopener">{{
            miniProject.starterRepoUrl
          }}</a>
        </p>
        <template v-if="miniProject.materials?.length">
          <h3 id="materials-heading" class="h6 mt-3">Materials</h3>
          <ul class="list-group mb-3" aria-labelledby="materials-heading">
            <li
              v-for="material in miniProject.materials"
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
                class="btn btn-outline-primary btn-sm"
                :aria-label="`Download ${material.name}`"
                :disabled="downloadingId !== ''"
                @click="handleDownload(material)"
              >
                {{ downloadingId === material.id ? 'Downloading...' : 'Download' }}
              </button>
            </li>
          </ul>
          <p v-if="downloadError" class="text-danger small" role="alert">{{ downloadError }}</p>
        </template>
        <p class="le-chip le-num mb-0">Maximum group size: {{ miniProject.maxGroupSize }}</p>
      </div>
    </section>

    <div class="row g-4 mb-4">
      <!-- A group member reads each instruction under its evidence box instead
           (UX audit item 8), so the list is for everyone without those boxes. -->
      <div v-if="!miniProject.myGroup" class="col-lg-7">
        <section class="card h-100" aria-labelledby="stage-instructions-heading">
          <div class="card-body p-4">
            <h2 id="stage-instructions-heading" class="h5">Stage instructions</h2>
            <dl class="le-details mb-0">
              <template v-for="stage in stages" :key="stage">
                <dt>{{ stage }}</dt>
                <dd>{{ miniProject.stageInstructions?.[stage] }}</dd>
              </template>
            </dl>
          </div>
        </section>
      </div>
      <div :class="miniProject.myGroup ? 'col-12' : 'col-lg-5'">
        <section class="card h-100" aria-labelledby="criteria-heading">
          <div class="card-body p-4">
            <h2 id="criteria-heading" class="h5">Acceptance criteria</h2>
            <ul class="mb-0 ps-3">
              <li
                v-for="(criterion, index) in miniProject.acceptanceCriteria"
                :key="index"
                class="le-request-text mb-1"
              >
                {{ criterion }}
              </li>
            </ul>
            <!-- Students see how the work is marked before they start (H-9). -->
            <template v-if="miniProject.rubric">
              <h2 id="rubric-heading" class="h5 mt-4">Rubric</h2>
              <p class="le-request-text mb-0">{{ miniProject.rubric }}</p>
            </template>
          </div>
        </section>
      </div>
    </div>

    <!-- Groups: students only. The professor sees every group below. -->
    <section v-if="!isProfessorView" class="card mb-4" aria-labelledby="groups-heading">
      <div class="card-body p-4">
        <div class="le-card-head">
          <span class="le-section-icon" aria-hidden="true">
            <svg class="le-icon" viewBox="0 0 16 16">
              <circle cx="6" cy="5.5" r="2.5" />
              <path
                d="M1.5 13.5a4.5 4.5 0 0 1 9 0M11 3.2a2.5 2.5 0 0 1 0 4.6M12.5 9.6a4.5 4.5 0 0 1 2 3.9"
              />
            </svg>
          </span>
          <h2 id="groups-heading" class="h4 mb-0">Groups</h2>
        </div>
        <p v-if="hasNoGroups" class="text-body-secondary">No groups yet</p>
        <AppAlert
          v-if="groupError"
          variant="danger"
          :message="groupError"
          @dismiss="groupError = ''"
        />

        <p v-if="groupMessage" class="text-success" role="status">{{ groupMessage }}</p>

        <div v-if="miniProject.myGroup" class="d-flex flex-wrap align-items-center gap-2">
          <p class="le-chip le-chip-section mb-0">Your group: {{ miniProject.myGroup.name }}</p>
          <button
            v-if="canLeaveGroup"
            type="button"
            class="btn btn-outline-danger btn-sm"
            :disabled="groupBusy"
            @click="handleLeaveGroup"
          >
            Leave group
          </button>
        </div>

        <!-- Only students without a group can create or join -->
        <template v-else>
          <div class="mb-3" style="max-width: 24rem">
            <label for="new-group-name" class="form-label">New group name</label>
            <input
              id="new-group-name"
              v-model.trim="newGroupName"
              class="form-control"
              type="text"
              placeholder="e.g. Team Alpha"
            />
            <button type="button" class="btn btn-primary mt-2" @click="handleCreateGroup">
              Create group
            </button>
          </div>
          <GroupBrowser
            :groups="miniProject.groups"
            :max-group-size="miniProject.maxGroupSize"
            :current-user-id="currentUserId"
            @join="handleJoinGroup"
          />
        </template>
      </div>
    </section>

    <!-- Professor view (E-6): every group's work, read-only -->
    <section v-if="isProfessorView" class="card mb-4" aria-labelledby="group-progress-heading">
      <div class="card-body p-4">
        <div class="le-card-head">
          <span class="le-section-icon" aria-hidden="true">
            <svg class="le-icon" viewBox="0 0 16 16">
              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
          </span>
          <h2 id="group-progress-heading" class="h4 mb-0">Group progress</h2>
        </div>
        <p>
          <RouterLink
            :to="{ name: 'professor-review', params: { classroomId: miniProject.classroomId } }"
          >
            Review and approve submitted groups
          </RouterLink>
        </p>
        <p v-if="!miniProject.workspaces.length" class="text-body-secondary mb-0">No groups yet.</p>
        <div v-for="workspace in miniProject.workspaces" :key="workspace.id" class="le-block mb-3">
          <h3 class="h5 mt-2">{{ workspace.name }}</h3>
          <p>
            <span class="text-body-secondary">Members:</span>
            <template v-for="(member, index) in workspace.members" :key="member.id"
              >{{ index ? ', ' : ' '
              }}<RouterLink :to="{ name: 'profile', params: { userId: member.id } }">{{
                member.displayName
              }}</RouterLink></template
            >
            <template v-if="!workspace.members.length"> None</template>
          </p>
          <p>
            <span
              class="badge le-status text-capitalize"
              :class="{ 'is-active': workspace.submissionStatus !== 'draft' }"
              >{{ workspace.submissionStatus }}</span
            >
          </p>
          <p v-if="workspace.reflection" class="le-request-text">
            <span class="text-body-secondary">Reflection:</span> {{ workspace.reflection }}
          </p>
          <div class="row g-4">
            <div class="col-md-5">
              <h4 class="h6">Tasks</h4>
              <ul v-if="workspace.tasks.length" class="le-list">
                <li v-for="task in workspace.tasks" :key="task.id">
                  <span class="le-request-text">{{ task.title }}</span>
                  <span class="badge le-status" :class="{ 'is-active': task.status !== 'todo' }">
                    {{ taskStatusLabels[task.status] || task.status }}
                  </span>
                </li>
              </ul>
              <p v-else class="text-body-secondary mb-0">No tasks yet.</p>
            </div>
            <div class="col-md-7">
              <h4 class="h6">Stage evidence</h4>
              <dl class="le-details mb-0">
                <template v-for="stage in stages" :key="stage">
                  <dt>{{ stage }}</dt>
                  <dd>{{ workspace.stageEvidence[stage] || 'No evidence yet.' }}</dd>
                </template>
              </dl>
            </div>
          </div>
          <GitHubRepositoryPanel
            v-if="workspace.repositoryUrl"
            :repository="workspace.github?.repository ?? {}"
            :commits="workspace.github?.commits ?? []"
            :contributors="workspace.github?.contributors"
            :last-refreshed-at="workspace.lastRefreshedAt"
            :loading="refreshingGroupId === workspace.id"
            :error="refreshErrors[workspace.id]"
            @refresh="handleRefresh(workspace.id)"
            class="mt-4"
          />
          <p v-else class="text-body-secondary">No repository attached yet.</p>
        </div>
      </div>
    </section>

    <!-- Tasks (members only) -->
    <section v-if="miniProject.myGroup" class="card mb-4">
      <div class="card-body p-4">
        <AppAlert
          v-if="taskError"
          variant="danger"
          :message="taskError"
          @dismiss="taskError = ''"
        />
        <p v-if="taskMessage" class="text-success" role="status">{{ taskMessage }}</p>

        <GroupTaskList
          :tasks="miniProject.myGroup.tasks"
          :members="miniProject.myGroup.members"
          :readonly="taskBusy"
          @create-task="openCreateTask"
          @update-task="openEditTask"
          @remove-task="removeTask"
        />

        <!-- Task editor: v-model binds each box to taskEditor -->
        <div v-if="taskEditor" class="le-subpanel mt-3">
          <h3 class="h6">{{ taskEditor.id ? 'Edit task' : 'New task' }}</h3>
          <div class="row g-3">
            <div class="col-md-6">
              <label for="task-title" class="form-label">Title</label>
              <input
                id="task-title"
                v-model.trim="taskEditor.title"
                class="form-control"
                type="text"
              />
            </div>
            <div class="col-md-6">
              <label for="task-owner" class="form-label">Owner</label>
              <select id="task-owner" v-model="taskEditor.ownerId" class="form-select">
                <option value="">Unassigned</option>
                <option
                  v-for="member in miniProject.myGroup.members"
                  :key="member.id"
                  :value="member.id"
                >
                  {{ member.displayName }}
                </option>
              </select>
            </div>
            <div class="col-md-6">
              <label for="task-status" class="form-label">Status</label>
              <select id="task-status" v-model="taskEditor.status" class="form-select">
                <option v-for="status in taskStatuses" :key="status" :value="status">
                  {{ taskStatusLabels[status] || status }}
                </option>
              </select>
            </div>
            <div class="col-md-6">
              <label for="task-evidence" class="form-label">Evidence link (optional)</label>
              <input
                id="task-evidence"
                v-model.trim="taskEditor.evidenceUrl"
                class="form-control"
                type="text"
                placeholder="https://..."
              />
            </div>
          </div>

          <div class="d-flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-primary" :disabled="taskBusy" @click="saveTask">
              Save task
            </button>
            <button
              type="button"
              class="btn btn-outline-secondary"
              :disabled="taskBusy"
              @click="cancelTaskEdit"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Stage evidence (members only) -->
    <section v-if="miniProject.myGroup" class="card mb-4" aria-labelledby="stage-evidence-heading">
      <div class="card-body p-4">
        <div class="le-card-head">
          <span class="le-section-icon" aria-hidden="true">
            <svg class="le-icon" viewBox="0 0 16 16">
              <path d="M3 14.5v-12M3 2.5h8.5l-1.8 2.75L11.5 8H3" />
            </svg>
          </span>
          <h2 id="stage-evidence-heading" class="h4 mb-0">Stage evidence</h2>
          <InfoTip topic="stageEvidence" />
        </div>
        <AppAlert
          v-if="stageError"
          variant="danger"
          :message="stageError"
          @dismiss="stageError = ''"
        />

        <!-- One panel per stage. v-for is on a plain div, with no v-if on the same node. -->
        <div v-for="stage in stages" :key="stage" class="le-block mb-3">
          <ProjectStagePanel
            :stage="stage"
            :instruction="miniProject.stageInstructions?.[stage] ?? ''"
            :evidence="stageDrafts[stage]"
            :readonly="stageBusy"
            :optional="!neededStages.includes(stage)"
            :invalid="submitFlagged(`stageEvidence.${stage}`)"
            @update:evidence="(text) => editStage(stage, text)"
          />
          <p
            v-if="stageDrafts[stage] !== (miniProject.myGroup.stageEvidence[stage] ?? '')"
            class="text-body-secondary mt-2 mb-0"
          >
            Unsaved changes
          </p>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="stageBusy || stagesToSave.length === 0"
            @click="saveStages"
          >
            Save stage evidence
          </button>
          <span v-if="stageSaved" class="text-success" role="status">Saved.</span>
        </div>
      </div>
    </section>
    <section v-if="miniProject.myGroup" class="card mb-4" aria-labelledby="repository-heading">
      <div class="card-body p-4">
        <div class="le-card-head">
          <span class="le-section-icon" aria-hidden="true">
            <svg class="le-icon" viewBox="0 0 16 16">
              <circle cx="4" cy="3" r="1.5" />
              <circle cx="4" cy="13" r="1.5" />
              <circle cx="12" cy="5" r="1.5" />
              <path d="M4 4.5v7M12 6.5c0 3-8 2-8 5" />
            </svg>
          </span>
          <h2 id="repository-heading" class="h4 mb-0">Repository</h2>
        </div>
        <AppAlert
          v-if="repoError"
          variant="danger"
          :message="repoError"
          @dismiss="repoError = ''"
        />
        <label for="repo-url" class="form-label">GitHub repository link</label>
        <InfoTip topic="repoLink" />
        <div class="d-flex gap-2">
          <input
            id="repo-url"
            v-model="repoUrlDraft"
            type="url"
            class="form-control"
            placeholder="https://github.com/owner/repo"
            aria-describedby="repo-url-hint"
          />
          <button
            class="btn btn-primary"
            :disabled="repoBusy || !repoUrlDraft.trim()"
            @click="handleAttachRepository"
            type="button"
          >
            Attach
          </button>
        </div>
        <p id="repo-url-hint" class="form-text">
          Your group's public GitHub repository. Changing the link clears the saved GitHub data.
        </p>
        <p v-if="miniProject.myGroup.repositoryUrl" class="le-request-text">
          Attached:
          <a :href="miniProject.myGroup.repositoryUrl" target="_blank" rel="noopener">{{
            miniProject.myGroup.repositoryUrl
          }}</a>
        </p>
        <GitHubRepositoryPanel
          v-if="miniProject.myGroup.repositoryUrl"
          :repository="miniProject.myGroup.github?.repository ?? {}"
          :commits="miniProject.myGroup.github?.commits ?? []"
          :contributors="miniProject.myGroup.github?.contributors"
          :last-refreshed-at="miniProject.myGroup.lastRefreshedAt"
          :loading="refreshingGroupId === miniProject.myGroup.id"
          :error="refreshErrors[miniProject.myGroup.id]"
          @refresh="handleRefresh(miniProject.myGroup.id)"
          class="mt-3"
        />
      </div>
    </section>
    <section v-if="miniProject.myGroup" class="card mb-4" aria-labelledby="submit-heading">
      <div class="card-body p-4">
        <div class="le-card-head">
          <span class="le-section-icon" aria-hidden="true">
            <svg class="le-icon" viewBox="0 0 16 16">
              <path d="M2.5 8.5l3.5 3.5 7.5-8" />
            </svg>
          </span>
          <h2 id="submit-heading" class="h4 mb-0">Submit for review</h2>
        </div>

        <!-- The state: badge plus one sentence, so colour is never the only cue -->
        <p>
          <span
            class="badge le-status text-capitalize me-2"
            :class="{ 'is-active': miniProject.myGroup.submissionStatus !== 'draft' }"
            >{{ miniProject.myGroup.submissionStatus }}</span
          >
          {{ submissionMessages[miniProject.myGroup.submissionStatus] }}
        </p>

        <!-- Returned: feedback first, so it can't be missed -->
        <div v-if="miniProject.myGroup.submissionStatus === 'returned'" class="le-callout mb-3">
          <h3 class="h6">Professor feedback</h3>
          <p class="le-request-text">{{ miniProject.myGroup.professorFeedback }}</p>
        </div>

        <!-- Draft or returned: the student can still edit and submit -->
        <template v-if="['draft', 'returned'].includes(miniProject.myGroup.submissionStatus)">
          <ReadyChecklist
            class="mb-3"
            heading="Before you submit"
            :items="submitChecklist"
            :id-for="submitFieldId"
          />
          <label for="reflection-input" class="form-label">Reflection</label>
          <textarea
            id="reflection-input"
            v-model="reflectionDraft"
            class="form-control"
            :class="{ 'is-invalid': submitFlagged('reflection') }"
            :aria-invalid="submitFlagged('reflection') ? 'true' : undefined"
            rows="5"
            maxlength="5000"
            :readonly="submitBusy"
            @input="reflectionTouched = true"
          />
          <p class="form-text">{{ reflectionDraft.length }} / 5000</p>
          <ErrorSummary
            heading="Your work wasn't submitted"
            list-label="Problems to fix"
            :problems="submitProblems"
            :id-for="submitFieldId"
          />
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitBusy"
            @click="handleSubmit"
          >
            {{ submitBusy ? 'Submitting' : 'Submit for review' }}
          </button>
          <p v-if="submitError" class="text-danger mt-2 mb-0" role="alert">{{ submitError }}</p>
        </template>

        <!-- Submitted or approved: read only, no box, no button -->
        <template v-else>
          <h3 class="h6">Your reflection</h3>
          <p class="le-request-text mb-0">{{ miniProject.myGroup.reflection }}</p>
        </template>
      </div>
    </section>
  </div>
</template>
