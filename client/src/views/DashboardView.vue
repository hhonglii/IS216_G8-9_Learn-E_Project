<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — dashboard
//  The logged-in user's classrooms, with the create form for a professor and
//  the join form for a student. Both see what is waiting on them,
//  each row linking to the page where they act on it.
// ════════════════════════════════════════════════════════════════════
import { useRouter } from 'vue-router'
import { ref, watch, computed } from 'vue'
import { getProfile } from '../services/usersApi.js'
import { createClassroom, joinClassroom, getWaitingOnMe } from '../services/classroomsApi.js'
import JoinClassroomForm from '../components/classrooms/JoinClassroomForm.vue'
import ClassroomCard from '../components/classrooms/ClassroomCard.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { apiErrorMessage } from '../utils/apiError.js'
import { covers } from '../config/covers.js'

const router = useRouter()

const { currentUser, currentUserId } = useCurrentUser()
const drafts = ref({
  create: {
    name: '',
    description: '',
    coverId: 'default',
  },
})
const createdClassroom = ref(null)
const busy = ref(false)
const error = ref('')
const joinedClassroom = ref(null)
const classrooms = ref([])
// A server error about one field (details.field) shows under that field, marked, like
// sign-up's (fifth pass W6). Anything else still goes to the toast.
const createProblem = ref('')
const joinProblem = ref('')
const fieldError = (err, field) => {
  const reply = err.response?.data?.error
  return reply?.details?.field === field ? reply.message : ''
}

async function loadClassrooms() {
  error.value = ''
  classrooms.value = []
  if (!currentUserId.value) {
    return
  } else {
    busy.value = true
    // A reply that lands after someone else logs in is dropped.
    const oldCheck = currentUserId.value
    try {
      const retrieval = (await getProfile(currentUserId.value)).data.classrooms
      if (currentUserId.value !== oldCheck) {
        return
      }
      classrooms.value = retrieval
    } catch (err) {
      if (currentUserId.value !== oldCheck) {
        return
      }
      error.value = apiErrorMessage(err, "Couldn't load your classrooms.")
    } finally {
      if (currentUserId.value === oldCheck) {
        busy.value = false
      }
    }
  }
}

watch(currentUserId, loadClassrooms, { immediate: true })

// "Waiting on you": one entry per classroom from GET /api/classrooms/waiting,
// already sorted by the server with the longest wait first. Each kind of
// waiting work becomes its own row below. A professor reviews and answers help;
// a student fixes returned work and says whether a hint helped, then hears
// about questions they can answer, new challenges and recent approvals.
const waiting = ref([])
const waitingBusy = ref(false)
const waitingError = ref('')

async function loadWaiting() {
  waiting.value = []
  waitingError.value = ''
  if (!currentUser.value) {
    return
  } else {
    waitingBusy.value = true
    const oldCheck = currentUserId.value
    try {
      const result = (await getWaitingOnMe()).data
      if (currentUserId.value !== oldCheck) {
        return
      }
      waiting.value = result
    } catch (err) {
      if (currentUserId.value !== oldCheck) {
        return
      }
      waitingError.value = apiErrorMessage(err, "Couldn't load what is waiting on you.")
    } finally {
      if (currentUserId.value === oldCheck) {
        waitingBusy.value = false
      }
    }
  }
}

watch(currentUserId, loadWaiting, { immediate: true })

function studentRows(c) {
  const rows = []
  for (const item of c.returnedDiagnoses ?? []) {
    rows.push({
      key: `${c.classroomId}-diagnosis-${item.challengeId}`,
      text: `${c.classroomName}: your diagnosis for "${item.title}" was returned. Fix it and send it again.`,
      to: { name: 'challenge', params: { challengeId: item.challengeId } },
    })
  }
  for (const item of c.returnedProjects ?? []) {
    rows.push({
      key: `${c.classroomId}-project-${item.miniProjectId}`,
      text: `${c.classroomName}: your group's work on "${item.title}" was returned. Fix it and submit again.`,
      to: { name: 'mini-project', params: { miniProjectId: item.miniProjectId } },
    })
  }
  if (c.hintsToCheck > 0) {
    const text =
      c.hintsToCheck === 1
        ? 'a mentor sent you a hint. Say if it helped.'
        : `mentors sent you ${c.hintsToCheck} hints. Say if they helped.`
    rows.push({
      key: `${c.classroomId}-hints`,
      text: `${c.classroomName}: ${text}`,
      to: { name: 'help-queue', params: { classroomId: c.classroomId } },
    })
  }
  // UX audit item 10: what else is new, after what needs fixing.
  if (c.requestsToHelp > 0) {
    const text =
      c.requestsToHelp === 1
        ? 'a classmate asked about a challenge you finished. You can help.'
        : `${c.requestsToHelp} classmates asked about challenges you finished. You can help.`
    rows.push({
      key: `${c.classroomId}-to-help`,
      text: `${c.classroomName}: ${text}`,
      to: { name: 'help-queue', params: { classroomId: c.classroomId } },
    })
  }
  for (const item of c.newChallenges ?? []) {
    rows.push({
      key: `${c.classroomId}-new-${item.challengeId}`,
      text: `${c.classroomName}: new challenge "${item.title}". You haven't started it yet.`,
      to: { name: 'challenge', params: { challengeId: item.challengeId } },
    })
  }
  for (const item of c.approvedDiagnoses ?? []) {
    rows.push({
      key: `${c.classroomId}-approved-${item.challengeId}`,
      text: `${c.classroomName}: your diagnosis for "${item.title}" was approved. You can now help classmates with it.`,
      to: { name: 'help-queue', params: { classroomId: c.classroomId } },
    })
  }
  return rows
}

const waitingRows = computed(() => {
  const rows = []
  for (const c of waiting.value) {
    if (!isProfessor.value) {
      rows.push(...studentRows(c))
      continue
    }
    const review = { name: 'professor-review', params: { classroomId: c.classroomId } }
    const help = { name: 'help-queue', params: { classroomId: c.classroomId } }
    if (c.pendingDiagnoses > 0) {
      const word = c.pendingDiagnoses === 1 ? 'diagnosis' : 'diagnoses'
      rows.push({
        key: `${c.classroomId}-diagnoses`,
        text: `${c.classroomName}: ${c.pendingDiagnoses} applied ${word} to review`,
        to: review,
      })
    }
    if (c.pendingGroups > 0) {
      const word = c.pendingGroups === 1 ? 'project' : 'projects'
      rows.push({
        key: `${c.classroomId}-groups`,
        text: `${c.classroomName}: ${c.pendingGroups} group ${word} submitted`,
        to: review,
      })
    }
    if (c.openHelpRequests > 0) {
      const word = c.openHelpRequests === 1 ? 'request' : 'requests'
      rows.push({
        key: `${c.classroomId}-help`,
        text: `${c.classroomName}: ${c.openHelpRequests} open help ${word}`,
        to: help,
      })
    }
  }
  return rows
})

const isProfessor = computed(() => {
  return currentUser.value?.role === 'professor'
})

async function onCreateClassroom() {
  createdClassroom.value = null
  busy.value = true
  error.value = ''
  createProblem.value = ''
  try {
    const classroom = await createClassroom({
      name: drafts.value.create.name,
      description: drafts.value.create.description,
      coverId: drafts.value.create.coverId,
    })
    createdClassroom.value = classroom.data
    drafts.value.create.name = ''
    drafts.value.create.description = ''
    drafts.value.create.coverId = 'default'
    await loadClassrooms()
  } catch (err) {
    createProblem.value = fieldError(err, 'name')
    if (!createProblem.value) error.value = apiErrorMessage(err, "Couldn't create the classroom.")
  } finally {
    busy.value = false
  }
}

const isStudent = computed(() => {
  return currentUser.value?.role === 'student'
})

async function onJoinClassroom(code) {
  joinedClassroom.value = null
  busy.value = true
  error.value = ''
  joinProblem.value = ''
  try {
    const classroom = await joinClassroom(code)
    // A repeat join succeeds without change, so say so rather than "Joined" (fifth pass W7).
    const alreadyIn = classrooms.value.some(
      (c) => String(c.id) === String(classroom.data.classroomId),
    )
    joinedClassroom.value = { ...classroom.data, alreadyIn }
    await loadClassrooms()
  } catch (err) {
    joinProblem.value = fieldError(err, 'joinCode')
    if (!joinProblem.value) error.value = apiErrorMessage(err, "Couldn't join the classroom.")
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="le-hero" aria-labelledby="dashboard-heading">
    <div>
      <p class="le-hero-kicker">
        {{ isProfessor ? 'Professor dashboard' : isStudent ? 'Student dashboard' : 'Dashboard' }}
      </p>
      <h2 id="dashboard-heading" class="le-hero-title">Your classrooms</h2>
      <p v-if="currentUserId && !busy" class="le-mono mb-0">
        {{ classrooms.length }} {{ classrooms.length === 1 ? 'classroom' : 'classrooms' }}
      </p>
    </div>
  </section>

  <div class="le-toasts">
    <p v-if="busy" class="le-chip mb-0">Working...</p>
    <div v-if="error" role="alert" class="alert alert-danger le-toast">{{ error }}</div>
    <div v-if="joinedClassroom" class="alert alert-success le-toast">
      <span>
        {{ joinedClassroom.alreadyIn ? "You're already in" : 'Joined' }}
        {{ joinedClassroom.classroom.name }}
      </span>
      <button
        class="btn btn-sm btn-outline-primary"
        @click="
          router.push({
            name: 'classroom',
            params: {
              classroomId: joinedClassroom.classroomId,
            },
          })
        "
      >
        Open classroom
      </button>
    </div>
    <div v-if="createdClassroom" class="alert alert-success le-toast">
      <span>Created {{ createdClassroom.name }}. Join code: {{ createdClassroom.joinCode }}</span>
      <button
        class="btn btn-sm btn-outline-primary"
        @click="
          router.push({
            name: 'classroom',
            params: {
              classroomId: createdClassroom.id,
            },
          })
        "
      >
        Open classroom
      </button>
    </div>
  </div>
  <section v-if="currentUser" class="card mb-4" aria-labelledby="waiting-heading">
    <div class="card-body">
      <h3 id="waiting-heading" class="h5">Waiting on you</h3>
      <p v-if="waitingBusy" class="text-body-secondary mb-0">Loading...</p>
      <p v-else-if="waitingError" class="text-danger mb-0" role="alert">{{ waitingError }}</p>
      <p v-else-if="waitingRows.length === 0" class="text-body-secondary mb-0">
        Nothing is waiting on you.
      </p>
      <ul v-else class="mb-0">
        <li v-for="row in waitingRows" :key="row.key">
          <RouterLink :to="row.to">{{ row.text }}</RouterLink>
        </li>
      </ul>
    </div>
  </section>
  <div class="row g-4 le-card-grid">
    <div v-if="isProfessor" class="col-12 col-sm-6 col-lg-4">
      <section class="card le-tile h-100" aria-labelledby="new-classroom-heading">
        <div class="card-body">
          <h3 id="new-classroom-heading" class="h5">New classroom</h3>
          <form @submit.prevent="onCreateClassroom">
            <label for="new-classroom-name" class="form-label">Classroom name</label>
            <div class="mb-3">
              <input
                id="new-classroom-name"
                v-model="drafts.create.name"
                class="form-control"
                :class="{ 'is-invalid': createProblem }"
                :aria-invalid="createProblem ? 'true' : undefined"
                :aria-describedby="createProblem ? 'new-classroom-name-error' : undefined"
              />
              <p
                v-if="createProblem"
                id="new-classroom-name-error"
                class="invalid-feedback d-block mb-0"
                role="alert"
              >
                {{ createProblem }}
              </p>
            </div>
            <label for="new-classroom-description" class="form-label">Description (optional)</label>
            <input
              id="new-classroom-description"
              v-model="drafts.create.description"
              class="form-control mb-3"
            />
            <!-- Decision G-10. Real radio inputs, so arrow keys move between covers.
                 btn-check hides the circle and the label shows the cover instead. -->
            <fieldset class="mb-3">
              <legend class="form-label fs-6">Cover</legend>
              <div class="le-cover-picker">
                <template v-for="cover in covers" :key="cover.id">
                  <input
                    :id="`new-classroom-cover-${cover.id}`"
                    v-model="drafts.create.coverId"
                    type="radio"
                    class="btn-check"
                    name="new-classroom-cover"
                    :value="cover.id"
                  /><label :for="`new-classroom-cover-${cover.id}`" class="le-cover-option"
                    ><span
                      class="le-cover-option-art"
                      :style="{ backgroundImage: `url('${cover.file}')` }"
                    ></span
                    ><span class="visually-hidden">{{ cover.label }}</span></label
                  >
                </template>
              </div>
              <p class="form-text mb-0" aria-hidden="true">
                {{ covers.find((cover) => cover.id === drafts.create.coverId)?.label }}
              </p>
            </fieldset>
            <button :disabled="busy" class="btn btn-primary">Create classroom</button>
          </form>
        </div>
      </section>
    </div>
    <div v-if="isStudent" class="col-12 col-sm-6 col-lg-4">
      <section class="card le-tile h-100" aria-labelledby="join-classroom-heading">
        <div class="card-body">
          <h3 id="join-classroom-heading" class="h5">Join classroom</h3>
          <JoinClassroomForm :busy="busy" :problem="joinProblem" @join="onJoinClassroom">
          </JoinClassroomForm>
        </div>
      </section>
    </div>
    <div v-for="c in classrooms" :key="c.id" class="col-12 col-sm-6 col-lg-4">
      <ClassroomCard
        :classroom="c"
        @open="
          router.push({
            name: 'classroom',
            params: {
              classroomId: $event,
            },
          })
        "
      />
    </div>
  </div>
  <EmptyState
    v-if="currentUserId && !busy && classrooms.length === 0 && !error"
    class="mt-4"
    title="No classrooms yet"
    :message="
      isProfessor
        ? 'Create your first classroom in New classroom above, then give students its join code.'
        : isStudent
          ? 'Ask your professor for a join code and enter it in Join classroom above.'
          : 'Professors can create a classroom. Students can join one with a join code.'
    "
  ></EmptyState>
</template>
