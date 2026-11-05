<script setup>
// The classroom's mini-projects. Everyone sees the published ones; the owning
// professor also sees drafts, and writes, saves and publishes them in the form
// here (H-8), with files stored on the server (H-10).
import { RouterLink } from 'vue-router'
import { computed, ref } from 'vue'
import {
  createMiniProject,
  updateMiniProject,
  publishMiniProject,
  deleteMiniProject,
  getMiniProject,
  uploadMaterial,
  deleteMaterial,
} from '@/services/groupsApi.js'
import MiniProjectBuilder from '../projects/MiniProjectBuilder.vue'
import AppAlert from '../shared/AppAlert.vue'
import { apiErrorMessage, apiErrorDetails } from '@/utils/apiError.js'
import { confirmDeleteDraft, confirmPublish } from '@/utils/confirmations.js'

const props = defineProps({
  classroomId: { type: String, required: true },
  // Changes to this list go back through update:miniProjects.
  miniProjects: { type: Array, default: () => [] },
  // The classroom's challenges; a brief can link the published ones.
  challenges: { type: Array, default: () => [] },
  isOwningProfessor: { type: Boolean, default: false },
})
const emit = defineEmits(['update:miniProjects'])

const showMiniProjectForm = ref(false) // true while the form is open
const miniProjectBusy = ref(false) // true while a save, publish or load runs
const miniProjectProblems = ref([]) // { message, field } from the server, shown above the form
const miniProjectMessage = ref('') // what the last save or publish did
const miniProjectListError = ref('') // a delete the server refused
const miniProjectDraft = ref(null) // the saved draft in the form, or null for a new one
const miniProjectFormKey = ref(0) // bumped on open, so the form refills from the draft
const materialStatus = ref('') // what the last upload or removal did, shown by the file picker
const materialError = ref('') // why the last upload or removal failed, shown there too
const publishedChallenges = computed(() =>
  props.challenges.filter((challenge) => challenge.status === 'published'),
)
function showMiniProjectProblems(err, fallback) {
  // On failure the form stays open, so NOTHING the professor typed is lost.
  const details = err.response?.data?.error?.details
  miniProjectProblems.value =
    Array.isArray(details) && details.length
      ? details.map((problem) => ({ message: problem.message, field: problem.field }))
      : [{ message: apiErrorMessage(err, fallback) }]
}
// Keeps the classroom list in step with what the server answered.
function listMiniProject(brief) {
  const entry = { id: brief.id, title: brief.title, status: brief.status }
  const list = props.miniProjects
  emit(
    'update:miniProjects',
    list.some((item) => item.id === brief.id)
      ? list.map((item) => (item.id === brief.id ? entry : item))
      : [...list, entry],
  )
}
function startMiniProject(draft = null) {
  miniProjectProblems.value = []
  miniProjectMessage.value = ''
  miniProjectDraft.value = draft
  materialStatus.value = ''
  materialError.value = ''
  miniProjectFormKey.value += 1
  showMiniProjectForm.value = true
}
// With a form already open, starting again would drop what is in it, so ask.
function newMiniProject() {
  const question = "Start a new mini-project? Anything you haven't saved in the open form is lost."
  if (showMiniProjectForm.value && !window.confirm(question)) return
  startMiniProject()
}
function closeMiniProjectForm() {
  showMiniProjectForm.value = false
  miniProjectDraft.value = null
  miniProjectProblems.value = []
}
async function deleteMiniProjectDraft(brief) {
  if (miniProjectBusy.value || !confirmDeleteDraft(brief.title)) return
  miniProjectBusy.value = true
  miniProjectMessage.value = ''
  miniProjectListError.value = ''
  try {
    await deleteMiniProject(brief.id)
    emit(
      'update:miniProjects',
      props.miniProjects.filter((item) => item.id !== brief.id),
    )
    if (miniProjectDraft.value?.id === brief.id) closeMiniProjectForm()
    miniProjectMessage.value = `Deleted the draft "${brief.title}".`
  } catch (err) {
    miniProjectListError.value = apiErrorMessage(err, "Couldn't delete the draft.")
  } finally {
    miniProjectBusy.value = false
  }
}
async function openMiniProjectDraft(brief) {
  if (miniProjectBusy.value || !props.isOwningProfessor) return
  miniProjectBusy.value = true
  miniProjectMessage.value = ''
  try {
    const response = await getMiniProject(brief.id)
    startMiniProject(response.data)
  } catch (err) {
    showMiniProjectProblems(err, "Couldn't open the draft.")
  } finally {
    miniProjectBusy.value = false
  }
}
// Creates the draft the first time, then saves changes to it (H-8).
async function saveMiniProjectDraft(payload) {
  const response = miniProjectDraft.value
    ? await updateMiniProject(miniProjectDraft.value.id, payload)
    : await createMiniProject(props.classroomId, payload)
  miniProjectDraft.value = response.data
  listMiniProject(response.data)
}
async function handleSaveMiniProject(payload) {
  if (miniProjectBusy.value || !props.isOwningProfessor) return
  miniProjectBusy.value = true
  miniProjectProblems.value = []
  miniProjectMessage.value = ''
  try {
    await saveMiniProjectDraft(payload)
    miniProjectMessage.value = "Draft saved. Students can't see it until you publish it."
  } catch (err) {
    showMiniProjectProblems(err, "Couldn't save the draft.")
  } finally {
    miniProjectBusy.value = false
  }
}
// Files attach to the saved draft (H-10). The page keeps its copy of the draft
// in step, so the builder lists the change at once without reloading.
function setDraftMaterials(materials) {
  miniProjectDraft.value = { ...miniProjectDraft.value, materials }
}
// Why a file request failed, in words the professor can act on.
function materialFailure(err, fallback) {
  if (err.response?.status === 413) return 'Files can be up to 4 MB.'
  return apiErrorDetails(err, fallback)
}
async function handleUploadMaterial(file) {
  if (miniProjectBusy.value || !miniProjectDraft.value) return
  miniProjectBusy.value = true
  materialStatus.value = ''
  materialError.value = ''
  try {
    const response = await uploadMaterial(miniProjectDraft.value.id, file)
    setDraftMaterials([...(miniProjectDraft.value.materials ?? []), response.data])
    materialStatus.value = `Added ${response.data.name}.`
  } catch (err) {
    materialError.value = materialFailure(err, "Couldn't upload the file.")
  } finally {
    miniProjectBusy.value = false
  }
}
async function handleRemoveMaterial(material) {
  if (miniProjectBusy.value || !miniProjectDraft.value) return
  // Asks first, like Delete draft, because the stored file goes for good (UX audit A7).
  if (!window.confirm(`Remove "${material.name}"? This can't be undone.`)) return
  miniProjectBusy.value = true
  materialStatus.value = ''
  materialError.value = ''
  try {
    await deleteMaterial(miniProjectDraft.value.id, material.id)
    setDraftMaterials(miniProjectDraft.value.materials.filter((item) => item.id !== material.id))
    materialStatus.value = `Removed ${material.name}.`
  } catch (err) {
    materialError.value = materialFailure(err, "Couldn't remove the file.")
  } finally {
    miniProjectBusy.value = false
  }
}

// Publishing saves what is in the form first, so nothing typed since the
// last save is left out.
async function handlePublishMiniProject(payload) {
  if (miniProjectBusy.value || !props.isOwningProfessor) return
  if (!confirmPublish(payload.title, 'see it')) return
  miniProjectBusy.value = true
  miniProjectProblems.value = []
  miniProjectMessage.value = ''
  try {
    await saveMiniProjectDraft(payload)
    const response = await publishMiniProject(miniProjectDraft.value.id)
    listMiniProject(response.data)
    // closing the form removes the component, which also clears what was typed.
    showMiniProjectForm.value = false
    miniProjectDraft.value = null
    miniProjectMessage.value = 'Mini-project published. Students can now see it.'
  } catch (err) {
    showMiniProjectProblems(err, "Couldn't publish the mini-project.")
  } finally {
    miniProjectBusy.value = false
  }
}
</script>
<template>
  <section class="card mt-4 section-projects" aria-labelledby="classroom-miniprojects-heading">
    <div class="card-body">
      <div class="le-card-head">
        <span class="le-section-icon" aria-hidden="true">
          <svg class="le-icon" viewBox="0 0 16 16">
            <path
              d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.1v.7h4v-.7c0-.4.2-.8.6-1.1A4.5 4.5 0 0 0 8 1.5z"
            />
          </svg>
        </span>
        <h2 id="classroom-miniprojects-heading" class="h4 mb-0">Mini-projects</h2>
      </div>

      <p v-if="miniProjectMessage" class="text-success" role="status">
        {{ miniProjectMessage }}
      </p>
      <AppAlert
        variant="danger"
        :message="miniProjectListError"
        @dismiss="miniProjectListError = ''"
      />
      <div
        v-if="miniProjectProblems.length && !showMiniProjectForm"
        class="alert alert-danger"
        role="alert"
      >
        {{ miniProjectProblems.map((problem) => problem.message).join(' ') }}
      </div>
      <!-- Stays on the page like New challenge, so keyboard focus stays here and
         the next Tab goes into the form below it (third-pass audit R). -->
      <button
        v-if="isOwningProfessor"
        type="button"
        class="btn btn-primary mb-3"
        :disabled="miniProjectBusy"
        @click="newMiniProject"
      >
        New mini-project
      </button>
      <MiniProjectBuilder
        v-if="isOwningProfessor && showMiniProjectForm"
        :key="miniProjectFormKey"
        :busy="miniProjectBusy"
        :problems="miniProjectProblems"
        :challenges="publishedChallenges"
        :draft="miniProjectDraft"
        :material-status="materialStatus"
        :material-error="materialError"
        @save="handleSaveMiniProject"
        @publish="handlePublishMiniProject"
        @cancel="closeMiniProjectForm"
        @upload="handleUploadMaterial"
        @remove-material="handleRemoveMaterial"
      />
      <ul v-if="miniProjects.length" class="list-group list-group-flush">
        <li
          v-for="brief in miniProjects"
          :key="brief.id"
          class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-3"
        >
          <span class="d-flex align-items-center gap-2">
            <svg class="le-icon text-body-secondary" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
            <RouterLink :to="{ name: 'mini-project', params: { miniProjectId: brief.id } }">
              {{ brief.title }}
            </RouterLink>
            <span
              v-if="isOwningProfessor"
              class="badge"
              :class="brief.status === 'draft' ? 'le-badge-draft' : 'le-badge-published'"
            >
              {{ brief.status === 'draft' ? 'Draft' : 'Published' }}
            </span>
          </span>
          <div v-if="isOwningProfessor && brief.status === 'draft'" class="d-flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              :disabled="miniProjectBusy"
              :aria-label="`Edit draft: ${brief.title}`"
              @click="openMiniProjectDraft(brief)"
            >
              Edit draft
            </button>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              :disabled="miniProjectBusy"
              :aria-label="`Delete draft: ${brief.title}`"
              @click="deleteMiniProjectDraft(brief)"
            >
              Delete draft
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="text-body-secondary mb-0">No mini-projects yet.</p>
    </div>
  </section>
</template>
