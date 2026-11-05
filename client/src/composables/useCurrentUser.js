// Who is logged in, shared by every page. There is one currentUser for the whole
// app; refresh() asks the server who the stored session token belongs to, and
// login, register and logout keep the token and currentUser in step.
import { getSessionToken, clearSessionToken, setSessionToken } from '@/utils/sessionToken'
import { ref, computed } from 'vue'
import {
  getMe,
  login as loginRequest,
  register as registerRequest,
  logout as logoutRequest,
} from '@/services/authApi'

const currentUser = ref(null)
const currentUserId = computed(() => currentUser.value?.id ?? null)

export function useCurrentUser() {
  async function refresh() {
    if (!getSessionToken()) {
      currentUser.value = null
      return
    } else {
      try {
        currentUser.value = (await getMe()).data
      } catch (err) {
        if (err.response?.status === 401) {
          clearSessionToken()
          currentUser.value = null
        } else {
          currentUser.value = null
        }
      }
    }
  }
  async function login(username, password) {
    const result = await loginRequest(username, password)
    setSessionToken(result.data.token)
    currentUser.value = result.data.user
  }
  async function register(fields) {
    const result = await registerRequest(fields)
    setSessionToken(result.data.token)
    currentUser.value = result.data.user
  }
  async function logout() {
    try {
      await logoutRequest()
    } catch {
      // Server unreachable: still log out on this device.
    } finally {
      clearSessionToken()
      currentUser.value = null
    }
  }
  return { currentUser, currentUserId, refresh, login, register, logout }
}
