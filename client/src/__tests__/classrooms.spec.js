// Challenge-list/page tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ClassroomView from '../views/ClassroomView.vue'
import {
  getClassroom,
  getLeaderboard,
  leaveClassroom,
  deleteClassroom,
} from '../services/classroomsApi.js'
import {
  createChallenge,
  getChallenge,
  updateChallenge,
  publishChallenge,
  draftHints,
  draftChallengeContent,
  deleteChallenge,
} from '../services/challengesApi.js'
import { getClassroomGame } from '../services/classroomGamesApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'

vi.mock('../services/classroomsApi.js', () => ({
  getClassroom: vi.fn(),
  getLeaderboard: vi.fn(),
  leaveClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
}))
vi.mock('../services/classroomGamesApi.js', () => ({ getClassroomGame: vi.fn() }))
vi.mock('../services/challengesApi.js', () => ({
  getChallenge: vi.fn(),
  createChallenge: vi.fn(),
  updateChallenge: vi.fn(),
  publishChallenge: vi.fn(),
  draftHints: vi.fn(),
  draftChallengeContent: vi.fn(),
  deleteChallenge: vi.fn(),
}))

const ownerId = '507f1f77bcf86cd799439001'
const memberId = '507f1f77bcf86cd799439002'
const classroomId = '507f1f77bcf86cd799439003'
const draftId = '507f1f77bcf86cd799439004'
const publishedId = '507f1f77bcf86cd799439005'
const secondDraftId = '507f1f77bcf86cd799439006'
const otherClassroomId = '507f1f77bcf86cd799439007'
// G16 Step 9: the page follows the logged-in user. Setting currentUser is what
// login, logout and refresh do, so it stands in for logging in as someone else.
const { currentUser } = useCurrentUser()
function logIn(id) {
  currentUser.value = id
    ? {
        id,
        username: 'someone',
        displayName: 'Someone',
        role: id === ownerId ? 'professor' : 'student',
      }
    : null
}
const summaries = [
  { id: draftId, title: 'Loop draft', status: 'draft' },
  { id: publishedId, title: 'Published practice', status: 'published' },
]
function classroomReply(challenges = summaries, owner = true, id = classroomId) {
  return {
    data: {
      id,
      name: 'Debugging classroom',
      description: 'Practice together',
      professorId: ownerId,
      ...(owner ? { joinCode: 'ABC234' } : {}),
      challenges,
      miniProjects: [],
    },
  }
}
function draftReply(id = draftId, title = 'Loop draft') {
  return {
    data: {
      id,
      classroomId,
      title,
      status: 'draft',
      language: 'JavaScript',
      objective: 'Find the faulty loop',
      prompt: 'Saved draft prompt',
      codeSnippet: 'let count = 1;',
      questions: [
        {
          id: '507f1f77bcf86cd799439021',
          type: 'predict-output',
          prompt: 'Saved block',
          options: [{ id: 'a', label: 'One' }],
          acceptedAnswer: 'a',
          explanation: 'Saved explanation',
        },
      ],
    },
  }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
const mounted = []
async function openClassroom() {
  const emptyPage = { template: '<p>Destination</p>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: emptyPage },
      { path: '/classrooms/:classroomId', name: 'classroom', component: ClassroomView },
      { path: '/challenges/:challengeId', name: 'challenge', component: emptyPage },
      { path: '/classrooms/:classroomId/help', name: 'help-queue', component: emptyPage },
      { path: '/classrooms/:classroomId/review', name: 'professor-review', component: emptyPage },
      { path: '/classrooms/:classroomId/games', name: 'classroom-games', component: emptyPage },
    ],
  })
  await router.push(`/classrooms/${classroomId}`)
  const wrapper = mount(ClassroomView, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, router }
}
function button(wrapper, label) {
  const match = wrapper.findAll('button').find((item) => item.text() === label)
  expect(match, `Missing button: ${label}`).toBeDefined()
  return match
}
// The summary beside a Create button links to each field that needs filling in.
function summaryLink(wrapper, href) {
  return wrapper.find(`.le-error-summary a[href="${href}"]`)
}
async function enterRequiredMetadata(wrapper) {
  await wrapper.get('#draft-language').setValue('JavaScript')
  await wrapper.get('#draft-objective').setValue('Find the faulty loop')
}
beforeEach(() => {
  vi.resetAllMocks()
  // Publishing asks first with window.confirm; tests answer yes unless they say otherwise.
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  logIn(ownerId)
  getClassroom.mockResolvedValue(classroomReply())
  getLeaderboard.mockResolvedValue({ data: [] })
  getChallenge.mockResolvedValue(draftReply())
  getClassroomGame.mockResolvedValue({ data: { viewer: 'professor', game: null } })
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  logIn(null)
})

describe('classroom challenge summaries', () => {
  it('shows owner draft/published summaries and opens only drafts', async () => {
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(getClassroom).toHaveBeenCalledWith(classroomId)
    const list = wrapper.get('section[aria-labelledby="classroom-challenges-heading"]')
    expect(list.text()).toContain('Loop draft')
    expect(list.text()).toContain('Draft')
    expect(list.text()).toContain('Published practice')
    expect(list.text()).toContain('Published')
    expect(list.findAll('button').filter((item) => item.text() === 'Open draft')).toHaveLength(1)
    expect(getChallenge).not.toHaveBeenCalled()
  })

  it('links student summaries to the real challenge route and hides owner controls', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(
      classroomReply([{ id: publishedId, title: 'Published practice' }], false),
    )
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    const list = wrapper.get('section[aria-labelledby="classroom-challenges-heading"]')
    expect(list.get('a').attributes('href')).toBe(`/challenges/${publishedId}`)
    expect(list.text()).not.toContain('Loop draft')
    expect(list.text()).not.toContain('Open draft')
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    await list.get('a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('challenge')
    expect(router.currentRoute.value.params.challengeId).toBe(publishedId)
    expect(getChallenge).not.toHaveBeenCalled()
  })

  it('shows each student their own progress on every challenge (UX audit item 11)', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(
      classroomReply(
        [
          {
            id: publishedId,
            title: 'Published practice',
            progress: { answered: 1, total: 2, reviewStatus: 'not-submitted' },
          },
          {
            id: 'done-challenge',
            title: 'Finished one',
            progress: { answered: 3, total: 3, reviewStatus: 'approved' },
          },
        ],
        false,
      ),
    )
    const { wrapper } = await openClassroom()
    await flushPromises()
    const rows = wrapper
      .get('section[aria-labelledby="classroom-challenges-heading"]')
      .findAll('li')
    expect(rows[0].text()).toContain('1 of 2 questions · No diagnosis sent yet.')
    expect(rows[0].get('.le-progress span').attributes('style')).toContain('width: 50%')
    expect(rows[1].text()).toContain('3 of 3 questions · Approved, challenge is complete.')
    // A list of rows doesn't announce itself; only the challenge page's bar is live.
    expect(rows[0].find('[role="status"]').exists()).toBe(false)
  })

  it('shows the owning professor no progress bars', async () => {
    const { wrapper } = await openClassroom()
    await flushPromises()
    const list = wrapper.get('section[aria-labelledby="classroom-challenges-heading"]')
    expect(list.find('.le-progress').exists()).toBe(false)
  })

  it.each([
    [true, 'No challenges yet.'],
    [false, 'No published challenges yet.'],
  ])('shows an empty list for owner=%s', async (owner, message) => {
    logIn(owner ? ownerId : memberId)
    getClassroom.mockResolvedValue(classroomReply([], owner))
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(wrapper.text()).toContain(message)
  })

  it('escapes a challenge title instead of rendering its markup', async () => {
    getClassroom.mockResolvedValue(
      classroomReply([{ ...summaries[0], title: '<img src=x onerror=alert(1)>' }]),
    )
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows loading and permits retry after a classroom error', async () => {
    const pending = deferred()
    getClassroom.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    expect(wrapper.get('[role="status"]').text()).toContain('Loading')
    pending.reject({ response: { data: { error: { message: 'Classroom unavailable' } } } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load this classroom')
    expect(wrapper.find('#classroom-challenges-heading').exists()).toBe(false)
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Loop draft')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('refreshes summaries from the server', async () => {
    getClassroom.mockResolvedValueOnce(classroomReply([]))
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(wrapper.text()).toContain('No challenges yet.')
    await button(wrapper, 'Refresh challenges').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Loop draft')
    expect(getClassroom).toHaveBeenCalledTimes(2)
  })
})

describe('opening a saved professor draft', () => {
  it('loads B8 data into the authoring area with loading and close controls', async () => {
    const pending = deferred()
    getChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    expect(getChallenge).toHaveBeenCalledWith(draftId)
    expect(wrapper.get('#challenge-authoring').text()).toContain('Opening draft')
    pending.resolve(draftReply())
    await flushPromises()
    const area = wrapper.get('#challenge-authoring')
    expect(area.get('#draft-prompt').element.value).toBe('Saved draft prompt')
    expect(area.get('#draft-codeSnippet').element.value).toBe('let count = 1;')
    expect(wrapper.get('a[href="#challenge-authoring"]').text()).toBe('Go to the editor')
    await button(wrapper, 'Close draft').trigger('click')
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
  })

  it('keeps the list usable after a failed draft request and allows another try', async () => {
    getChallenge.mockRejectedValueOnce({
      response: { data: { error: { message: 'Cannot open this draft' } } },
    })
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    expect(wrapper.get('#challenge-authoring [role="alert"]').text()).toContain(
      'Could not load this draft',
    )
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-prompt').element.value).toBe('Saved draft prompt')
    expect(wrapper.find('#challenge-authoring [role="alert"]').exists()).toBe(false)
  })

  it.each([{ status: 'published' }, { classroomId: otherClassroomId }])(
    'rejects a stale or unrelated draft response %j',
    async (change) => {
      getChallenge.mockResolvedValueOnce({ data: { ...draftReply().data, ...change } })
      const { wrapper } = await openClassroom()
      await flushPromises()
      await button(wrapper, 'Open draft').trigger('click')
      await flushPromises()
      expect(wrapper.get('#challenge-authoring [role="alert"]').text()).toContain(
        'Refresh the challenge list',
      )
      expect(wrapper.get('#challenge-authoring').text()).not.toContain('Saved draft prompt')
    },
  )

  it('prevents a late response from replacing a more recently opened draft', async () => {
    const first = deferred()
    getClassroom.mockResolvedValue(
      classroomReply([summaries[0], { id: secondDraftId, title: 'Second draft', status: 'draft' }]),
    )
    getChallenge
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(draftReply(secondDraftId, 'Second draft'))
    const { wrapper } = await openClassroom()
    await flushPromises()
    const controls = wrapper.findAll('button').filter((item) => item.text() === 'Open draft')
    await controls[0].trigger('click')
    await controls[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-title').element.value).toBe('Second draft')
    first.resolve(draftReply(draftId, 'Late first draft'))
    await flushPromises()
    expect(wrapper.get('#draft-title').element.value).toBe('Second draft')
  })

  it('clears owner drafts when the logged-in user changes and ignores a late owner response', async () => {
    const pending = deferred()
    getChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    logIn(memberId)
    getClassroom.mockResolvedValue(
      classroomReply([{ id: publishedId, title: 'Published practice' }], false),
    )
    await flushPromises()
    pending.resolve(draftReply())
    await flushPromises()
    expect(getClassroom).toHaveBeenLastCalledWith(classroomId)
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Loop draft')
    expect(wrapper.text()).not.toContain('Open draft')
  })

  it('rejects an old classroom response after moving away and back to the same route id', async () => {
    const old = deferred()
    const current = classroomReply([])
    current.data.name = 'Current classroom'
    getClassroom
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(classroomReply([], true, otherClassroomId))
      .mockResolvedValueOnce(current)
    const { wrapper, router } = await openClassroom()
    await router.push(`/classrooms/${otherClassroomId}`)
    await flushPromises()
    await router.push(`/classrooms/${classroomId}`)
    await flushPromises()
    const obsolete = classroomReply()
    obsolete.data.name = 'Obsolete classroom'
    old.resolve(obsolete)
    await flushPromises()
    expect(wrapper.text()).toContain('Current classroom')
    expect(wrapper.text()).not.toContain('Obsolete classroom')
    expect(wrapper.text()).not.toContain('Loop draft')
  })
})

describe('draft editor save state', () => {
  it('creates from the working copy, adopts real block ids and adds a summary only on success', async () => {
    const pending = deferred()
    createChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await wrapper.get('#draft-title').setValue('Typed draft')
    await enterRequiredMetadata(wrapper)
    await button(wrapper, 'Add question').trigger('click')
    const key = wrapper.get('[data-block-id]').attributes('data-block-id')
    expect(key).toMatch(/^new-block-/)
    await wrapper.get('form').trigger('submit')
    expect(createChallenge).toHaveBeenCalledTimes(1)
    // Two arguments only: the session token, not an id, says who is creating it.
    expect(createChallenge.mock.calls[0]).toHaveLength(2)
    const [target, payload] = createChallenge.mock.calls[0]
    expect(target).toBe(classroomId)
    expect(payload.title).toBe('Typed draft')
    expect(payload.questions[0]).not.toHaveProperty('id')
    expect(payload.questions[0]).not.toHaveProperty('order')
    expect(wrapper.get('form > fieldset').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'New challenge').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Close draft').attributes('disabled')).toBeDefined()
    // A second submit while saving does not create another record.
    await wrapper.get('form').trigger('submit')
    expect(createChallenge).toHaveBeenCalledTimes(1)
    const saved = draftReply(secondDraftId, 'Typed draft')
    pending.resolve(saved)
    await flushPromises()
    expect(wrapper.get('[data-testid="last-saved-title"]').text()).toContain('Typed draft')
    expect(wrapper.get('[data-block-id]').attributes('data-block-id')).toBe(
      saved.data.questions[0].id,
    )
    expect(wrapper.get('section[aria-labelledby="classroom-challenges-heading"]').text()).toContain(
      'Typed draft',
    )
    expect(wrapper.text()).toContain('Draft saved.')
    expect(updateChallenge).not.toHaveBeenCalled()
  })

  it('puts the save status just under the Save button, where the professor is looking (fifth pass W2)', async () => {
    createChallenge.mockResolvedValueOnce(draftReply(secondDraftId, 'Typed draft'))
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    const unsaved = button(wrapper, 'Save draft').element.nextElementSibling
    expect(unsaved.getAttribute('role')).toBe('status')
    expect(unsaved.textContent.trim()).toBe('This draft has not been saved yet.')
    await wrapper.get('#draft-title').setValue('Typed draft')
    await enterRequiredMetadata(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const saved = button(wrapper, 'Save changes').element.nextElementSibling
    expect(saved.getAttribute('role')).toBe('status')
    expect(saved.textContent.trim()).toBe('Draft saved.')
  })

  it('keeps a failed new draft and retries creation without treating it as saved', async () => {
    createChallenge.mockRejectedValueOnce({
      response: { data: { error: { message: 'Validation failed' } } },
    })
    createChallenge.mockResolvedValueOnce(draftReply(secondDraftId, 'Retry draft'))
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await wrapper.get('#draft-title').setValue('Retry draft')
    await enterRequiredMetadata(wrapper)
    await wrapper.get('#draft-applied-case').setValue('Keep my case')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#draft-title').element.value).toBe('Retry draft')
    expect(wrapper.get('#draft-applied-case').element.value).toBe('Keep my case')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save the draft')
    expect(wrapper.find('[data-testid="last-saved-title"]').exists()).toBe(false)
    expect(
      wrapper.get('section[aria-labelledby="classroom-challenges-heading"]').text(),
    ).not.toContain('Retry draft')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(createChallenge).toHaveBeenCalledTimes(2)
    expect(updateChallenge).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Draft saved.')
  })

  it('keeps nested typing and saved data separate when an update fails', async () => {
    const original = draftReply()
    getChallenge.mockResolvedValue(original)
    updateChallenge.mockRejectedValueOnce({
      response: { data: { error: { message: 'Draft update failed.' } } },
    })
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await wrapper.get('#draft-title').setValue('Unsaved title')
    await wrapper.get('[data-block-id] textarea').setValue('Unsaved block prompt')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(updateChallenge).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        title: 'Unsaved title',
        questions: [
          expect.objectContaining({
            id: original.data.questions[0].id,
            prompt: 'Unsaved block prompt',
          }),
        ],
      }),
    )
    expect(wrapper.get('#draft-title').element.value).toBe('Unsaved title')
    expect(wrapper.get('[data-block-id] textarea').element.value).toBe('Unsaved block prompt')
    expect(wrapper.get('[data-testid="last-saved-title"]').text()).toContain('Loop draft')
    expect(original.data.title).toBe('Loop draft')
    expect(original.data.questions[0].prompt).toBe('Saved block')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save the draft')
    expect(wrapper.text()).toContain('Unsaved changes.')
    expect(
      wrapper.get('section[aria-labelledby="classroom-challenges-heading"]').text(),
    ).not.toContain('Unsaved title')
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-title').element.value).toBe('Loop draft')
    expect(wrapper.get('[data-block-id] textarea').element.value).toBe('Saved block')
  })

  it('adopts a successful update DTO and refreshes the existing summary without duplication', async () => {
    // API responses are mocked here; server HTTP/live tests verify actual persistence.
    updateChallenge.mockResolvedValueOnce(draftReply(draftId, 'Server title'))
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await wrapper.get('#draft-title').setValue('Typed title')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#draft-title').element.value).toBe('Server title')
    expect(wrapper.get('[data-testid="last-saved-title"]').text()).toContain('Server title')
    expect(wrapper.findAll('li.list-group-item')).toHaveLength(2)
    expect(wrapper.get('section[aria-labelledby="classroom-challenges-heading"]').text()).toContain(
      'Server title',
    )
    expect(wrapper.text()).toContain('Draft saved.')
    // Third-pass audit K: one save line, not "Draft saved." and "All changes saved." together.
    expect(wrapper.text()).not.toContain('All changes saved.')
    expect(createChallenge).not.toHaveBeenCalled()
  })

  it('shows a network failure while preserving all form values', async () => {
    createChallenge.mockRejectedValueOnce(new Error('Network Error'))
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await wrapper.get('#draft-title').setValue('Offline draft')
    await enterRequiredMetadata(wrapper)
    await wrapper.get('#draft-codeSnippet').setValue('const kept = true;')
    await button(wrapper, 'Add hint').trigger('click')
    await wrapper.get('#draft-hint-0').setValue('Kept hint')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Your edits have been kept.')
    expect(wrapper.get('#draft-title').element.value).toBe('Offline draft')
    expect(wrapper.get('#draft-codeSnippet').element.value).toBe('const kept = true;')
    expect(wrapper.get('#draft-hint-0').element.value).toBe('Kept hint')
  })

  it('ignores a save response after changing classroom routes', async () => {
    const pending = deferred()
    createChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await wrapper.get('#draft-title').setValue('Old classroom draft')
    await enterRequiredMetadata(wrapper)
    await wrapper.get('form').trigger('submit')
    getClassroom.mockResolvedValueOnce(classroomReply([], true, otherClassroomId))
    await router.push(`/classrooms/${otherClassroomId}`)
    await flushPromises()
    pending.resolve(draftReply(secondDraftId, 'Old classroom draft'))
    await flushPromises()
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Old classroom draft')
    expect(wrapper.text()).toContain('No challenges yet.')
  })

  it('hides the editor and ignores an owner save response after logging in as a student', async () => {
    const pending = deferred()
    createChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await wrapper.get('#draft-title').setValue('Owner only')
    await enterRequiredMetadata(wrapper)
    await wrapper.get('form').trigger('submit')
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply([], false))
    await flushPromises()
    pending.resolve(draftReply(secondDraftId, 'Owner only'))
    await flushPromises()
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('New challenge')
    expect(wrapper.text()).not.toContain('Owner only')
  })
})

describe('publishing a saved draft', () => {
  // Third-pass audit S: publishing can't be undone, so it asks first.
  it('asks before publishing and publishes nothing when the professor cancels', async () => {
    window.confirm.mockReturnValue(false)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await button(wrapper, 'Publish challenge').trigger('click')
    await flushPromises()
    expect(window.confirm).toHaveBeenCalledWith(
      `Publish "Loop draft"? Students can start it straight away, and you can't edit it after that.`,
    )
    expect(publishChallenge).not.toHaveBeenCalled()
  })

  it('displays all publication problems without losing working or saved data', async () => {
    publishChallenge.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: 'Challenge is incomplete or invalid for publication.',
            details: [
              { field: 'language', message: 'Non-empty text is required to publish.' },
              {
                field: 'progressiveHints',
                message: 'At least two non-empty hints are required to publish.',
              },
            ],
          },
        },
      },
    })
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await button(wrapper, 'Publish challenge').trigger('click')
    await flushPromises()
    expect(publishChallenge).toHaveBeenCalledWith(draftId)
    expect(wrapper.get('[aria-label="Publication problems"]').text()).toContain('Language')
    expect(wrapper.get('[aria-label="Publication problems"]').text()).toContain('Progressive hints')
    expect(wrapper.get('#draft-title').element.value).toBe('Loop draft')
    expect(wrapper.get('[data-testid="last-saved-title"]').text()).toContain('Loop draft')
    expect(button(wrapper, 'Publish challenge').attributes('disabled')).toBeUndefined()
  })
  it('requires unsaved changes to be saved before publication', async () => {
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await wrapper.get('#draft-title').setValue('Typed title')
    expect(button(wrapper, 'Publish challenge').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Publish challenge').trigger('click')
    expect(publishChallenge).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Save your changes before publishing.')
  })
  it('adopts the published DTO, updates the list, locks the form and prevents duplicate publication', async () => {
    const pending = deferred()
    publishChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await button(wrapper, 'Publish challenge').trigger('click')
    expect(wrapper.text()).toContain('Publishing challenge')
    expect(button(wrapper, 'Close draft').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Publish challenge').trigger('click')
    expect(publishChallenge).toHaveBeenCalledTimes(1)
    pending.resolve({ data: { ...draftReply().data, status: 'published' } })
    await flushPromises()
    expect(wrapper.get('#challenge-editor-heading').text()).toBe('Published challenge')
    expect(wrapper.get('form > fieldset').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Challenge published.')
    expect(button(wrapper, 'Close challenge')).toBeDefined()
    expect(wrapper.findAll('button').some((item) => item.text() === 'Save changes')).toBe(false)
    expect(wrapper.findAll('button').some((item) => item.text() === 'Open draft')).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(updateChallenge).not.toHaveBeenCalled()
    expect(wrapper.findAll('li.list-group-item')).toHaveLength(2)
  })
  it('retains the saved draft on a network failure', async () => {
    publishChallenge.mockRejectedValueOnce(new Error('Network Error'))
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await button(wrapper, 'Publish challenge').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not confirm publication')
    expect(wrapper.get('#draft-title').element.value).toBe('Loop draft')
    expect(wrapper.get('form > fieldset').attributes('disabled')).toBeUndefined()
  })
  it('ignores a publication response after changing classroom routes', async () => {
    const pending = deferred()
    publishChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await button(wrapper, 'Publish challenge').trigger('click')
    getClassroom.mockResolvedValueOnce(classroomReply([], true, otherClassroomId))
    await router.push(`/classrooms/${otherClassroomId}`)
    await flushPromises()
    pending.resolve({ data: { ...draftReply().data, status: 'published' } })
    await flushPromises()
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Challenge published.')
  })
  it('hides publication and ignores a late owner response after logging in as a student', async () => {
    const pending = deferred()
    publishChallenge.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await button(wrapper, 'Publish challenge').trigger('click')
    logIn(memberId)
    getClassroom.mockResolvedValueOnce(classroomReply([], false))
    await flushPromises()
    pending.resolve({ data: { ...draftReply().data, status: 'published' } })
    await flushPromises()
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Challenge published.')
  })
})

describe('Gemini generation from the current Vue draft', () => {
  async function openNewDraft() {
    const context = await openClassroom()
    await flushPromises()
    await button(context.wrapper, 'New challenge').trigger('click')
    return context
  }
  async function enterMetadata(wrapper) {
    await wrapper.get('#draft-title').setValue('Loop boundary')
    await enterRequiredMetadata(wrapper)
  }
  const contentReply = (field, content) => ({ data: { field, content } })

  it('generates all four content fields consecutively without saving the draft', async () => {
    draftChallengeContent
      .mockResolvedValueOnce(contentReply('prompt', 'Predict the final count.'))
      .mockResolvedValueOnce(contentReply('codeSnippet', 'let count = 0;\ncount += 2;'))
      .mockResolvedValueOnce(contentReply('explanation', 'The final count is two.'))
      .mockResolvedValueOnce(
        contentReply('appliedCasePrompt', 'Use the counter to track arrivals.'),
      )
    const { wrapper } = await openNewDraft()
    await enterMetadata(wrapper)
    await button(wrapper, 'Create challenge prompt').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-prompt').element.value).toBe('Predict the final count.')
    expect(draftChallengeContent).toHaveBeenNthCalledWith(
      1,
      classroomId,
      'prompt',
      expect.objectContaining({
        title: 'Loop boundary',
        language: 'JavaScript',
        objective: 'Find the faulty loop',
      }),
      ownerId,
    )
    await button(wrapper, 'Create code').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-codeSnippet').element.value).toBe('let count = 0;\ncount += 2;')
    expect(draftChallengeContent.mock.calls[1][2].prompt).toBe('Predict the final count.')
    await button(wrapper, 'Create explanation').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-explanation').element.value).toBe('The final count is two.')
    expect(draftChallengeContent.mock.calls[2][2]).toEqual(
      expect.objectContaining({
        prompt: 'Predict the final count.',
        codeSnippet: 'let count = 0;\ncount += 2;',
      }),
    )
    await wrapper.get('#draft-codeSnippet').setValue('let count = 0;\ncount += 4;')
    await button(wrapper, 'Create applied-case prompt').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-applied-case').element.value).toBe(
      'Use the counter to track arrivals.',
    )
    expect(draftChallengeContent.mock.calls[3]).toEqual([
      classroomId,
      'appliedCasePrompt',
      {
        title: 'Loop boundary',
        language: 'JavaScript',
        objective: 'Find the faulty loop',
        prompt: 'Predict the final count.',
        codeSnippet: 'let count = 0;\ncount += 4;',
      },
      ownerId,
    ])
    expect(wrapper.get('#draft-prompt').element.value).toBe('Predict the final count.')
    expect(wrapper.get('#draft-explanation').element.value).toBe('The final count is two.')
    expect(createChallenge).not.toHaveBeenCalled()
    expect(updateChallenge).not.toHaveBeenCalled()
    expect(publishChallenge).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('This draft has not been saved yet.')
    expect(wrapper.find('[data-testid="last-saved-title"]').exists()).toBe(false)
  })

  it('uses current unsaved edits rather than the saved DTO and fills only the requested field', async () => {
    draftChallengeContent.mockResolvedValueOnce(
      contentReply('explanation', 'Generated explanation'),
    )
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await wrapper.get('#draft-title').setValue('Current title')
    await wrapper.get('#draft-language').setValue('Python')
    await wrapper.get('#draft-objective').setValue('Current objective')
    await wrapper.get('#draft-prompt').setValue('Current prompt')
    await wrapper.get('#draft-codeSnippet').setValue('print(3)')
    await wrapper.get('[data-block-id] textarea').setValue('Keep this structured question')
    await button(wrapper, 'Create explanation').trigger('click')
    await flushPromises()
    expect(draftChallengeContent).toHaveBeenCalledWith(
      classroomId,
      'explanation',
      expect.objectContaining({
        title: 'Current title',
        language: 'Python',
        objective: 'Current objective',
        prompt: 'Current prompt',
        codeSnippet: 'print(3)',
      }),
      ownerId,
    )
    expect(wrapper.get('#draft-title').element.value).toBe('Current title')
    expect(wrapper.get('#draft-prompt').element.value).toBe('Current prompt')
    expect(wrapper.get('#draft-codeSnippet').element.value).toBe('print(3)')
    expect(wrapper.get('[data-block-id] textarea').element.value).toBe(
      'Keep this structured question',
    )
    expect(wrapper.get('#draft-explanation').element.value).toBe('Generated explanation')
    expect(wrapper.get('[data-testid="last-saved-title"]').text()).toContain('Loop draft')
    expect(wrapper.text()).toContain('Unsaved changes.')
    expect(updateChallenge).not.toHaveBeenCalled()
  })

  it('marks the three metadata fields required and reports every missing field before generation', async () => {
    const { wrapper } = await openNewDraft()
    for (const field of ['title', 'language', 'objective']) {
      expect(wrapper.get(`#draft-${field}`).attributes('required')).toBeDefined()
    }
    await button(wrapper, 'Create challenge prompt').trigger('click')
    await flushPromises()
    for (const label of ['Challenge title', 'Language', 'Learning objective']) {
      expect(wrapper.text()).toContain(`${label} above is required`)
    }
    for (const field of ['title', 'language', 'objective']) {
      expect(wrapper.get(`#draft-${field}`).attributes('aria-invalid')).toBe('true')
    }
    expect(summaryLink(wrapper, '#draft-title').exists()).toBe(true)
    expect(draftChallengeContent).not.toHaveBeenCalled()
  })

  it.each([
    ['title', 'Challenge title'],
    ['language', 'Language'],
    ['objective', 'Learning objective'],
  ])(
    'rejects whitespace in %s and clears its inline error after correction',
    async (field, label) => {
      const { wrapper } = await openNewDraft()
      await enterMetadata(wrapper)
      await wrapper.get(`#draft-${field}`).setValue(' \n ')
      await button(wrapper, 'Create challenge prompt').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain(`${label} above is required`)
      expect(wrapper.get(`#draft-${field}`).attributes('aria-invalid')).toBe('true')
      expect(summaryLink(wrapper, `#draft-${field}`).exists()).toBe(true)
      expect(draftChallengeContent).not.toHaveBeenCalled()
      await wrapper.get(`#draft-${field}`).setValue('Corrected field')
      expect(wrapper.get(`#draft-${field}`).attributes('aria-invalid')).not.toBe('true')
      expect(wrapper.text()).not.toContain(`${label} above is required`)
    },
  )

  it('requires the prompt before creating code and the code before creating later content', async () => {
    const { wrapper } = await openNewDraft()
    await enterMetadata(wrapper)
    await wrapper.get('#draft-prompt').setValue('   ')
    await button(wrapper, 'Create code').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Challenge prompt above is required before creating code.')
    expect(summaryLink(wrapper, '#draft-prompt').exists()).toBe(true)
    await wrapper.get('#draft-prompt').setValue('Predict this output.')
    await wrapper.get('#draft-codeSnippet').setValue(' \n ')
    await button(wrapper, 'Create explanation').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(
      'Code snippet above is required before creating the explanation.',
    )
    expect(summaryLink(wrapper, '#draft-codeSnippet').exists()).toBe(true)
    await button(wrapper, 'Create applied-case prompt').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(
      'Code snippet above is required before creating the applied-case prompt.',
    )
    expect(summaryLink(wrapper, '#draft-codeSnippet').exists()).toBe(true)
    expect(draftChallengeContent).not.toHaveBeenCalled()
  })

  it('keeps an applied case after failure, retries from current code, and saves only its nested field', async () => {
    draftChallengeContent
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(contentReply('appliedCasePrompt', 'Diagnose the arrival counter.'))
    updateChallenge.mockResolvedValueOnce({
      data: {
        ...draftReply().data,
        appliedCase: { prompt: 'Diagnose the arrival counter.' },
      },
    })
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await wrapper.get('#draft-prompt').setValue('Keep this main prompt')
    await wrapper.get('#draft-codeSnippet').setValue('console.log(3)')
    await wrapper.get('#draft-explanation').setValue('Keep this official explanation')
    await wrapper.get('[data-block-id] textarea').setValue('Keep this structured question')
    await wrapper.get('#draft-applied-case').setValue('Keep this applied case on failure')
    await button(wrapper, 'Create applied-case prompt').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-applied-case').element.value).toBe(
      'Keep this applied case on failure',
    )
    expect(wrapper.get('#challenge-authoring [role="alert"]').text()).toMatch(/could not/i)
    expect(updateChallenge).not.toHaveBeenCalled()
    await wrapper.get('#draft-codeSnippet').setValue('console.log(4)')
    await button(wrapper, 'Create applied-case prompt').trigger('click')
    await flushPromises()
    expect(draftChallengeContent).toHaveBeenLastCalledWith(
      classroomId,
      'appliedCasePrompt',
      {
        title: 'Loop draft',
        language: 'JavaScript',
        objective: 'Find the faulty loop',
        prompt: 'Keep this main prompt',
        codeSnippet: 'console.log(4)',
      },
      ownerId,
    )
    expect(wrapper.get('#draft-applied-case').element.value).toBe('Diagnose the arrival counter.')
    expect(wrapper.get('#draft-prompt').element.value).toBe('Keep this main prompt')
    expect(wrapper.get('#draft-explanation').element.value).toBe('Keep this official explanation')
    expect(wrapper.get('[data-block-id] textarea').element.value).toBe(
      'Keep this structured question',
    )
    expect(updateChallenge).not.toHaveBeenCalled()
    await button(wrapper, 'Save changes').trigger('click')
    await flushPromises()
    const payload = updateChallenge.mock.calls[0][1]
    expect(payload.appliedCase).toEqual({ prompt: 'Diagnose the arrival counter.' })
    expect(payload).not.toHaveProperty('appliedCasePrompt')
    expect(payload.prompt).toBe('Keep this main prompt')
    expect(payload.explanation).toBe('Keep this official explanation')
    expect(payload.questions[0].prompt).toBe('Keep this structured question')
  })

  it.each([
    ['title', 'Challenge title', 200],
    ['objective', 'Learning objective', 2000],
  ])(
    'asks to shorten an overlong %s before making a Gemini request',
    async (field, label, limit) => {
      const { wrapper } = await openNewDraft()
      await enterMetadata(wrapper)
      await wrapper.get(`#draft-${field}`).setValue('x'.repeat(limit + 1))
      await button(wrapper, 'Create challenge prompt').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain(`${label} is too long. Use ${limit} characters or fewer`)
      expect(wrapper.get(`#draft-${field}`).attributes('aria-invalid')).toBe('true')
      expect(summaryLink(wrapper, `#draft-${field}`).exists()).toBe(true)
      expect(draftChallengeContent).not.toHaveBeenCalled()
    },
  )

  it('locks editing and competing actions while generation is pending, then restores them', async () => {
    const pending = deferred()
    draftChallengeContent.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    await button(wrapper, 'Create challenge prompt').trigger('click')
    expect(wrapper.get('form > fieldset').attributes('disabled')).toBeDefined()
    for (const label of [
      'Create challenge prompt',
      'Create code',
      'Create explanation',
      'Create applied-case prompt',
      'Save changes',
      'Publish challenge',
      'Close draft',
      'New challenge',
      'Refresh challenges',
      'Open draft',
    ]) {
      expect(button(wrapper, label).element.matches(':disabled')).toBe(true)
    }
    await button(wrapper, 'Create code').trigger('click')
    await button(wrapper, 'Close draft').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(draftChallengeContent).toHaveBeenCalledTimes(1)
    expect(updateChallenge).not.toHaveBeenCalled()
    pending.resolve(contentReply('prompt', 'New prompt'))
    await flushPromises()
    expect(wrapper.get('form > fieldset').attributes('disabled')).toBeUndefined()
    expect(button(wrapper, 'Create code').element.matches(':disabled')).toBe(false)
    expect(button(wrapper, 'Close draft').element.disabled).toBe(false)
    expect(wrapper.get('#draft-prompt').element.value).toBe('New prompt')
  })

  it.each([
    new Error('Network Error'),
    {
      response: {
        data: { error: { code: 'CONTENT_DRAFTS_UNAVAILABLE', message: 'secret provider info' } },
      },
    },
  ])('keeps existing content on a generation failure and permits retry', async (failure) => {
    draftChallengeContent
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(contentReply('prompt', 'Recovered prompt'))
    const { wrapper } = await openNewDraft()
    await enterMetadata(wrapper)
    await wrapper.get('#draft-prompt').setValue('Keep my current prompt')
    await button(wrapper, 'Create challenge prompt').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-prompt').element.value).toBe('Keep my current prompt')
    expect(wrapper.get('#challenge-authoring [role="alert"]').text()).toMatch(
      /could not|unavailable|try again|not set up/i,
    )
    expect(wrapper.text()).not.toContain('secret provider info')
    expect(wrapper.get('form > fieldset').attributes('disabled')).toBeUndefined()
    await button(wrapper, 'Create challenge prompt').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-prompt').element.value).toBe('Recovered prompt')
    expect(draftChallengeContent).toHaveBeenCalledTimes(2)
  })

  it.each([
    contentReply('prompt', '  '),
    contentReply('codeSnippet', 'Mismatched response'),
    { data: {} },
  ])('rejects an invalid generation result without replacing existing text', async (reply) => {
    draftChallengeContent.mockResolvedValueOnce(reply)
    const { wrapper } = await openNewDraft()
    await enterMetadata(wrapper)
    await wrapper.get('#draft-prompt').setValue('Keep my current prompt')
    await button(wrapper, 'Create challenge prompt').trigger('click')
    await flushPromises()
    expect(wrapper.get('#draft-prompt').element.value).toBe('Keep my current prompt')
    expect(wrapper.find('#challenge-authoring [role="alert"]').exists()).toBe(true)
  })

  it('discards a late generation result after moving away and back to the same classroom', async () => {
    const pending = deferred()
    draftChallengeContent.mockReturnValueOnce(pending.promise)
    const { wrapper, router } = await openNewDraft()
    await enterMetadata(wrapper)
    await button(wrapper, 'Create challenge prompt').trigger('click')
    getClassroom.mockResolvedValueOnce(classroomReply([], true, otherClassroomId))
    await router.push(`/classrooms/${otherClassroomId}`)
    await flushPromises()
    getClassroom.mockResolvedValueOnce(classroomReply())
    await router.push(`/classrooms/${classroomId}`)
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await wrapper.get('#draft-prompt').setValue('Current classroom work')
    pending.resolve(contentReply('prompt', 'Obsolete generated prompt'))
    await flushPromises()
    expect(wrapper.get('#draft-prompt').element.value).toBe('Current classroom work')
    expect(wrapper.text()).not.toContain('Obsolete generated prompt')
  })

  it('discards a generation result if the logged-in professor changes while the request runs', async () => {
    const pending = deferred()
    draftChallengeContent.mockReturnValueOnce(pending.promise)
    const { wrapper } = await openNewDraft()
    await enterMetadata(wrapper)
    await button(wrapper, 'Create challenge prompt').trigger('click')
    logIn(memberId)
    getClassroom.mockResolvedValueOnce(classroomReply([], false))
    await flushPromises()
    pending.resolve(contentReply('prompt', 'Owner-only generated prompt'))
    await flushPromises()
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Owner-only generated prompt')
    expect(getClassroom).toHaveBeenLastCalledWith(classroomId)
  })
})

describe('B9c saved-draft hint suggestions', () => {
  async function openHints() {
    getChallenge.mockResolvedValue({
      data: { ...draftReply().data, progressiveHints: ['Existing hint'] },
    })
    const context = await openClassroom()
    await flushPromises()
    await button(context.wrapper, 'Open draft').trigger('click')
    await flushPromises()
    return context
  }
  const panel = (wrapper) => wrapper.get('section[aria-label="Hint suggestions"]')

  it('keeps suggestions separate, permits edits and saves only explicitly chosen hints', async () => {
    draftHints.mockResolvedValue({ data: { hints: [' Trace the loop ', 'Compare the boundary'] } })
    const { wrapper } = await openHints()
    await wrapper.get('#draft-hint-0').setValue('Typed existing hint')
    await button(wrapper, 'Suggest hints').trigger('click')
    await flushPromises()
    expect(draftHints).toHaveBeenCalledWith(draftId)
    expect(
      panel(wrapper)
        .findAll('textarea')
        .map((item) => item.element.value),
    ).toEqual(['Trace the loop', 'Compare the boundary'])
    expect(wrapper.get('#draft-hint-0').element.value).toBe('Typed existing hint')
    // Hints start with two rows, so the second is an empty placeholder.
    expect(wrapper.get('#draft-hint-1').element.value).toBe('')
    expect(updateChallenge).not.toHaveBeenCalled()
    await panel(wrapper).get('textarea').setValue('Edited trace hint')
    await button(wrapper, 'Use suggestion 1').trigger('click')
    expect(wrapper.get('#draft-hint-1').element.value).toBe('Edited trace hint')
    updateChallenge.mockImplementation((id, payload) =>
      Promise.resolve({ data: { ...draftReply().data, ...payload } }),
    )
    await button(wrapper, 'Save changes').trigger('click')
    await flushPromises()
    expect(updateChallenge.mock.calls[0][1].progressiveHints).toEqual([
      'Typed existing hint',
      'Edited trace hint',
    ])
    expect(panel(wrapper).findAll('textarea')).toHaveLength(0)
    expect(wrapper.text()).toContain('Draft saved.')
  })

  it.each([
    [
      'HINT_DRAFTS_UNAVAILABLE',
      'Do not show this upstream message',
      'Hint suggestions are not set up.',
    ],
    [
      'HINT_DRAFTS_RATE_LIMITED',
      'Hint suggestions are busy. Try again later.',
      'Hint suggestions are busy. Wait a moment, then try again.',
    ],
    [
      'HINT_DRAFTS_FAILED',
      'Hint suggestions failed. Try again.',
      'Could not generate hint suggestions. Try again, or add hints manually.',
    ],
  ])('keeps typed hints after %s and allows retry', async (code, message, shown) => {
    draftHints
      .mockRejectedValueOnce({ response: { data: { error: { code, message } } } })
      .mockResolvedValueOnce({ data: { hints: ['Trace', 'Compare'] } })
    const { wrapper } = await openHints()
    await wrapper.get('#draft-hint-0').setValue('Keep my hint')
    await button(wrapper, 'Suggest hints').trigger('click')
    await flushPromises()
    expect(panel(wrapper).get('[role="alert"]').text()).toBe(shown)
    expect(wrapper.get('#draft-hint-0').element.value).toBe('Keep my hint')
    expect(wrapper.get('#draft-title').element.disabled).toBe(false)
    expect(button(wrapper, 'Save changes').element.matches(':disabled')).toBe(false)
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(draftHints).toHaveBeenCalledTimes(2)
    expect(panel(wrapper).findAll('textarea')).toHaveLength(2)
    expect(wrapper.get('#draft-hint-0').element.value).toBe('Keep my hint')
  })

  it('keeps previous editable suggestions and typed hints after a failed re-request', async () => {
    draftHints
      .mockResolvedValueOnce({ data: { hints: ['Trace', 'Compare'] } })
      .mockRejectedValueOnce(new Error('network'))
    const { wrapper } = await openHints()
    await button(wrapper, 'Suggest hints').trigger('click')
    await flushPromises()
    await panel(wrapper).get('textarea').setValue('Keep edited suggestion')
    await button(wrapper, 'Suggest hints').trigger('click')
    await flushPromises()
    expect(panel(wrapper).get('[role="alert"]').text()).toBe(
      'Could not reach the server for hint suggestions. Check your connection and try again, or add hints manually.',
    )
    expect(panel(wrapper).get('textarea').element.value).toBe('Keep edited suggestion')
    expect(wrapper.get('#draft-hint-0').element.value).toBe('Existing hint')
  })

  it.each([[], ['one'], ['a', 'b', 'c', 'd'], ['a', ' '], ['a', null]])(
    'rejects malformed suggestions %j without touching typed hints',
    async (hints) => {
      draftHints.mockResolvedValue({ data: { hints } })
      const { wrapper } = await openHints()
      await button(wrapper, 'Suggest hints').trigger('click')
      await flushPromises()
      expect(panel(wrapper).get('[role="alert"]').text()).toBe(
        'Could not generate hint suggestions. Try again, or add hints manually.',
      )
      expect(wrapper.get('#draft-hint-0').element.value).toBe('Existing hint')
      expect(panel(wrapper).findAll('textarea')).toHaveLength(0)
    },
  )

  it('prevents duplicate requests and saves/publication during generation', async () => {
    const pending = deferred()
    draftHints.mockReturnValue(pending.promise)
    const { wrapper } = await openHints()
    await button(wrapper, 'Suggest hints').trigger('click')
    await button(wrapper, 'Suggest hints').trigger('click')
    expect(draftHints).toHaveBeenCalledTimes(1)
    expect(button(wrapper, 'Save changes').element.matches(':disabled')).toBe(true)
    expect(button(wrapper, 'Publish challenge').element.disabled).toBe(true)
    expect(button(wrapper, 'Close draft').element.disabled).toBe(true)
    pending.resolve({ data: { hints: ['Trace', 'Compare'] } })
    await flushPromises()
    expect(button(wrapper, 'Save changes').element.disabled).toBe(false)
  })

  it('hides suggestions on new unsaved drafts and for students', async () => {
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await flushPromises()
    expect(wrapper.find('section[aria-label="Hint suggestions"]').exists()).toBe(false)
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply([{ id: publishedId, title: 'Published' }], false))
    await flushPromises()
    expect(wrapper.find('section[aria-label="Hint suggestions"]').exists()).toBe(false)
    expect(draftHints).not.toHaveBeenCalled()
  })

  it('hides suggestions after publication', async () => {
    const { wrapper } = await openHints()
    publishChallenge.mockResolvedValue({
      data: { ...draftReply().data, progressiveHints: ['Existing hint'], status: 'published' },
    })
    await button(wrapper, 'Publish challenge').trigger('click')
    await flushPromises()
    expect(wrapper.find('section[aria-label="Hint suggestions"]').exists()).toBe(false)
  })

  it('ignores a hint response after a classroom change', async () => {
    const pending = deferred()
    draftHints.mockReturnValue(pending.promise)
    const { wrapper, router } = await openHints()
    await button(wrapper, 'Suggest hints').trigger('click')
    getClassroom.mockResolvedValue(classroomReply([], true, otherClassroomId))
    await router.push('/classrooms/' + otherClassroomId)
    await flushPromises()
    pending.resolve({ data: { hints: ['Late hint', 'Other late hint'] } })
    await flushPromises()
    expect(wrapper.find('section[aria-label="Hint suggestions"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Late hint')
  })

  it('ignores a hint response after the logged-in user changes', async () => {
    const pending = deferred()
    draftHints.mockReturnValue(pending.promise)
    const { wrapper } = await openHints()
    await button(wrapper, 'Suggest hints').trigger('click')
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply([], false))
    pending.resolve({ data: { hints: ['Late hint', 'Other late hint'] } })
    await flushPromises()
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
  })

  it('clears suggestions when another draft is opened', async () => {
    draftHints.mockResolvedValue({ data: { hints: ['Trace', 'Compare'] } })
    const { wrapper } = await openHints()
    await button(wrapper, 'Suggest hints').trigger('click')
    await flushPromises()
    await button(wrapper, 'Close draft').trigger('click')
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    expect(panel(wrapper).findAll('textarea')).toHaveLength(0)
    expect(wrapper.get('#draft-hint-0').element.value).toBe('Existing hint')
  })
})

describe('clear Phase B validation and recovery messages', () => {
  async function openEditor() {
    const context = await openClassroom()
    await flushPromises()
    await button(context.wrapper, 'Open draft').trigger('click')
    await flushPromises()
    return context.wrapper
  }
  const invalid = (details) => ({
    response: {
      status: 400,
      data: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Challenge input is invalid.',
          details,
        },
      },
    },
  })

  it('explains the reported question explanation error and clears the details on the next save', async () => {
    publishChallenge.mockRejectedValueOnce(
      invalid([
        { field: 'questions.0.explanation', message: 'Non-empty text is required to publish.' },
        { field: 'explanation', message: 'Non-empty text is required to publish.' },
      ]),
    )
    const wrapper = await openEditor()
    await button(wrapper, 'Publish challenge').trigger('click')
    await flushPromises()
    const problems = wrapper.get('[aria-label="Publication problems"]')
    expect(problems.text()).toContain('Question 1: Add a Question explanation')
    expect(problems.text()).toContain('Official explanation')
    expect(problems.text()).not.toContain('questions.0')
    // One alert, by the Publish button, says what to do and lists the fixes.
    const alerts = wrapper.findAll('#challenge-authoring [role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text()).toContain('Your challenge is still a draft.')
    expect(wrapper.get('#draft-title').element.value).toBe('Loop draft')
    updateChallenge.mockResolvedValueOnce(draftReply())
    await wrapper.get('#draft-explanation').setValue('Now explained')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[aria-label="Publication problems"]').exists()).toBe(false)
  })

  it('shows the summary by Publish, outlines the named fields and links each to its field (audit item 4)', async () => {
    publishChallenge.mockRejectedValueOnce(
      invalid([
        { field: 'questions.0.explanation', message: 'Non-empty text is required to publish.' },
        { field: 'appliedCase.prompt', message: 'Non-empty text is required to publish.' },
        { field: 'private.internalPath', message: 'raw' },
      ]),
    )
    const wrapper = await openEditor()
    await button(wrapper, 'Publish challenge').trigger('click')
    await flushPromises()
    const summary = wrapper.get('.le-error-summary')
    expect(summary.attributes('role')).toBe('alert')
    expect(summary.get('h3').text()).toBe('Fix these to publish')
    // It sits with the Publish button, not at the top of the form.
    expect(summary.element.parentElement.textContent).toContain('Publish challenge')
    const block = wrapper.get('[data-block-id]')
    const blockId = block.attributes('data-block-id')
    const explanation = block.get(`#block-${blockId}-explanation`)
    expect(explanation.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#draft-applied-case').classes()).toContain('is-invalid')
    expect(block.get(`#block-${blockId}-prompt`).attributes('aria-invalid')).toBeUndefined()
    // An unknown field is listed as plain text, with no link.
    expect(summary.findAll('a').map((link) => link.attributes('href'))).toEqual([
      `#block-${blockId}-explanation`,
      '#draft-applied-case',
    ])
    expect(summary.text()).toContain('Check the draft content and try again.')
  })

  it('ticks the publish checklist as the draft fills in and links each unticked item', async () => {
    const wrapper = await openEditor()
    const checklist = () => wrapper.get('.le-checklist')
    const todo = () =>
      checklist()
        .findAll('.le-check-todo')
        .map((item) => item.text())
    expect(checklist().text()).toContain('4 of 8 done.')
    expect(todo()).toEqual([
      'To do: Official explanation',
      'To do: Question 1: prompt, two options, the accepted option and an explanation',
      'To do: Applied-case prompt',
      'To do: At least two progressive hints',
    ])
    await wrapper.get('#draft-explanation').setValue('The loop starts at one.')
    await wrapper.get('#draft-hint-0').setValue('Trace the loop')
    await wrapper.get('#draft-hint-1').setValue('Check the start')
    expect(todo()).toEqual([
      'To do: Question 1: prompt, two options, the accepted option and an explanation',
      'To do: Applied-case prompt',
    ])
    const blockId = wrapper.get('[data-block-id]').attributes('data-block-id')
    const links = checklist().findAll('a')
    expect(links.map((link) => link.attributes('href'))).toEqual([
      `#block-${blockId}-prompt`,
      '#draft-applied-case',
    ])
    // Every link lands on a control that is on the page.
    for (const link of links) expect(wrapper.find(link.attributes('href')).exists()).toBe(true)
  })

  it('shows validation details on a failed update and keeps typed content', async () => {
    updateChallenge.mockRejectedValueOnce(
      invalid([
        {
          field: 'questions.0.options.0.label',
          message: 'Option label must be a non-empty string.',
        },
      ]),
    )
    const wrapper = await openEditor()
    await wrapper.get('#draft-prompt').setValue('Keep this problem statement')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[aria-label="Draft problems"]').text()).toContain(
      'Question 1: Enter text for answer option 1',
    )
    expect(wrapper.get('[role="alert"]').text()).toContain('Save changes again')
    expect(wrapper.get('#draft-prompt').element.value).toBe('Keep this problem statement')
    expect(wrapper.get('[data-testid="last-saved-title"]').text()).toContain('Loop draft')
  })

  it('shows creation details with the correct save button name', async () => {
    createChallenge.mockRejectedValueOnce(
      invalid([{ field: 'title', message: 'Title must be a non-empty string.' }]),
    )
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'New challenge').trigger('click')
    await wrapper.get('#draft-title').setValue(' ')
    await enterRequiredMetadata(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[aria-label="Draft problems"]').text()).toBe('Enter a Challenge title.')
    expect(wrapper.get('[role="alert"]').text()).toContain('Save draft again')
    expect(wrapper.get('#draft-title').element.value).toBe(' ')
  })

  it('tells the professor to keep a copy before reopening a conflicting draft', async () => {
    updateChallenge.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: { code: 'CHALLENGE_CONFLICT', message: 'Challenge changed.' } },
      },
    })
    const wrapper = await openEditor()
    await wrapper.get('#draft-title').setValue('Keep my unsaved title')
    await button(wrapper, 'Save changes').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Copy any unsaved edits, reopen the draft',
    )
    expect(wrapper.get('#draft-title').element.value).toBe('Keep my unsaved title')
    expect(wrapper.get('form > fieldset').attributes('disabled')).toBeUndefined()
  })
})

describe('deleting a challenge draft (heuristic 3, user control and freedom)', () => {
  afterEach(() => vi.restoreAllMocks())
  const listText = (wrapper) =>
    wrapper
      .findAll('li')
      .map((item) => item.text())
      .join(' | ')

  it('asks first and keeps the draft when the professor cancels', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Delete draft').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Delete the draft "Loop draft"? This can\'t be undone.')
    expect(deleteChallenge).not.toHaveBeenCalled()
    expect(listText(wrapper)).toContain('Loop draft')
  })

  it('removes the draft from the list and closes it if it was open', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteChallenge.mockResolvedValue()
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    expect(wrapper.find('#challenge-authoring').exists()).toBe(true)
    await button(wrapper, 'Delete draft').trigger('click')
    await flushPromises()
    expect(deleteChallenge).toHaveBeenCalledWith(draftId)
    expect(listText(wrapper)).not.toContain('Loop draft')
    expect(listText(wrapper)).toContain('Published practice')
    expect(wrapper.find('#challenge-authoring').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Deleted the draft "Loop draft".')
  })

  it('keeps the draft and says why when the server refuses', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteChallenge.mockRejectedValue({
      response: { data: { error: { message: 'Published challenges cannot be deleted.' } } },
    })
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Delete draft').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Published challenges cannot be deleted.',
    )
    expect(listText(wrapper)).toContain('Loop draft')
    expect(button(wrapper, 'Delete draft').element.disabled).toBe(false)
  })

  it('offers no delete for published challenges', async () => {
    getClassroom.mockResolvedValue(classroomReply([summaries[1]]))
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(wrapper.findAll('button').some((item) => item.text() === 'Delete draft')).toBe(false)
  })
})

describe('the Boss Battle section (G10, decision H-20)', () => {
  const gameLink = (wrapper, name) => wrapper.findAll('a').find((link) => link.text() === name)
  const section = (wrapper) => wrapper.find('section[aria-labelledby="boss-battle-heading"]')
  const battle = {
    id: 'g1',
    title: 'Week 3',
    bossId: 'off-by-one-golem',
    hearts: 3,
    status: 'draft',
    questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
  }
  const studentBattle = {
    id: 'g1',
    title: 'Week 3',
    bossId: 'off-by-one-golem',
    hearts: 1,
    questionCount: 4,
  }
  const studentReply = (game, extra = {}) => ({
    data: { viewer: 'student', game, play: null, defeated: false, ...extra },
  })
  const asStudentWith = async (reply) => {
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    getClassroomGame.mockResolvedValue(reply)
    const { wrapper } = await openClassroom()
    await flushPromises()
    return wrapper
  }

  it('offers the owning professor Create Boss Battle before any battle exists', async () => {
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(getClassroomGame).toHaveBeenCalledWith(classroomId)
    expect(section(wrapper).find('h2').text()).toBe('Boss Battle')
    expect(section(wrapper).text()).toContain('No Boss Battle yet.')
    expect(section(wrapper).find('img').exists()).toBe(false)
    expect(gameLink(wrapper, 'Create Boss Battle').attributes('href')).toBe(
      `/classrooms/${classroomId}/games`,
    )
    expect(gameLink(wrapper, 'Play the Boss Battle')).toBeUndefined()
  })

  it('shows the owning professor their boss idling and Edit Boss Battle', async () => {
    getClassroomGame.mockResolvedValue({ data: { viewer: 'professor', game: battle } })
    const { wrapper } = await openClassroom()
    await flushPromises()
    const boss = section(wrapper).find('img')
    expect(boss.attributes('alt')).toBe('The Off-By-One Golem')
    expect(boss.classes()).toContain('boss--idle')
    expect(gameLink(wrapper, 'Edit Boss Battle').attributes('href')).toBe(
      `/classrooms/${classroomId}/games`,
    )
    expect(gameLink(wrapper, 'Create Boss Battle')).toBeUndefined()
  })

  it("names the professor's battle, counts its hearts and questions, and says it is a draft", async () => {
    getClassroomGame.mockResolvedValue({ data: { viewer: 'professor', game: battle } })
    const { wrapper } = await openClassroom()
    await flushPromises()
    const text = section(wrapper).text()
    expect(section(wrapper).find('h3').text()).toBe('Week 3')
    expect(text).toContain('The Off-By-One Golem')
    expect(text).toContain('3 hearts · 3 questions')
    expect(text).toContain("Draft. Students can't see it until you publish it.")
    // The hearts picture is decoration; the count beside it says the same thing.
    expect(section(wrapper).find('[aria-hidden="true"] .hearts').findAll('svg.heart')).toHaveLength(
      3,
    )

    getClassroomGame.mockResolvedValue({
      data: { viewer: 'professor', game: { ...battle, status: 'published' } },
    })
    const published = await openClassroom()
    await flushPromises()
    expect(section(published.wrapper).text()).toContain('Published. Your students can play it now.')
  })

  it('still gives the owning professor Edit Boss Battle when the battle cannot be read', async () => {
    getClassroomGame.mockRejectedValue(new Error('offline'))
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(section(wrapper).find('img').exists()).toBe(false)
    expect(gameLink(wrapper, 'Edit Boss Battle').attributes('href')).toBe(
      `/classrooms/${classroomId}/games`,
    )
  })

  it('shows a student the boss and Play while a battle is published', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    getClassroomGame.mockResolvedValue(studentReply(battle))
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(section(wrapper).find('img').attributes('alt')).toBe('The Off-By-One Golem')
    const play = gameLink(wrapper, 'Play the Boss Battle')
    expect(play.attributes('href')).toBe(`/classrooms/${classroomId}/games`)
    // "Play" is what shows; the rest is for screen readers.
    expect(play.find('.visually-hidden').text()).toBe('the Boss Battle')
    expect(gameLink(wrapper, 'Edit Boss Battle')).toBeUndefined()
  })

  it("tells a student the battle's size and how far they got", async () => {
    let wrapper = await asStudentWith(studentReply(studentBattle))
    expect(section(wrapper).find('h3').text()).toBe('Week 3')
    expect(section(wrapper).text()).toContain('1 heart · 4 questions')
    expect(section(wrapper).text()).toContain('Answer every question before your hearts run out.')

    wrapper = await asStudentWith(studentReply(studentBattle, { play: { status: 'in-progress' } }))
    expect(section(wrapper).text()).toContain('You have a battle in progress.')

    wrapper = await asStudentWith(studentReply(studentBattle, { defeated: true }))
    expect(section(wrapper).text()).toContain("You've beaten this boss. Play again any time.")
  })

  it('hides the section from a student when nothing is published or the battle cannot be read', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    getClassroomGame.mockResolvedValue(studentReply(null))
    const first = await openClassroom()
    await flushPromises()
    expect(section(first.wrapper).exists()).toBe(false)

    getClassroomGame.mockRejectedValue(new Error('offline'))
    const second = await openClassroom()
    await flushPromises()
    expect(section(second.wrapper).exists()).toBe(false)
    // The classroom itself still shows.
    expect(second.wrapper.text()).toContain('Debugging classroom')
  })
})

describe('leaving a classroom (UX audit A4)', () => {
  afterEach(() => vi.restoreAllMocks())
  const leaveButton = (wrapper) =>
    wrapper.findAll('button').find((item) => item.text() === 'Leave classroom')

  it('is offered to a student and never to the professor', async () => {
    const professorPage = (await openClassroom()).wrapper
    await flushPromises()
    expect(professorPage.text()).toContain('Debugging classroom')
    expect(leaveButton(professorPage)).toBeUndefined()
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(leaveButton(wrapper)).toBeDefined()
  })

  it('says what leaving keeps and loses, and stays put on cancel', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await leaveButton(wrapper).trigger('click')
    expect(confirm).toHaveBeenCalledWith(
      'Leave "Debugging classroom"? Your contribution points here are removed, and help requests ' +
        'nobody has answered are withdrawn. Your attempts stay, and you can rejoin with the join code. ' +
        "If you're in a mini-project group here, leave the group first.",
    )
    expect(leaveClassroom).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('classroom')
  })

  it('leaves and goes to the dashboard', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    leaveClassroom.mockResolvedValue({ data: { left: true } })
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await leaveButton(wrapper).trigger('click')
    await flushPromises()
    expect(leaveClassroom).toHaveBeenCalledWith(classroomId)
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('stays and shows the reason when the student is still in a group', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const message = 'Leave your mini-project group "Team A" first, then leave the classroom.'
    leaveClassroom.mockRejectedValue({ response: { status: 409, data: { error: { message } } } })
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await leaveButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    expect(router.currentRoute.value.name).toBe('classroom')
    expect(leaveButton(wrapper).element.disabled).toBe(false)
  })
})

describe('deleting a classroom (UX audit A6)', () => {
  afterEach(() => vi.restoreAllMocks())
  const deleteButton = (wrapper) =>
    wrapper.findAll('button').find((item) => item.text() === 'Delete classroom')

  it('is offered to the owning professor only', async () => {
    const owner = (await openClassroom()).wrapper
    await flushPromises()
    expect(deleteButton(owner)).toBeDefined()
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    const student = (await openClassroom()).wrapper
    await flushPromises()
    expect(student.text()).toContain('Debugging classroom')
    expect(deleteButton(student)).toBeUndefined()
  })

  it('names the classroom and what goes with it, and deletes nothing on cancel', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await deleteButton(wrapper).trigger('click')
    expect(confirm).toHaveBeenCalledWith(
      'Delete "Debugging classroom" and everything in it? Its challenges, attempts, ' +
        "mini-projects and their files, groups, help requests and student memberships all go. This can't be undone.",
    )
    expect(deleteClassroom).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('classroom')
  })

  it('deletes and goes to the dashboard', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteClassroom.mockResolvedValue()
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await deleteButton(wrapper).trigger('click')
    await flushPromises()
    expect(deleteClassroom).toHaveBeenCalledWith(classroomId)
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('stays and says why when the delete fails, with the button ready to try again', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteClassroom.mockRejectedValue({ response: { status: 500, data: {} } })
    const { wrapper, router } = await openClassroom()
    await flushPromises()
    await deleteButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.find('.card [role="alert"]').text()).toBe("Couldn't delete the classroom.")
    expect(router.currentRoute.value.name).toBe('classroom')
    expect(deleteButton(wrapper).element.disabled).toBe(false)
  })
})

describe('Language suggestions and example hints (UX audit 29 and 31)', () => {
  async function openDraft() {
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('suggests common languages for Language and still lets any be typed', async () => {
    const wrapper = await openDraft()
    const language = wrapper.get('#draft-language')
    expect(language.attributes('list')).toBe('language-options')
    expect(wrapper.findAll('#language-options option').map((o) => o.attributes('value'))).toEqual([
      'JavaScript',
      'Python',
      'Java',
      'C',
      'C++',
      'C#',
      'TypeScript',
      'PHP',
      'SQL',
    ])
    expect(wrapper.get('#draft-title').attributes('list')).toBeUndefined()
    await language.setValue('Rust')
    expect(language.element.value).toBe('Rust')
  })

  it('gives the challenge prompt and applied case an example the field points to', async () => {
    const wrapper = await openDraft()
    expect(wrapper.get('#draft-prompt-hint').text()).toBe(
      'For example: "averageScore([4, 6, 8]) should return 6, but it returns 4.67."',
    )
    expect(wrapper.get('#draft-prompt').attributes('aria-describedby')).toBe('draft-prompt-hint')
    expect(wrapper.find('#draft-objective-hint').exists()).toBe(false)
    expect(wrapper.get('#draft-objective').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get('#draft-applied-case-hint').text()).toContain(
      'For example: "A shop\'s checkout total leaves out the last item in the cart.',
    )
    expect(wrapper.get('#draft-applied-case').attributes('aria-describedby')).toBe(
      'draft-applied-case-hint',
    )
  })

  it('points at both the hint and the error when the prompt has a problem', async () => {
    const wrapper = await openDraft()
    await wrapper.get('#draft-prompt').setValue('')
    await button(wrapper, 'Create code').trigger('click')
    expect(wrapper.get('#draft-prompt').attributes('aria-describedby')).toBe(
      'draft-prompt-hint draft-prompt-error',
    )
  })
})

describe('copying the join code (UX audit 26)', () => {
  async function copyWith(writeText) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Copy join code').trigger('click')
    await flushPromises()
    return wrapper
  }
  afterEach(() => {
    delete navigator.clipboard
  })

  it('copies the code and says Copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const wrapper = await copyWith(writeText)
    expect(writeText).toHaveBeenCalledWith('ABC234')
    expect(button(wrapper, 'Copied join code').exists()).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toBe('Join code copied.')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('says how to copy by hand when the browser refuses', async () => {
    const wrapper = await copyWith(vi.fn().mockRejectedValue(new Error('denied')))
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Couldn't copy. Select the code and copy it yourself.",
    )
    expect(button(wrapper, 'Copy join code').exists()).toBe(true)
  })

  it('has no Copy button for a student, who is not shown the code', async () => {
    logIn(memberId)
    getClassroom.mockResolvedValue(classroomReply(summaries, false))
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().startsWith('Copy'))).toBe(false)
  })
})

// Decision G-10: the page shows the classroom's own cover.
describe('classroom cover', () => {
  const coverStyle = (wrapper) => wrapper.get('.le-cover--hero .le-cover-art').attributes('style')

  it('shows the cover the professor chose', async () => {
    getClassroom.mockResolvedValue({
      data: { ...classroomReply().data, coverId: 'amber-loop' },
    })
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(coverStyle(wrapper)).toContain('/covers/amber-loop.svg')
    expect(wrapper.get('.le-cover--hero').attributes('aria-hidden')).toBe('true')
  })

  it('falls back to the default cover for a missing or unknown id', async () => {
    getClassroom.mockResolvedValue({ data: { ...classroomReply().data, coverId: 'gone' } })
    const { wrapper } = await openClassroom()
    await flushPromises()
    expect(coverStyle(wrapper)).toContain('/covers/default.svg')
  })
})

// UX audit item 22: the professor sees the draft as a student would.
describe('preview as student', () => {
  async function openPreview() {
    const { wrapper } = await openClassroom()
    await flushPromises()
    await button(wrapper, 'Open draft').trigger('click')
    await flushPromises()
    const toggle = button(wrapper, 'Preview as student')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    return wrapper
  }

  it('renders the draft with the question components students get', async () => {
    const wrapper = await openPreview()
    const preview = wrapper.get('#student-preview')
    expect(preview.get('h4').text()).toBe('Loop draft')
    expect(preview.text()).toContain('Find the faulty loop')
    expect(preview.text()).toContain('Saved draft prompt')
    expect(preview.findAll('.le-code-line').map((line) => line.text())).toEqual(['let count = 1;'])
    expect(preview.text()).toContain('Question 1')
    expect(preview.findAll('select option').map((option) => option.text())).toEqual([
      'Select an option',
      'One',
    ])
    expect(preview.text()).not.toContain('Saved explanation')
  })

  it('takes an answer but saves and marks nothing', async () => {
    const wrapper = await openPreview()
    const preview = wrapper.get('#student-preview')
    await preview.get('select').setValue('a')
    await button(preview, 'Submit answer').trigger('click')
    expect(preview.get('[role="status"]').text()).toBe('Nothing is marked in the preview.')
    expect(updateChallenge).not.toHaveBeenCalled()
    expect(createChallenge).not.toHaveBeenCalled()
    expect(publishChallenge).not.toHaveBeenCalled()
  })

  it('follows unsaved edits and closes with the draft', async () => {
    const wrapper = await openPreview()
    await wrapper.get('#draft-prompt').setValue('Edited prompt')
    expect(wrapper.get('#student-preview').text()).toContain('Edited prompt')
    await button(wrapper, 'Hide student preview').trigger('click')
    expect(wrapper.find('#student-preview').exists()).toBe(false)
    await button(wrapper, 'Preview as student').trigger('click')
    await button(wrapper, 'Close draft').trigger('click')
    await flushPromises()
    expect(wrapper.find('#student-preview').exists()).toBe(false)
  })
})
