// Mock setup shared by the mini-project, review page and profile browser checks (F6, F7, G8, G7, G6, G9, G16).
// Every /api request is answered here, so no database
// or real GitHub quota is used, and DiceBear avatars get a stand-in picture.
import { expectSentBy, logInAs, user } from './session.js'

export const studentId = '507f1f77bcf86cd799439101'
export const professorId = '507f1f77bcf86cd799439102'
export const miniProjectId = '507f1f77bcf86cd799439103'
export const groupId = '507f1f77bcf86cd799439104'
export const otherGroupId = '507f1f77bcf86cd799439105'
export const starterRepoUrl = 'https://github.com/course/starter'

export const workspace = (id, name, fields = {}) => ({
  id,
  name,
  members: [{ id: studentId, displayName: 'Alice' }],
  tasks: [],
  stageEvidence: { Diagnose: '', Repair: '', Extend: '', Verify: '', Reflect: '' },
  updatedAt: '2026-10-22T08:00:00.000Z',
  repositoryUrl: '',
  github: null,
  lastRefreshedAt: null,
  submissionStatus: 'draft',
  reflection: '',
  professorFeedback: '',
  ...fields,
})

export const project = (fields) => ({
  id: miniProjectId,
  classroomId: '507f1f77bcf86cd799439106',
  title: 'Repair the counter app',
  brief: 'Find and fix the counter bug.',
  starterRepoUrl,
  maxGroupSize: 4,
  stageInstructions: { Diagnose: 'd', Repair: 'r', Extend: 'e', Verify: 'v', Reflect: 'f' },
  acceptanceCriteria: ['Counter starts at zero'],
  rubric: '',
  status: 'published',
  isOwningProfessor: false,
  groups: [{ id: groupId, name: 'Team Rocket', memberIds: [studentId] }],
  myGroup: null,
  workspaces: [],
  ...fields,
})

// Who each id logs in as (G16): GET /api/auth/me answers with this user.
const people = {
  [studentId]: user(studentId, 'Alice'),
  [professorId]: user(professorId, 'Professor Lee', 'professor'),
}

const avatarSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>'

// `state.project` is what Get mini-project returns; tests change it as the
// "server" saves things, the same way the real endpoint would.
export async function prepare(page, userId, state) {
  const githubRequests = []
  const pageErrors = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'api.github.com') githubRequests.push(request.url())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // Registered first, so the specific routes below take priority over it.
  await page.route('**/api/**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { data: [] } })
      : route.fulfill({
          status: 500,
          json: { error: { code: 'UNMOCKED', message: 'Unmocked', details: null } },
        }),
  )
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: { data: { service: 'learn-e-server', status: 'ok', database: 'connected' } },
    }),
  )
  // After the catch-all, so its GET /api/auth/me reply wins.
  await logInAs(page, people[userId] ?? user(userId, 'Test User'))
  await page.route(`**/api/mini-projects/${miniProjectId}`, (route) => {
    expectSentBy(route, userId)
    return route.fulfill({ json: { data: state.project } })
  })
  // Avatars (G9) get a stand-in picture, so no test depends on DiceBear being up.
  // A test that needs DiceBear down registers its own route after this one.
  await page.route('https://api.dicebear.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: avatarSvg }),
  )
  return { githubRequests, pageErrors }
}
