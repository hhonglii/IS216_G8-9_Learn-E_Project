import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../services/api.js'
import { joinClassroom } from '../services/classroomsApi.js'
import { claimHelpRequest } from '../services/helpRequestsApi.js'
import { refreshGroupGitHub } from '../services/githubApi.js'
import { draftHints, draftChallengeContent } from '../services/challengesApi.js'
vi.mock('../services/api.js', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }
})
beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  for (const method of ['get', 'post', 'put'])
    api[method].mockResolvedValue({ data: { data: { id: 'result' } } })
})
// G16 Step 8: the request interceptor in api.js adds the session token, so
// each wrapper sends only its URL, body and any timeout, never an identity.
it('joins with the code body and nothing else', async () => {
  expect(await joinClassroom('CLASS42')).toEqual({ data: { id: 'result' } })
  expect(api.post).toHaveBeenCalledWith('/classrooms/join', { joinCode: 'CLASS42' })
})
it('claims with PUT and an empty body', async () => {
  await claimHelpRequest('request-1')
  expect(api.put).toHaveBeenCalledWith('/help-requests/request-1/claim', {})
})
it('refreshes GitHub through the backend with an empty body', async () => {
  await refreshGroupGitHub('group-1')
  expect(api.post).toHaveBeenCalledWith('/groups/group-1/github/refresh', {})
})
it('asks for hint drafts with an empty body and the longer Gemini timeout', async () => {
  await draftHints('challenge-1')
  expect(api.post).toHaveBeenCalledWith(
    '/challenges/challenge-1/hint-drafts',
    {},
    { timeout: 35000 },
  )
})
it.each([
  ['prompt', ['title', 'language', 'objective']],
  ['codeSnippet', ['title', 'language', 'objective', 'prompt']],
  ['explanation', ['title', 'language', 'objective', 'prompt', 'codeSnippet']],
  ['appliedCasePrompt', ['title', 'language', 'objective', 'prompt', 'codeSnippet']],
])('generates %s using only fields above it in the current draft', async (field, contextFields) => {
  const draft = {
    id: 'saved-challenge',
    title: 'Loop bounds',
    language: 'JavaScript',
    objective: 'Understand an inclusive loop boundary',
    prompt: 'Current unsaved prompt',
    codeSnippet: 'for (let i = 0; i <= 3; i++) console.log(i)',
    explanation: 'Do not send the answer',
    appliedCase: { prompt: 'Do not send the existing applied case' },
    questions: [{ acceptedAnswer: 'Secret', explanation: 'Block answer' }],
    studentId: 'student-private',
    professorId: 'professor-private',
    progressiveHints: ['Unrelated hint'],
  }
  expect(await draftChallengeContent('room/with space', field, draft)).toEqual({
    data: { id: 'result' },
  })
  expect(api.post).toHaveBeenCalledWith(
    '/classrooms/room%2Fwith%20space/challenge-content-drafts',
    {
      field,
      draft: Object.fromEntries(contextFields.map((key) => [key, draft[key]])),
    },
    { timeout: 35000 },
  )
})
it('propagates content generation failure', async () => {
  api.post.mockRejectedValueOnce(new Error('Generation unavailable'))
  await expect(draftChallengeContent('room-1', 'prompt', { title: 'Loops' })).rejects.toThrow(
    'Generation unavailable',
  )
  expect(api.post).toHaveBeenCalledWith(
    '/classrooms/room-1/challenge-content-drafts',
    expect.objectContaining({ field: 'prompt' }),
    { timeout: 35000 },
  )
})
it('propagates failure for the owning view to display', async () => {
  api.put.mockRejectedValue(new Error('Not implemented'))
  await expect(claimHelpRequest('request-1')).rejects.toThrow('Not implemented')
})

it('encodes IDs as one route segment', async () => {
  await claimHelpRequest('request/with space')
  expect(api.put).toHaveBeenCalledWith('/help-requests/request%2Fwith%20space/claim', {})
})

const payload = { title: 'Draft' }
const serviceCases = [
  ['usersApi', 'getProfile', ['target'], 'get', '/users/target/profile'],
  // G16 Step 11: both act on the logged-in user, so neither URL names anyone.
  ['usersApi', 'updateMe', ['Alice Tan'], 'put', '/users/me', { displayName: 'Alice Tan' }],
  [
    'usersApi',
    'changePassword',
    ['old-pass-1', 'new-pass-12'],
    'put',
    '/users/me/password',
    { currentPassword: 'old-pass-1', newPassword: 'new-pass-12' },
  ],
  ['classroomsApi', 'createClassroom', [payload], 'post', '/classrooms', payload],
  ['classroomsApi', 'getClassroom', ['c1'], 'get', '/classrooms/c1'],
  ['classroomsApi', 'getLeaderboard', ['c1'], 'get', '/classrooms/c1/leaderboard'],
  ['classroomsApi', 'getInsights', ['c1'], 'get', '/classrooms/c1/insights'],
  [
    'challengesApi',
    'createChallenge',
    ['c1', payload],
    'post',
    '/classrooms/c1/challenges',
    payload,
  ],
  ['challengesApi', 'updateChallenge', ['q1', payload], 'put', '/challenges/q1', payload],
  ['challengesApi', 'publishChallenge', ['q1'], 'post', '/challenges/q1/publish', {}],
  ['challengesApi', 'getChallenge', ['q1'], 'get', '/challenges/q1'],
  ['challengesApi', 'createAttempt', ['q1', payload], 'post', '/challenges/q1/attempts', payload],
  [
    'challengesApi',
    'submitAppliedDiagnosis',
    ['a1', payload],
    'put',
    '/attempts/a1/applied',
    payload,
  ],
  ['challengesApi', 'reviewAttempt', ['a1', payload], 'put', '/attempts/a1/review', payload],
  ['helpRequestsApi', 'createHelpRequest', [payload], 'post', '/help-requests', payload],
  ['helpRequestsApi', 'listHelpRequests', ['c1'], 'get', '/classrooms/c1/help-requests'],
  [
    'helpRequestsApi',
    'respondToHelpRequest',
    ['r1', 'hint'],
    'put',
    '/help-requests/r1/respond',
    { response: 'hint' },
  ],
  [
    'helpRequestsApi',
    'resolveHelpRequest',
    ['r1', 'helpful'],
    'put',
    '/help-requests/r1/resolve',
    { resolution: 'helpful' },
  ],
  [
    'groupsApi',
    'createMiniProject',
    ['c1', payload],
    'post',
    '/classrooms/c1/mini-projects',
    payload,
  ],
  ['groupsApi', 'updateMiniProject', ['p1', payload], 'put', '/mini-projects/p1', payload],
  ['groupsApi', 'publishMiniProject', ['p1'], 'post', '/mini-projects/p1/publish', {}],
  ['groupsApi', 'getMiniProject', ['p1'], 'get', '/mini-projects/p1'],
  ['groupsApi', 'createGroup', ['p1', payload], 'post', '/mini-projects/p1/groups', payload],
  ['groupsApi', 'joinGroup', ['g1'], 'put', '/groups/g1/join', {}],
  [
    'groupsApi',
    'replaceTasks',
    ['g1', [], 'v1'],
    'put',
    '/groups/g1/tasks',
    { tasks: [], updatedAt: 'v1' },
  ],
  [
    'groupsApi',
    'updateStageEvidence',
    ['g1', { Diagnose: 'Evidence' }],
    'put',
    '/groups/g1/stages',
    { stageEvidence: { Diagnose: 'Evidence' } },
  ],
  [
    'groupsApi',
    'attachRepository',
    ['g1', 'https://github.com/example/repo'],
    'put',
    '/groups/g1/repository',
    { repositoryUrl: 'https://github.com/example/repo' },
  ],
  ['groupsApi', 'submitGroup', ['g1', payload], 'put', '/groups/g1/submit', payload],
  ['groupsApi', 'reviewGroup', ['g1', payload], 'put', '/groups/g1/review', payload],
]
it.each(serviceCases)(
  '%s.%s sends only its URL and body',
  async (module, name, args, method, url, body) => {
    const service = await import(`../services/${module}.js`)
    expect(await service[name](...args)).toEqual({ data: { id: 'result' } })
    const expectedArgs = method === 'get' ? [url] : [url, body]
    expect(api[method]).toHaveBeenCalledWith(...expectedArgs)
  },
)
