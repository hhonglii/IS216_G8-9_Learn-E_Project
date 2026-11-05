<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — classroom page
//  One route for everyone in the classroom: the header with the join code (or,
//  for a student, the professor's name linking to their profile) and the ways
//  out, then the challenges, mini-projects, Boss Battle and leaderboard,
//  each its own component in components/classrooms. The owning professor also gets
//  challenge authoring and the mini-project form there, and the link to
//  Professor Review here.
// ════════════════════════════════════════════════════════════════════
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { getClassroom, leaveClassroom, deleteClassroom } from '../services/classroomsApi.js'
import { getClassroomGame } from '../services/classroomGamesApi.js'
import ClassroomChallenges from '../components/classrooms/ClassroomChallenges.vue'
import ClassroomMiniProjects from '../components/classrooms/ClassroomMiniProjects.vue'
import ClassroomLeaderboard from '../components/classrooms/ClassroomLeaderboard.vue'
import ClassroomBossBattle from '../components/classrooms/ClassroomBossBattle.vue'
import { describeChallengeError } from '../utils/challengeErrors.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppLoading from '../components/shared/AppLoading.vue'
import AppAlert from '../components/shared/AppAlert.vue'
import { coverFor } from '../config/covers.js'
import { apiErrorMessage } from '../utils/apiError.js'

const route = useRoute()
const router = useRouter()
const { currentUserId, currentUser } = useCurrentUser()

const classroom = ref(null)
// Bumped on every load and used as the sections' key, so each load (a refresh,
// another classroom, another user) starts them fresh.
const classroomLoad = ref(0)
// The Boss Battle reply, for the Boss Battle section.
const gameInfo = ref(null)
const busy = ref(false)
const error = ref('')
const selectedUserId = ref(currentUserId.value)
const isOwningProfessor = computed(
  () => classroom.value?.professorId === selectedUserId.value && Boolean(classroom.value?.joinCode),
)
// UX audit 26: the Copy button beside the join code. The browser can refuse
// (an http page or a blocked permission), so a failure says how to copy by hand.
const joinCodeCopy = ref('') // '', 'copied' or 'failed'
// Leaving the classroom (UX audit A4) and deleting it (A6) both end on the
// dashboard. The server refuses a leave while the student is still in a
// mini-project group and names the group.
const isStudent = computed(() => currentUser.value?.role === 'student')
const exitBusy = ref(false)
const exitError = ref('')
async function handleLeaveClassroom() {
  if (exitBusy.value) return
  const name = classroom.value.name
  const question =
    `Leave "${name}"? Your contribution points here are removed, and help requests ` +
    'nobody has answered are withdrawn. Your attempts stay, and you can rejoin with the join code. ' +
    "If you're in a mini-project group here, leave the group first."
  if (!window.confirm(question)) return
  exitBusy.value = true
  exitError.value = ''
  try {
    await leaveClassroom(classroom.value.id)
    await router.push({ name: 'dashboard' })
  } catch (err) {
    exitError.value = apiErrorMessage(err, "Couldn't leave the classroom.")
  } finally {
    exitBusy.value = false
  }
}
async function handleDeleteClassroom() {
  if (exitBusy.value) return
  const question =
    `Delete "${classroom.value.name}" and everything in it? Its challenges, attempts, ` +
    "mini-projects and their files, groups, help requests and student memberships all go. This can't be undone."
  if (!window.confirm(question)) return
  exitBusy.value = true
  exitError.value = ''
  try {
    await deleteClassroom(classroom.value.id)
    await router.push({ name: 'dashboard' })
  } catch (err) {
    exitError.value = apiErrorMessage(err, "Couldn't delete the classroom.")
  } finally {
    exitBusy.value = false
  }
}
let classroomRequest = 0

const classroomId = computed(() => {
  return route.params.classroomId
})

async function copyJoinCode() {
  try {
    await navigator.clipboard.writeText(classroom.value.joinCode)
    joinCodeCopy.value = 'copied'
  } catch {
    joinCodeCopy.value = 'failed'
  }
}
async function retrieveClassroom() {
  const request = ++classroomRequest
  const requestedClassroomId = classroomId.value
  selectedUserId.value = currentUserId.value
  const requestedUserId = selectedUserId.value
  const isCurrent = () =>
    request === classroomRequest &&
    classroomId.value === requestedClassroomId &&
    currentUserId.value === requestedUserId
  classroom.value = null
  gameInfo.value = null
  joinCodeCopy.value = ''
  busy.value = true
  error.value = ''
  try {
    const retrieval = await getClassroom(requestedClassroomId)
    if (!isCurrent()) return
    classroom.value = retrieval.data
    classroomLoad.value += 1
    retrieveGame(requestedClassroomId, isCurrent)
  } catch (err) {
    if (!isCurrent()) return
    error.value = describeChallengeError(err, 'classroom').message
  } finally {
    if (isCurrent()) {
      busy.value = false
    }
  }
}

// Not awaited, so the classroom shows without waiting for the game. Reading the
// game never starts a run. If it fails, the student just doesn't get the link.
async function retrieveGame(requestedClassroomId, isCurrent) {
  try {
    const reply = await getClassroomGame(requestedClassroomId)
    if (isCurrent()) gameInfo.value = reply.data
  } catch {
    if (isCurrent()) gameInfo.value = null
  }
}

watch([classroomId, currentUserId], retrieveClassroom)
onMounted(() => {
  retrieveClassroom()
})
onUnmounted(() => {
  classroomRequest++
})
</script>
<template>
  <AppLoading v-if="busy"></AppLoading>
  <AppAlert v-if="error" variant="danger" :message="error" @dismiss="error = ''"></AppAlert>
  <button v-if="error" type="button" class="btn btn-outline-primary" @click="retrieveClassroom">
    Try again
  </button>
  <div v-if="classroom" :key="classroomLoad">
    <div class="card mb-4">
      <div class="row g-0">
        <div class="col-md-5 col-lg-4">
          <div class="le-cover le-cover--hero" aria-hidden="true">
            <div
              class="le-cover-art"
              :style="{ backgroundImage: `url('${coverFor(classroom.coverId).file}')` }"
            ></div>
          </div>
        </div>
        <div class="col-md-7 col-lg-8 d-flex">
          <div class="card-body p-4 align-self-center">
            <h2 class="le-page-title mb-2">{{ classroom.name }}</h2>
            <p v-if="classroom.professorName && !classroom.joinCode" class="mb-2">
              <span class="text-body-secondary me-1">Professor:</span>
              <RouterLink :to="{ name: 'profile', params: { userId: classroom.professorId } }">{{
                classroom.professorName
              }}</RouterLink>
            </p>
            <div v-if="classroom.joinCode" class="d-flex flex-wrap align-items-center gap-2 mb-2">
              <p class="le-chip mb-0">
                Join code: <span class="font-monospace">{{ classroom.joinCode }}</span>
              </p>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="copyJoinCode">
                {{ joinCodeCopy === 'copied' ? 'Copied' : 'Copy' }}
                <span class="visually-hidden">join code</span>
              </button>
              <span v-if="joinCodeCopy === 'copied'" class="visually-hidden" role="status">
                Join code copied.
              </span>
            </div>
            <p v-if="joinCodeCopy === 'failed'" class="text-danger small" role="alert">
              Couldn't copy. Select the code and copy it yourself.
            </p>
            <p v-if="classroom.description" class="text-body-secondary mb-0">
              {{ classroom.description }}
            </p>
            <!-- The sidebar has Classroom and Help Queue. Review is here, because only
                 this page knows that the person owns the classroom (decision G-11). The
                 Boss Battle has its own section below (H-20). -->
            <div class="d-flex flex-wrap gap-2 mt-3">
              <RouterLink
                v-if="classroom.joinCode"
                class="btn btn-outline-primary"
                :to="{ name: 'professor-review', params: { classroomId: classroom.id } }"
              >
                Professor review
              </RouterLink>
              <button
                v-if="isStudent"
                type="button"
                class="btn btn-outline-danger"
                :disabled="exitBusy"
                @click="handleLeaveClassroom"
              >
                Leave classroom
              </button>
              <button
                v-if="isOwningProfessor"
                type="button"
                class="btn btn-outline-danger"
                :disabled="exitBusy"
                @click="handleDeleteClassroom"
              >
                Delete classroom
              </button>
            </div>
            <p v-if="exitError" class="alert alert-danger mt-3 mb-0" role="alert">
              {{ exitError }}
            </p>
          </div>
        </div>
      </div>
    </div>
    <ClassroomChallenges
      v-model:challenges="classroom.challenges"
      :classroom-id="classroom.id"
      :is-owning-professor="isOwningProfessor"
      @refresh="retrieveClassroom"
    />
    <ClassroomMiniProjects
      v-model:mini-projects="classroom.miniProjects"
      :classroom-id="classroom.id"
      :challenges="classroom.challenges"
      :is-owning-professor="isOwningProfessor"
    />
    <ClassroomBossBattle
      :classroom-id="classroom.id"
      :is-owning-professor="Boolean(classroom.joinCode)"
      :game-info="gameInfo"
    />
    <ClassroomLeaderboard :classroom-id="classroom.id" />
  </div>
</template>
