// The student's own group on the mini-project page. Removing a task (UX audit
// A5) sends every other saved task, because the server replaces the whole
// list. Leaving the group (UX audit A4) is offered only while the work is
// still the group's to change.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import MiniProjectView from '../views/MiniProjectView.vue'
import * as groupsApi from '../services/groupsApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'

const studentId = '507f1f77bcf86cd799439002'
const miniProjectId = '507f1f77bcf86cd799439010'
const groupId = '507f1f77bcf86cd799439020'
const { currentUser } = useCurrentUser()

const tasks = [
  { id: 't1', title: 'Find the loop', ownerId: studentId, status: 'done', evidenceUrl: '' },
  { id: 't2', title: 'Write a test', ownerId: '', status: 'todo', evidenceUrl: '' },
]
function project(groupTasks = tasks, groupFields = {}) {
  return {
    data: {
      id: miniProjectId,
      classroomId: '507f1f77bcf86cd799439003',
      title: 'Counter app',
      brief: 'Fix the counter.',
      status: 'published',
      maxGroupSize: 3,
      stageInstructions: {},
      acceptanceCriteria: [],
      rubric: '',
      materials: [],
      groups: [],
      workspaces: [],
      isOwningProfessor: false,
      myGroup: {
        id: groupId,
        name: 'Team A',
        members: [{ id: studentId, displayName: 'Ana' }],
        tasks: groupTasks,
        stageEvidence: {},
        submissionStatus: 'draft',
        reflection: '',
        updatedAt: '2026-11-04T01:00:00.000Z',
        ...groupFields,
      },
    },
  }
}
async function showProject() {
  currentUser.value = { id: studentId, role: 'student', displayName: 'Ana' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/mini-projects/:miniProjectId', name: 'mini-project', component: MiniProjectView },
      { path: '/classrooms/:classroomId', name: 'classroom', component: { template: '<p />' } },
      { path: '/profiles/:userId', name: 'profile', component: { template: '<p />' } },
    ],
  })
  await router.push(`/mini-projects/${miniProjectId}`)
  const wrapper = mount(MiniProjectView, {
    global: { plugins: [router], stubs: { GroupBrowser: true, GitHubRepositoryPanel: true } },
  })
  await flushPromises()
  return wrapper
}
const tasksSection = (wrapper) => wrapper.get('section[aria-labelledby="group-tasks-heading"]')
const removeButton = (wrapper, title) => wrapper.get(`button[aria-label="Remove task: ${title}"]`)

beforeEach(() => {
  vi.spyOn(groupsApi, 'getMiniProject').mockResolvedValue(project())
})
afterEach(() => {
  currentUser.value = null
  vi.restoreAllMocks()
})
enableAutoUnmount(afterEach)

describe('removing a group task (UX audit A5)', () => {
  it('asks first and sends nothing when the student cancels', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const replace = vi.spyOn(groupsApi, 'replaceTasks').mockResolvedValue({})
    const wrapper = await showProject()
    await removeButton(wrapper, 'Write a test').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Remove the task "Write a test"? This can\'t be undone.')
    expect(replace).not.toHaveBeenCalled()
  })

  it('sends every other task with the loaded updatedAt, then reloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const replace = vi.spyOn(groupsApi, 'replaceTasks').mockResolvedValue({})
    const wrapper = await showProject()
    groupsApi.getMiniProject.mockResolvedValue(project([tasks[0]]))
    await removeButton(wrapper, 'Write a test').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith(
      groupId,
      [{ id: 't1', title: 'Find the loop', ownerId: studentId, status: 'done', evidenceUrl: '' }],
      '2026-11-04T01:00:00.000Z',
    )
    expect(tasksSection(wrapper).text()).not.toContain('Write a test')
    expect(wrapper.get('[role="status"]').text()).toBe('Removed the task "Write a test".')
  })

  it('closes the editor when its own task is removed, but keeps another open', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(groupsApi, 'replaceTasks').mockResolvedValue({})
    const wrapper = await showProject()
    const edit = (index) => tasksSection(wrapper).findAll('button')[index * 2]
    await edit(0).trigger('click')
    await removeButton(wrapper, 'Write a test').trigger('click')
    await flushPromises()
    expect(wrapper.find('#task-title').exists()).toBe(true)
    await removeButton(wrapper, 'Find the loop').trigger('click')
    await flushPromises()
    expect(wrapper.find('#task-title').exists()).toBe(false)
  })

  it('keeps the task and says why when the server refuses', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(groupsApi, 'replaceTasks').mockRejectedValue({
      response: {
        status: 403,
        data: { error: { message: 'Only group members can change tasks.' } },
      },
    })
    const wrapper = await showProject()
    await removeButton(wrapper, 'Write a test').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Only group members can change tasks.')
    expect(tasksSection(wrapper).text()).toContain('Write a test')
    expect(removeButton(wrapper, 'Write a test').element.disabled).toBe(false)
  })
})

describe('leaving a group (UX audit A4)', () => {
  const leaveButton = (wrapper) =>
    wrapper.findAll('button').find((button) => button.text() === 'Leave group')
  const twoMembers = {
    members: [
      { id: studentId, displayName: 'Ana' },
      { id: '507f1f77bcf86cd799439009', displayName: 'Ben' },
    ],
  }

  it('offers Leave group only while the work is a draft or returned', async () => {
    for (const [status, shown] of [
      ['draft', true],
      ['returned', true],
      ['submitted', false],
      ['approved', false],
    ]) {
      groupsApi.getMiniProject.mockResolvedValue(project(tasks, { submissionStatus: status }))
      expect(leaveButton(await showProject()) !== undefined).toBe(shown)
    }
  })

  it('warns the last member that the group goes, and sends nothing on cancel', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const leave = vi.spyOn(groupsApi, 'leaveGroup').mockResolvedValue({})
    const wrapper = await showProject()
    await leaveButton(wrapper).trigger('click')
    expect(confirm).toHaveBeenCalledWith(
      'Leave "Team A"? You\'re its only member, so the group and its work will be deleted. This can\'t be undone.',
    )
    expect(leave).not.toHaveBeenCalled()
  })

  it('tells a member with classmates that their tasks stay, then leaves and reloads', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const leave = vi.spyOn(groupsApi, 'leaveGroup').mockResolvedValue({})
    groupsApi.getMiniProject.mockResolvedValue(project(tasks, twoMembers))
    const wrapper = await showProject()
    const left = project()
    left.data.myGroup = null
    groupsApi.getMiniProject.mockResolvedValue(left)
    await leaveButton(wrapper).trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(
      'Leave "Team A"? Your tasks stay with the group without an owner.',
    )
    expect(leave).toHaveBeenCalledWith(groupId)
    expect(wrapper.get('[role="status"]').text()).toBe('You left "Team A".')
    expect(wrapper.find('section[aria-labelledby="group-tasks-heading"]').exists()).toBe(false)
    expect(wrapper.find('#new-group-name').exists()).toBe(true)
  })

  it('keeps the group and says why when the server refuses', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(groupsApi, 'leaveGroup').mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: { message: "Your group's work is with the professor, so you can't leave it now." },
        },
      },
    })
    const wrapper = await showProject()
    await leaveButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain("so you can't leave it now.")
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(tasksSection(wrapper).exists()).toBe(true)
  })
})

// UX audit item 8: a group member reads each instruction under its evidence box,
// so the separate list is not shown to them.
describe('stage instructions for a group member', () => {
  it('moves each instruction under its evidence box and drops the separate list', async () => {
    const withInstructions = project()
    withInstructions.data.stageInstructions = { Diagnose: 'Name the failing input.' }
    groupsApi.getMiniProject.mockResolvedValue(withInstructions)
    const wrapper = await showProject()
    expect(wrapper.find('#stage-instructions-heading').exists()).toBe(false)
    expect(wrapper.get('#stage-instruction-Diagnose').text()).toBe('Name the failing input.')
    expect(wrapper.get('#stage-evidence-Diagnose').attributes('aria-describedby')).toBe(
      'stage-instruction-Diagnose',
    )
    expect(wrapper.find('#stage-instruction-Repair').exists()).toBe(false)
  })
})
