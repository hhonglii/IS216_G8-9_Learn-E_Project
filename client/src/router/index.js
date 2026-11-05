// Learn-E routes: one entry per page, loaded on demand. Every page except the
// login page needs a session token, so the guard below sends anyone without one
// to /login and remembers where they were going.
import { createRouter, createWebHistory } from 'vue-router'
import { getSessionToken } from '@/utils/sessionToken.js'

export const routes = [
  { path: '/', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
  {
    path: '/take-a-break',
    name: 'take-a-break',
    component: () => import('../views/TakeABreakView.vue'),
  },
  {
    path: '/classrooms/:classroomId',
    name: 'classroom',
    component: () => import('../views/ClassroomView.vue'),
    meta: { section: 'challenges' },
  },
  {
    path: '/challenges/:challengeId',
    name: 'challenge',
    component: () => import('../views/ChallengeView.vue'),
    meta: { section: 'challenges' },
  },
  {
    path: '/classrooms/:classroomId/help',
    name: 'help-queue',
    component: () => import('../views/HelpQueueView.vue'),
    meta: { section: 'help' },
  },
  {
    path: '/classrooms/:classroomId/games',
    name: 'classroom-games',
    component: () => import('../views/ClassroomGamesView.vue'),
    meta: { section: 'games' },
  },
  {
    path: '/mini-projects/:miniProjectId',
    name: 'mini-project',
    component: () => import('../views/MiniProjectView.vue'),
    meta: { section: 'projects' },
  },
  {
    path: '/classrooms/:classroomId/review',
    name: 'professor-review',
    component: () => import('../views/ProfessorReviewView.vue'),
    meta: { section: 'progress' },
  },
  {
    path: '/profiles/:userId',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { section: 'progress' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
  },
]

// A new page starts at the top; Back and Forward return to where the reader was.
// An #id link on the same page has already been followed by the browser, so the
// router leaves the scroll alone instead of jumping back to the top.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!getSessionToken()) return { name: 'login', query: { redirect: to.fullPath } }
})

export default router
