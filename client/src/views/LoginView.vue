<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — log in and create account
//  The only page that works without a session token. Logging in or creating an
//  account stores the token, then goes back to the page the person asked for
//  (the redirect query) or the dashboard. A professor account needs the
//  professor sign-up code, which the server checks.
// ════════════════════════════════════════════════════════════════════
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppAlert from '@/components/shared/AppAlert.vue'
import ErrorSummary from '@/components/shared/ErrorSummary.vue'
import { apiErrorMessage } from '@/utils/apiError.js'

const route = useRoute()
const router = useRouter()
const { login, register } = useCurrentUser()

const loginForm = ref({ username: '', password: '' })
const createForm = ref({
  username: '',
  displayName: '',
  role: 'student',
  password: '',
  professorCode: '',
})
const busy = ref(false)
const loginError = ref('')
// Blank log-in fields are named under each field before anything is sent (fifth pass W4).
const loginBlank = ref({ username: false, password: false })
const createError = ref('')
// Every problem the server named, each linked to its field (UX audit items 2 and 4).
const createProblems = ref([])
const createFieldIds = {
  username: 'create-username',
  displayName: 'create-display-name',
  role: 'create-role',
  professorCode: 'create-professor-code',
  password: 'create-password',
}
const createFieldId = (field) => createFieldIds[field] ?? ''
const createFlagged = (field) => createProblems.value.some((problem) => problem.field === field)
const invalidAttrs = (field) =>
  createFlagged(field) ? { class: 'is-invalid', 'aria-invalid': 'true' } : {}

function safeRedirect() {
  const target = route.query.redirect
  if (typeof target !== 'string') {
    return '/'
  }
  if (!target.startsWith('/')) {
    return '/'
  }
  if (target.startsWith('//')) {
    return '/'
  }
  if (target.startsWith('/login') || target.startsWith('/login?')) {
    return '/'
  }
  return target
}
// Each form clears the other's messages, so only the form just used shows any (fifth pass W5).
function clearCreateMessages() {
  createError.value = ''
  createProblems.value = []
}
function clearLoginMessages() {
  loginError.value = ''
  loginBlank.value = { username: false, password: false }
}
async function onLogin() {
  clearCreateMessages()
  clearLoginMessages()
  loginBlank.value = {
    username: !loginForm.value.username.trim(),
    password: !loginForm.value.password,
  }
  if (loginBlank.value.username || loginBlank.value.password) return
  busy.value = true
  try {
    await login(loginForm.value.username, loginForm.value.password)
    router.push(safeRedirect())
  } catch (err) {
    loginError.value = apiErrorMessage(err, "Couldn't log you in.")
    loginForm.value.password = ''
  } finally {
    busy.value = false
  }
}
async function onCreate() {
  clearLoginMessages()
  clearCreateMessages()
  busy.value = true
  try {
    await register(createForm.value)
    router.push(safeRedirect())
  } catch (err) {
    const error = err.response?.data?.error
    if (Array.isArray(error?.details) && error.details.length) {
      createProblems.value = error.details.map(({ message, field }) => ({ message, field }))
    } else {
      createError.value = error?.message ?? 'Could not reach the server.'
    }
    createForm.value.password = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="le-login">
    <section class="le-hero le-login-hero" aria-labelledby="login-page-heading">
      <div>
        <p class="le-hero-kicker">Welcome</p>
        <h2 id="login-page-heading" class="le-hero-title">Log in to Learn-E</h2>
        <p class="mb-0">Log in, or create an account to join a classroom.</p>
      </div>
    </section>
    <div class="le-login-forms">
      <section class="card le-tile" aria-labelledby="login-heading">
        <div class="card-body">
          <h3 id="login-heading" class="h5">Log in</h3>
          <AppAlert variant="danger" :message="loginError" @dismiss="loginError = ''" />
          <form @submit.prevent="onLogin">
            <label for="login-username" class="form-label">Username</label>
            <div class="mb-3">
              <input
                id="login-username"
                v-model="loginForm.username"
                autocomplete="username"
                class="form-control"
                :class="{ 'is-invalid': loginBlank.username }"
                :aria-invalid="loginBlank.username ? 'true' : undefined"
                :aria-describedby="loginBlank.username ? 'login-username-error' : undefined"
              />
              <p
                v-if="loginBlank.username"
                id="login-username-error"
                class="invalid-feedback d-block mb-0"
                role="alert"
              >
                Enter your username.
              </p>
            </div>
            <label for="login-password" class="form-label">Password</label>
            <div class="mb-3">
              <input
                id="login-password"
                v-model="loginForm.password"
                type="password"
                autocomplete="current-password"
                class="form-control"
                :class="{ 'is-invalid': loginBlank.password }"
                :aria-invalid="loginBlank.password ? 'true' : undefined"
                :aria-describedby="loginBlank.password ? 'login-password-error' : undefined"
              />
              <p
                v-if="loginBlank.password"
                id="login-password-error"
                class="invalid-feedback d-block mb-0"
                role="alert"
              >
                Enter your password.
              </p>
            </div>
            <button :disabled="busy" class="btn btn-primary">Log in</button>
          </form>
        </div>
      </section>
      <section class="card le-tile" aria-labelledby="create-heading">
        <div class="card-body">
          <h3 id="create-heading" class="h5">Create account</h3>
          <AppAlert variant="danger" :message="createError" @dismiss="createError = ''" />
          <form @submit.prevent="onCreate">
            <label for="create-username" class="form-label">Username</label>
            <input
              id="create-username"
              v-model="createForm.username"
              autocomplete="username"
              aria-describedby="create-username-hint"
              class="form-control"
              v-bind="invalidAttrs('username')"
            />
            <p id="create-username-hint" class="form-text mt-1 mb-3">
              3 to 30 characters: letters, numbers, dots, dashes or underscores.
            </p>

            <label for="create-display-name" class="form-label">Display name</label>
            <input
              id="create-display-name"
              v-model="createForm.displayName"
              maxlength="60"
              class="form-control mb-3"
              v-bind="invalidAttrs('displayName')"
            />

            <label for="create-role" class="form-label">Role</label>
            <select id="create-role" v-model="createForm.role" class="form-select mb-3">
              <option value="student">Student</option>
              <option value="professor">Professor</option>
            </select>

            <template v-if="createForm.role === 'professor'">
              <label for="create-professor-code" class="form-label">Professor sign-up code</label>
              <input
                id="create-professor-code"
                v-model="createForm.professorCode"
                type="password"
                autocomplete="off"
                class="form-control mb-3"
                v-bind="invalidAttrs('professorCode')"
              />
            </template>

            <label for="create-password" class="form-label">Password</label>
            <input
              id="create-password"
              v-model="createForm.password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
              aria-describedby="create-password-hint"
              class="form-control"
              v-bind="invalidAttrs('password')"
            />
            <p id="create-password-hint" class="form-text mt-1 mb-3">8 to 128 characters.</p>

            <ErrorSummary
              heading="Your account wasn't created"
              list-label="Sign-up problems"
              :problems="createProblems"
              :id-for="createFieldId"
            />
            <button :disabled="busy" class="btn btn-primary">Create account</button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>
