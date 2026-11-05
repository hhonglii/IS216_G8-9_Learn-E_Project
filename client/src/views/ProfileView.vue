<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — profile page
//  Shows one person's profile exactly as the server sent it: mentoring points
//  and milestones, classrooms, completed challenges and project groups. A
//  professor's profile shows only their classrooms, since the rest is about
//  students. Names elsewhere in the app link here. The id
//  in the address says whose profile it is; the logged-in caller is a separate
//  identity, and only their own profile shows the edit forms.
// ════════════════════════════════════════════════════════════════════
import { useRoute } from 'vue-router'
import { computed, ref, watch } from 'vue'
const route = useRoute()
import { getProfile, updateMe, changePassword } from '../services/usersApi.js'
import AppLoading from '../components/shared/AppLoading.vue'
import AppAlert from '../components/shared/AppAlert.vue'
import UserAvatar from '../components/shared/UserAvatar.vue'
import InfoTip from '../components/shared/InfoTip.vue'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { formatDate } from '../utils/formatDate.js'
import { apiErrorMessage, apiErrorDetails } from '../utils/apiError.js'

const userId = computed(() => route.params.userId)
const profile = ref(null)
const busy = ref(false)
const error = ref('')
let profileRequest = 0
const { currentUserId, currentUser } = useCurrentUser()
const isOwnProfile = computed(() => {
  return profile.value?.id === currentUserId.value
})
const isStudentProfile = computed(() => profile.value?.role === 'student')
const nameBusy = ref(false)
const nameError = ref('')
const nameSaved = ref('')
const nameDraft = ref('')
const passwordDraft = ref({ current: '', next: '', confirm: '' })
const passwordBusy = ref(false)
const passwordError = ref('')
const passwordSaved = ref('')

const ringPercent = computed(() => {
  if (!profile.value || !profile.value.nextMilestone) {
    return 0
  } else {
    return (profile.value.helpfulCount / profile.value.nextMilestone.threshold) * 100
  }
})

async function onSaveName() {
  nameBusy.value = true
  nameError.value = ''
  nameSaved.value = ''
  try {
    const result = await updateMe(nameDraft.value.trim())
    nameDraft.value = result.data.displayName
    profile.value.displayName = result.data.displayName
    currentUser.value = result.data
    nameSaved.value = 'Name saved.'
  } catch (err) {
    nameError.value = apiErrorDetails(err, "Couldn't save your name.")
  } finally {
    nameBusy.value = false
  }
}

async function onChangePassword() {
  passwordError.value = ''
  passwordSaved.value = ''
  if (passwordDraft.value.next !== passwordDraft.value.confirm) {
    passwordError.value = 'The new passwords do not match.'
    return
  }
  passwordBusy.value = true
  try {
    await changePassword(passwordDraft.value.current, passwordDraft.value.next)
    passwordDraft.value = { current: '', next: '', confirm: '' }
    passwordSaved.value = 'Password changed. Your other devices have been logged out.'
  } catch (err) {
    passwordError.value = apiErrorDetails(err, "Couldn't change your password.")
    passwordDraft.value.current = ''
  } finally {
    passwordBusy.value = false
  }
}

//load profile
async function retrieveProfile() {
  profileRequest += 1
  const request = profileRequest

  // Remember which profile and which caller this request is for
  const requestedUserId = userId.value
  const requestedCallerId = currentUserId.value

  // If the page has moved on (newer request, other profile, other caller), ignore the answer
  function isStale() {
    return (
      request !== profileRequest ||
      userId.value !== requestedUserId ||
      currentUserId.value !== requestedCallerId
    )
  }

  // Start fresh
  profile.value = null
  busy.value = true
  error.value = ''

  try {
    const response = await getProfile(requestedUserId)
    if (isStale()) {
      return
    }
    profile.value = response.data
    nameDraft.value = profile.value.displayName
  } catch (err) {
    if (isStale()) {
      return
    }

    // Pick the most helpful message available
    error.value = apiErrorMessage(err, "We couldn't load this profile.")
  } finally {
    // Only the newest request is allowed to turn the loading state off
    if (isStale() === false) {
      busy.value = false
    }
  }
}

// run function when reactive value changes
watch(userId, retrieveProfile, { immediate: true })
</script>
<template>
  <AppLoading v-if="busy" label="Loading profile" />

  <template v-else-if="error">
    <AppAlert variant="danger" :message="error" @dismiss="error = ''" />
    <button type="button" class="btn btn-outline-primary" @click="retrieveProfile">
      Try again
    </button>
  </template>

  <section v-else-if="profile" aria-labelledby="profile-heading">
    <header class="le-person mb-4">
      <UserAvatar :user-id="profile.id" :display-name="profile.displayName" size="4rem" />
      <div>
        <h1 id="profile-heading" class="le-page-title mb-2">{{ profile.displayName }}</h1>
        <p class="le-chip text-capitalize mb-0">{{ profile.role }}</p>
      </div>
    </header>

    <div class="row g-4">
      <!-- Only students mentor, finish challenges and join groups, so a professor's
           profile shows just the classrooms they run. -->
      <div v-if="isStudentProfile" class="col-lg-5">
        <!-- Contribution summary, exactly as the server sent it -->
        <section class="card h-100" aria-labelledby="contributions-heading">
          <div class="card-body p-4">
            <div class="le-card-head">
              <span class="le-section-icon" aria-hidden="true">
                <svg class="le-icon" viewBox="0 0 16 16">
                  <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2l-3.6 1.9.7-4L2.2 6.3l4-.6z" />
                </svg>
              </span>
              <h2 id="contributions-heading" class="h5 mb-0">Mentoring contributions</h2>
              <InfoTip topic="contributionPoints" />
            </div>
            <p class="le-stat">
              <span class="le-stat-value">{{ profile.helpfulCount }}</span>
              <span class="text-body-secondary">Helpful hints given</span>
            </p>
            <div v-if="profile.role === 'student'" class="le-ring-row">
              <template v-if="profile.nextMilestone">
                <svg class="le-ring" viewBox="0 0 36 36" aria-hidden="true">
                  <circle class="le-ring-track" cx="18" cy="18" r="15.9155" />
                  <circle
                    class="le-ring-fill"
                    cx="18"
                    cy="18"
                    r="15.9155"
                    :stroke-dasharray="ringPercent + ' ' + '100'"
                    transform="rotate(-90 18 18)"
                  />
                </svg>
                <p class="mb-0">
                  {{ profile.helpfulCount }} of {{ profile.nextMilestone.threshold }} helpful hints
                  toward {{ profile.nextMilestone.label }}
                </p>
              </template>
              <p v-else class="mb-0">Every milestone reached</p>
            </div>
            <ul
              v-if="profile.milestones.length"
              class="list-unstyled d-flex flex-wrap gap-2 mb-0"
              aria-label="Milestones"
            >
              <li v-for="label in profile.milestones" :key="label">
                <span class="badge le-badge-milestone">
                  <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="6" r="4" />
                    <path d="m5.5 9.3-1 4.7L8 12.3l3.5 1.7-1-4.7" />
                  </svg>
                  {{ label }}
                </span>
              </li>
            </ul>
            <p v-else class="text-body-secondary mb-0">No milestones yet.</p>
          </div>
        </section>
      </div>

      <div :class="isStudentProfile ? 'col-lg-7' : 'col-12'">
        <!-- Classrooms the caller is allowed to see, with the stored points -->
        <section class="card h-100" aria-labelledby="profile-classrooms-heading">
          <div class="card-body p-4">
            <h2 id="profile-classrooms-heading" class="h5 mb-3">Classrooms</h2>
            <ul v-if="profile.classrooms.length" class="list-group list-group-flush">
              <li
                v-for="classroom in profile.classrooms"
                :key="classroom.id"
                class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2 px-0"
              >
                <RouterLink
                  class="le-request-text"
                  :to="{ name: 'classroom', params: { classroomId: classroom.id } }"
                >
                  {{ classroom.name }}</RouterLink
                >
                <span v-if="isStudentProfile" class="le-chip le-num"
                  >{{ classroom.contributionPoints }} points</span
                >
              </li>
            </ul>
            <p v-else class="text-body-secondary mb-0">No classrooms to show.</p>
          </div>
        </section>
      </div>
      <div v-if="isStudentProfile" class="col-lg-5">
        <section class="card h-100" aria-labelledby="completed-heading">
          <div class="card-body p-4">
            <h2 id="completed-heading" class="h5 mb-3">Completed challenges</h2>
            <ul v-if="profile.completedChallenges.length" class="list-group list-group-flush">
              <li
                v-for="challenge in profile.completedChallenges"
                :key="challenge.challengeId"
                class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2 px-0"
              >
                <RouterLink
                  class="le-request-text"
                  :to="{ name: 'challenge', params: { challengeId: challenge.challengeId } }"
                  >{{ challenge.title }}
                </RouterLink>
                <span class="text-body-secondary small">{{
                  formatDate(challenge.completedAt)
                }}</span>
              </li>
            </ul>
            <p v-else class="text-body-secondary mb-0">No completed challenges yet.</p>
          </div>
        </section>
      </div>
      <div v-if="isStudentProfile" class="col-lg-7">
        <section class="card h-100" aria-labelledby="projects-heading">
          <div class="card-body p-4">
            <h2 id="projects-heading" class="h5 mb-3">Project groups</h2>
            <ul v-if="profile.projects.length" class="list-group list-group-flush">
              <li
                v-for="project in profile.projects"
                :key="project.groupId"
                class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2 px-0"
              >
                <div>
                  <p class="mb-0">
                    <RouterLink
                      class="le-request-text"
                      :to="{
                        name: 'mini-project',
                        params: { miniProjectId: project.miniProjectId },
                      }"
                      >{{ project.groupName }}</RouterLink
                    >
                  </p>
                  <p class="mb-0 small text-body-secondary">{{ project.miniProjectTitle }}</p>
                </div>
                <span class="badge le-status text-capitalize">{{ project.submissionStatus }}</span>
              </li>
            </ul>
            <p v-else class="text-body-secondary mb-0">Not in any project group yet.</p>
          </div>
        </section>
      </div>
    </div>
    <section v-if="isOwnProfile" class="card mt-4" aria-labelledby="edit-name-heading">
      <div class="card-body p-4">
        <h2 id="edit-name-heading" class="h5 mb-3">Edit profile</h2>
        <form @submit.prevent="onSaveName">
          <AppAlert
            v-if="nameError"
            variant="danger"
            :message="nameError"
            @dismiss="nameError = ''"
          />
          <p v-if="nameSaved" role="status" class="text-success">{{ nameSaved }}</p>
          <label for="edit-display-name" class="form-label">Display name</label>
          <input
            id="edit-display-name"
            v-model="nameDraft"
            class="form-control mb-3"
            maxlength="60"
            required
          />
          <button type="submit" class="btn btn-primary" :disabled="nameBusy">Save name</button>
        </form>
      </div>
    </section>
    <section v-if="isOwnProfile" class="card mt-4" aria-labelledby="change-password-heading">
      <div class="card-body p-4">
        <h2 id="change-password-heading" class="h5 mb-3">Change password</h2>
        <form @submit.prevent="onChangePassword">
          <AppAlert
            v-if="passwordError"
            variant="danger"
            :message="passwordError"
            @dismiss="passwordError = ''"
          />
          <p v-if="passwordSaved" role="status" class="text-success">{{ passwordSaved }}</p>
          <label for="current-password" class="form-label">Current password</label>
          <input
            id="current-password"
            v-model="passwordDraft.current"
            type="password"
            autocomplete="current-password"
            class="form-control mb-3"
            required
          />
          <label for="new-password" class="form-label">New password</label>
          <input
            id="new-password"
            v-model="passwordDraft.next"
            type="password"
            autocomplete="new-password"
            class="form-control mb-3"
            minlength="8"
            maxlength="128"
            required
          />
          <label for="confirm-password" class="form-label">Confirm new password</label>
          <input
            id="confirm-password"
            v-model="passwordDraft.confirm"
            type="password"
            autocomplete="new-password"
            class="form-control mb-3"
            minlength="8"
            maxlength="128"
            required
          />
          <button type="submit" class="btn btn-primary" :disabled="passwordBusy">
            Change password
          </button>
        </form>
      </div>
    </section>
  </section>
</template>
