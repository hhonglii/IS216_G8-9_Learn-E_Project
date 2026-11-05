// Mini-project drafts (H-8): the builder saves a draft with just a title,
// publishes only a complete brief, and the classroom page creates, edits and
// publishes drafts. The API is mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import MiniProjectBuilder from '../components/projects/MiniProjectBuilder.vue'
import ClassroomView from '../views/ClassroomView.vue'
import { getClassroom } from '../services/classroomsApi.js'
import {
  createMiniProject,
  updateMiniProject,
  publishMiniProject,
  getMiniProject,
  deleteMiniProject,
} from '../services/groupsApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
vi.mock('../services/classroomsApi.js', () => ({ getClassroom: vi.fn(), getLeaderboard: vi.fn() }))
vi.mock('../services/groupsApi.js', () => ({
  createMiniProject: vi.fn(),
  updateMiniProject: vi.fn(),
  publishMiniProject: vi.fn(),
  getMiniProject: vi.fn(),
  deleteMiniProject: vi.fn(),
}))

const ownerId = '507f1f77bcf86cd799439001'
const classroomId = '507f1f77bcf86cd799439003'
const draftId = '507f1f77bcf86cd799439010'
const stages = ['Diagnose', 'Repair', 'Extend', 'Verify', 'Reflect']
const { currentUser } = useCurrentUser()

const savedDraft = (fields = {}) => ({
  id: draftId,
  classroomId,
  title: 'Counter app',
  brief: 'Fix the counter.',
  stageInstructions: Object.fromEntries(stages.map((stage) => [stage, `${stage} notes`])),
  acceptanceCriteria: ['Starts at zero', 'Reset works'],
  rubric: 'A working fix.',
  maxGroupSize: 3,
  status: 'draft',
  ...fields,
})

beforeEach(() => {
  vi.resetAllMocks()
  // Publishing asks first with window.confirm; tests answer yes unless they say otherwise.
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  currentUser.value = null
})
enableAutoUnmount(afterEach)

const button = (wrapper, label) => {
  const match = wrapper.findAll('button').find((item) => item.text() === label)
  expect(match, `Missing button: ${label}`).toBeDefined()
  return match
}

describe('mini-project builder', () => {
  it('saves a draft with only a title', async () => {
    const wrapper = mount(MiniProjectBuilder)
    expect(wrapper.get('h3').text()).toBe('New mini-project')
    await wrapper.get('#project-title').setValue('  Counter app ')
    await wrapper.get('form').trigger('submit')
    const [payload] = wrapper.emitted('save')[0]
    expect(payload).toMatchObject({
      title: 'Counter app',
      brief: '',
      acceptanceCriteria: [],
      maxGroupSize: 2,
      starterRepoUrl: '',
      qualifyingChallengeId: '',
    })
  })

  it('lists everything missing at once, outlines it and links to it (UX audit item 4)', async () => {
    const wrapper = mount(MiniProjectBuilder, { attachTo: document.body })
    await wrapper.get('#project-title').setValue('Counter app')
    await wrapper.get('#stage-Repair').setValue('Repair notes')
    await button(wrapper, 'Publish mini-project').trigger('click')
    expect(wrapper.emitted('publish')).toBeUndefined()
    const summary = wrapper.get('.le-error-summary')
    expect(summary.findAll('li').map((item) => item.text())).toEqual([
      'Enter a project brief.',
      'Enter the Diagnose instructions.',
      'Enter the Extend instructions.',
      'Enter the Verify instructions.',
      'Enter the Reflect instructions.',
      'Enter at least one acceptance criterion.',
      'Enter a rubric.',
    ])
    expect(summary.attributes('role')).toBe('alert')
    // It sits just above the buttons, where the person pressed Publish.
    expect(summary.element.nextElementSibling.textContent).toContain('Publish mini-project')
    expect(wrapper.get('#project-brief').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#stage-Diagnose').classes()).toContain('is-invalid')
    expect(wrapper.get('#stage-Repair').classes()).not.toContain('is-invalid')
    expect(wrapper.get('#project-title').attributes('aria-invalid')).toBeUndefined()
    const rubricLink = summary.findAll('a').find((link) => link.text() === 'Enter a rubric.')
    expect(rubricLink.attributes('href')).toBe('#rubric')
    for (const link of summary.findAll('a')) {
      expect(wrapper.find(link.attributes('href')).exists()).toBe(true)
    }
    wrapper.unmount()
  })

  it('outlines and links the fields the server named', async () => {
    const wrapper = mount(MiniProjectBuilder, {
      attachTo: document.body,
      props: {
        problems: [
          {
            message: 'Stage instruction must be a non-empty string.',
            field: 'stageInstructions.Verify',
          },
          { message: 'Try again later.' },
        ],
      },
    })
    await flushPromises()
    const links = wrapper.findAll('.le-error-summary a')
    expect(links.map((link) => link.attributes('href'))).toEqual(['#stage-Verify'])
    expect(wrapper.get('.le-error-summary').text()).toContain('Try again later.')
    expect(wrapper.get('#stage-Verify').attributes('aria-invalid')).toBe('true')
    wrapper.unmount()
  })

  it('fills the form from a saved draft and publishes it whole', async () => {
    const wrapper = mount(MiniProjectBuilder, { props: { draft: savedDraft() } })
    expect(wrapper.get('h3').text()).toBe('Edit draft: Counter app')
    expect(wrapper.get('#acceptance-criterion-0').element.value).toBe('Starts at zero')
    expect(wrapper.get('#acceptance-criterion-1').element.value).toBe('Reset works')
    expect(wrapper.get('#stage-Verify').element.value).toBe('Verify notes')
    await button(wrapper, 'Publish mini-project').trigger('click')
    expect(wrapper.emitted('publish')[0][0]).toMatchObject({
      title: 'Counter app',
      acceptanceCriteria: ['Starts at zero', 'Reset works'],
      maxGroupSize: 3,
    })
  })
})

describe('classroom page mini-project drafts', () => {
  async function openClassroom(miniProjects = []) {
    currentUser.value = { id: ownerId, role: 'professor', displayName: 'Prof Tan' }
    getClassroom.mockResolvedValue({
      data: {
        id: classroomId,
        name: 'Debugging classroom',
        professorId: ownerId,
        joinCode: 'ABC234',
        challenges: [],
        miniProjects,
      },
    })
    const blank = { template: '<p />' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/classrooms/:classroomId', name: 'classroom', component: ClassroomView },
        { path: '/mini-projects/:miniProjectId', name: 'mini-project', component: blank },
        { path: '/challenges/:challengeId', name: 'challenge', component: blank },
        { path: '/classrooms/:classroomId/help', name: 'help-queue', component: blank },
        { path: '/classrooms/:classroomId/review', name: 'professor-review', component: blank },
        { path: '/classrooms/:classroomId/games', name: 'classroom-games', component: blank },
      ],
    })
    await router.push(`/classrooms/${classroomId}`)
    const wrapper = mount(ClassroomView, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const section = (wrapper) =>
    wrapper.get('section[aria-labelledby="classroom-miniprojects-heading"]')

  // Third-pass audit R: the button stays put (so focus does too), and asks
  // before replacing a form that is already open.
  it('keeps New mini-project on the page and asks before starting over', async () => {
    const wrapper = await openClassroom()
    await button(wrapper, 'New mini-project').trigger('click')
    await wrapper.get('#project-title').setValue('Counter app')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await button(wrapper, 'New mini-project').trigger('click')
    expect(confirm).toHaveBeenCalledWith(
      "Start a new mini-project? Anything you haven't saved in the open form is lost.",
    )
    expect(wrapper.get('#project-title').element.value).toBe('Counter app')
    confirm.mockReturnValue(true)
    await button(wrapper, 'New mini-project').trigger('click')
    expect(wrapper.get('#project-title').element.value).toBe('')
    confirm.mockRestore()
  })

  it('creates a draft, keeps the form open, then saves changes to the same draft', async () => {
    createMiniProject.mockResolvedValue({ data: savedDraft({ brief: '' }) })
    updateMiniProject.mockResolvedValue({ data: savedDraft() })
    const wrapper = await openClassroom()
    await button(wrapper, 'New mini-project').trigger('click')
    await wrapper.get('#project-title').setValue('Counter app')
    await button(wrapper, 'Save draft').trigger('click')
    await flushPromises()

    expect(createMiniProject).toHaveBeenCalledWith(
      classroomId,
      expect.objectContaining({ title: 'Counter app' }),
    )
    expect(section(wrapper).text()).toContain(
      "Draft saved. Students can't see it until you publish it.",
    )
    expect(section(wrapper).get('.badge').text()).toBe('Draft')
    expect(wrapper.find('#project-title').exists()).toBe(true)

    await wrapper.get('#project-brief').setValue('Fix the counter.')
    await button(wrapper, 'Save draft').trigger('click')
    await flushPromises()
    expect(createMiniProject).toHaveBeenCalledTimes(1)
    expect(updateMiniProject).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ brief: 'Fix the counter.' }),
    )
  })

  it('opens a saved draft, saves it and publishes it, then closes the form', async () => {
    getMiniProject.mockResolvedValue({ data: savedDraft() })
    updateMiniProject.mockResolvedValue({ data: savedDraft() })
    publishMiniProject.mockResolvedValue({ data: savedDraft({ status: 'published' }) })
    const wrapper = await openClassroom([{ id: draftId, title: 'Counter app', status: 'draft' }])

    await wrapper.get(`button[aria-label="Edit draft: Counter app"]`).trigger('click')
    await flushPromises()
    expect(getMiniProject).toHaveBeenCalledWith(draftId)
    expect(wrapper.get('#project-brief').element.value).toBe('Fix the counter.')

    await button(wrapper, 'Publish mini-project').trigger('click')
    await flushPromises()
    expect(updateMiniProject).toHaveBeenCalledBefore(publishMiniProject)
    expect(publishMiniProject).toHaveBeenCalledWith(draftId)
    expect(wrapper.find('#project-title').exists()).toBe(false)
    expect(section(wrapper).text()).toContain('Mini-project published. Students can now see it.')
    expect(section(wrapper).get('.badge').text()).toBe('Published')
    expect(section(wrapper).find('button[aria-label="Edit draft: Counter app"]').exists()).toBe(
      false,
    )
  })

  it('keeps the form and lists the server problems when publishing fails', async () => {
    getMiniProject.mockResolvedValue({ data: savedDraft() })
    updateMiniProject.mockResolvedValue({ data: savedDraft() })
    publishMiniProject.mockRejectedValue({
      response: {
        data: {
          error: {
            details: [
              {
                field: 'qualifyingChallengeId',
                message: 'Qualifying challenge must be a published challenge',
              },
            ],
          },
        },
      },
    })
    const wrapper = await openClassroom([{ id: draftId, title: 'Counter app', status: 'draft' }])
    await wrapper.get(`button[aria-label="Edit draft: Counter app"]`).trigger('click')
    await flushPromises()
    await button(wrapper, 'Publish mini-project').trigger('click')
    await flushPromises()
    expect(wrapper.find('#project-title').exists()).toBe(true)
    expect(section(wrapper).text()).toContain('Qualifying challenge must be a published challenge')
    expect(section(wrapper).get('.badge').text()).toBe('Draft')
  })

  describe('deleting a draft (heuristic 3, user control and freedom)', () => {
    afterEach(() => vi.restoreAllMocks())
    const published = savedDraft({
      id: '507f1f77bcf86cd799439011',
      title: 'Live app',
      status: 'published',
    })

    it('asks first and keeps the draft when the professor cancels', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const wrapper = await openClassroom([savedDraft()])
      await button(wrapper, 'Delete draft').trigger('click')
      expect(confirm).toHaveBeenCalledWith('Delete the draft "Counter app"? This can\'t be undone.')
      expect(deleteMiniProject).not.toHaveBeenCalled()
      expect(section(wrapper).text()).toContain('Counter app')
    })

    it('removes the draft, closes its open form and keeps published ones', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      getMiniProject.mockResolvedValue({ data: savedDraft() })
      deleteMiniProject.mockResolvedValue()
      const wrapper = await openClassroom([savedDraft(), published])
      await button(wrapper, 'Edit draft').trigger('click')
      await flushPromises()
      expect(wrapper.find('#project-title').exists()).toBe(true)
      await button(wrapper, 'Delete draft').trigger('click')
      await flushPromises()
      expect(deleteMiniProject).toHaveBeenCalledWith(draftId)
      expect(wrapper.find('#project-title').exists()).toBe(false)
      const items = section(wrapper)
        .findAll('li')
        .map((item) => item.text())
      expect(items).toEqual([expect.stringContaining('Live app')])
      expect(section(wrapper).get('[role="status"]').text()).toBe(
        'Deleted the draft "Counter app".',
      )
    })

    it('keeps the draft and says why when the server refuses', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      deleteMiniProject.mockRejectedValue({ response: { status: 500 } })
      const wrapper = await openClassroom([savedDraft()])
      await button(wrapper, 'Delete draft').trigger('click')
      await flushPromises()
      expect(section(wrapper).get('[role="alert"]').text()).toContain("Couldn't delete the draft.")
      expect(section(wrapper).text()).toContain('Counter app')
      expect(button(wrapper, 'Delete draft').element.disabled).toBe(false)
    })
  })
})
