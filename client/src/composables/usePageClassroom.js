// The classroom the current page belongs to, so the sidebar can show its
// Classroom and Help Queue links on pages whose URL has no classroom id
// (a challenge or a mini-project). Pages set it once they have loaded.
import { ref } from 'vue'

const pageClassroomId = ref('')

export function usePageClassroom() {
  return { pageClassroomId }
}
