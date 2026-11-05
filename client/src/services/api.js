// Axios supplies HTTP transport, with the base URL and timeout set here.
// The two interceptors (G16): one sends the session token on every
// request, the other ends the session on a 401 INVALID_SESSION or UNAUTHENTICATED reply.
import axios from 'axios'
import { getSessionToken } from '@/utils/sessionToken'

// Shared transport: calling api.post('/classrooms/join', body) uses this base URL.
// The timeout is milliseconds. This object supplies transport defaults, not page state.
// VITE_* configuration is visible in the browser; never put a secret in it.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = getSessionToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let onSessionEnded = () => {}
export function whenSessionEnds(handler) {
  onSessionEnded = handler
}
api.interceptors.response.use(undefined, (error) => {
  if (
    error.response?.status === 401 &&
    (error.response?.data?.error?.code === 'INVALID_SESSION' ||
      error.response?.data?.error?.code === 'UNAUTHENTICATED')
  ) {
    onSessionEnded()
  }
  return Promise.reject(error)
})
