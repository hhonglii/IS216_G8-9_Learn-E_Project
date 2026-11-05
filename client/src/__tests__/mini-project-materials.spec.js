// Mini-project materials (H-10): the professor attaches PDFs and zips to a
// saved draft, and the mini-project page lists them to download. The API is
// mocked; the wrappers themselves are checked against a mocked axios instance.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import MiniProjectBuilder from '../components/projects/MiniProjectBuilder.vue'
import ClassroomView from '../views/ClassroomView.vue'
import MiniProjectView from '../views/MiniProjectView.vue'
import { api } from '../services/api.js'
import { getClassroom } from '../services/classroomsApi.js'
import * as groupsApi from '../services/groupsApi.js'
import { formatSize, materialProblem } from '../utils/materials.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'

vi.mock('../services/api.js', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})
vi.mock('../services/classroomsApi.js', () => ({ getClassroom: vi.fn(), getLeaderboard: vi.fn() }))

const ownerId = '507f1f77bcf86cd799439001'
const classroomId = '507f1f77bcf86cd799439003'
const draftId = '507f1f77bcf86cd799439010'
const pdfEntry = {
  id: 'm1',
  name: 'Week 3 brief.pdf',
  size: 245760,
  contentType: 'application/pdf',
}
const { currentUser } = useCurrentUser()

const fileNamed = (name, size = 2048) => {
  const file = new File(['%PDF-'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}
async function pick(input, file) {
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}
const draft = (materials = []) => ({ id: draftId, title: 'Counter app', materials })

beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  currentUser.value = null
  vi.restoreAllMocks()
})
enableAutoUnmount(afterEach)

describe('material wrappers', () => {
  it('uploads the raw file with its encoded name and a longer timeout', async () => {
    api.post.mockResolvedValue({ data: { data: pdfEntry } })
    const file = fileNamed('Week 3 brief.pdf')
    expect(await groupsApi.uploadMaterial('p1', file)).toEqual({ data: pdfEntry })
    expect(api.post).toHaveBeenCalledWith('/mini-projects/p1/materials', file, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': 'Week%203%20brief.pdf',
      },
      timeout: 60000,
    })
  })

  it('downloads a Blob and turns a Blob error back into the server message', async () => {
    const blob = new Blob(['%PDF-'])
    api.get.mockResolvedValueOnce({ data: blob })
    expect(await groupsApi.downloadMaterial('p1', 'm1')).toBe(blob)
    expect(api.get).toHaveBeenCalledWith('/mini-projects/p1/materials/m1', {
      responseType: 'blob',
      timeout: 60000,
    })

    const body = { error: { code: 'MATERIAL_NOT_FOUND', message: 'No file found with that id.' } }
    api.get.mockRejectedValueOnce({
      response: {
        status: 404,
        data: new Blob([JSON.stringify(body)], { type: 'application/json' }),
      },
    })
    await expect(groupsApi.downloadMaterial('p1', 'm1')).rejects.toMatchObject({
      response: { data: body },
    })
  })

  it('deletes with no body', async () => {
    api.delete.mockResolvedValue({ status: 204 })
    await groupsApi.deleteMaterial('p1', 'm1')
    expect(api.delete).toHaveBeenCalledWith('/mini-projects/p1/materials/m1')
  })

  it('checks type and size before sending, and formats sizes', () => {
    expect(materialProblem(fileNamed('brief.PDF'))).toBe('')
    expect(materialProblem(fileNamed('starter.zip'))).toBe('')
    expect(materialProblem(fileNamed('brief.docx'))).toBe('Only PDF and zip files can be uploaded.')
    expect(materialProblem(fileNamed('brief.pdf', 0))).toBe('That file is empty.')
    expect(materialProblem(fileNamed('big.zip', 4 * 1024 * 1024 + 1))).toBe(
      'Files can be up to 4 MB.',
    )
    expect([820, 245760, 3565158].map(formatSize)).toEqual(['820 bytes', '240 KB', '3.4 MB'])
  })
})

describe('builder materials', () => {
  it('asks for a first save before files can be added', () => {
    const wrapper = mount(MiniProjectBuilder)
    expect(wrapper.text()).toContain('Save the draft first, then add files here.')
    expect(wrapper.find('#material-file').exists()).toBe(false)
  })

  it('lists the files, sends a chosen PDF up and asks to remove one', async () => {
    const wrapper = mount(MiniProjectBuilder, { props: { draft: draft([pdfEntry]) } })
    expect(wrapper.get('#materials-heading').text()).toBe('Materials for students (optional)')
    expect(wrapper.text()).toContain('Week 3 brief.pdf')
    expect(wrapper.text()).toContain('240 KB')

    const file = fileNamed('starter.zip')
    await pick(wrapper.get('#material-file'), file)
    expect(wrapper.emitted('upload')[0]).toEqual([file])

    await wrapper.get('button[aria-label="Remove Week 3 brief.pdf"]').trigger('click')
    expect(wrapper.emitted('remove-material')[0]).toEqual([pdfEntry])
  })

  it('refuses a Word file without sending it', async () => {
    const wrapper = mount(MiniProjectBuilder, { props: { draft: draft() } })
    await pick(wrapper.get('#material-file'), fileNamed('brief.docx'))
    expect(wrapper.emitted('upload')).toBeUndefined()
    expect(wrapper.get('#material-file-error').text()).toBe(
      'Only PDF and zip files can be uploaded.',
    )
    expect(wrapper.get('#material-file').attributes('aria-describedby')).toBe('material-file-error')
  })

  it('hides the picker once there are five files', () => {
    const five = Array.from({ length: 5 }, (_, index) => ({ ...pdfEntry, id: `m${index}` }))
    const wrapper = mount(MiniProjectBuilder, { props: { draft: draft(five) } })
    expect(wrapper.find('#material-file').exists()).toBe(false)
    expect(wrapper.text()).toContain('This draft has 5 files. Remove one to add another.')
  })
})

describe('classroom page materials', () => {
  async function openDraft(materials = []) {
    currentUser.value = { id: ownerId, role: 'professor', displayName: 'Prof Tan' }
    getClassroom.mockResolvedValue({
      data: {
        id: classroomId,
        name: 'Debugging classroom',
        professorId: ownerId,
        joinCode: 'ABC234',
        challenges: [],
        miniProjects: [{ id: draftId, title: 'Counter app', status: 'draft' }],
      },
    })
    vi.spyOn(groupsApi, 'getMiniProject').mockResolvedValue({ data: draft(materials) })
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
    await wrapper.get('button[aria-label="Edit draft: Counter app"]').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('uploads a file to the open draft and lists it by the picker', async () => {
    const upload = vi.spyOn(groupsApi, 'uploadMaterial').mockResolvedValue({ data: pdfEntry })
    const wrapper = await openDraft()
    const file = fileNamed('Week 3 brief.pdf')
    await pick(wrapper.get('#material-file'), file)
    await flushPromises()
    expect(upload).toHaveBeenCalledWith(draftId, file)
    expect(wrapper.get('button[aria-label="Remove Week 3 brief.pdf"]').exists()).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toBe('Added Week 3 brief.pdf.')
  })

  it('says a file is too big when the server answers 413', async () => {
    vi.spyOn(groupsApi, 'uploadMaterial').mockRejectedValue({
      response: { status: 413, data: { error: { message: 'Request body is too large.' } } },
    })
    const wrapper = await openDraft()
    await pick(wrapper.get('#material-file'), fileNamed('brief.pdf'))
    await flushPromises()
    expect(wrapper.get('#material-file-error').text()).toBe('Files can be up to 4 MB.')
  })

  it('keeps a file when the professor cancels the confirm (UX audit A7)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const remove = vi.spyOn(groupsApi, 'deleteMaterial').mockResolvedValue()
    const wrapper = await openDraft([pdfEntry])
    await wrapper.get('button[aria-label="Remove Week 3 brief.pdf"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('Remove "Week 3 brief.pdf"? This can\'t be undone.')
    expect(remove).not.toHaveBeenCalled()
    expect(wrapper.find('button[aria-label="Remove Week 3 brief.pdf"]').exists()).toBe(true)
  })

  it('removes a file from the draft', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const remove = vi.spyOn(groupsApi, 'deleteMaterial').mockResolvedValue()
    const wrapper = await openDraft([pdfEntry])
    await wrapper.get('button[aria-label="Remove Week 3 brief.pdf"]').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith(draftId, 'm1')
    expect(wrapper.find('button[aria-label="Remove Week 3 brief.pdf"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Removed Week 3 brief.pdf.')
  })
})

describe('mini-project page materials', () => {
  async function showProject(materials) {
    currentUser.value = { id: '507f1f77bcf86cd799439002', role: 'student', displayName: 'Ana' }
    vi.spyOn(groupsApi, 'getMiniProject').mockResolvedValue({
      data: {
        id: draftId,
        classroomId,
        title: 'Counter app',
        brief: 'Fix the counter.',
        status: 'published',
        maxGroupSize: 2,
        stageInstructions: {},
        acceptanceCriteria: [],
        rubric: '',
        materials,
        groups: [],
        myGroup: null,
        workspaces: [],
        isOwningProfessor: false,
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/mini-projects/:miniProjectId', name: 'mini-project', component: MiniProjectView },
        { path: '/classrooms/:classroomId', name: 'classroom', component: { template: '<p />' } },
      ],
    })
    await router.push(`/mini-projects/${draftId}`)
    const wrapper = mount(MiniProjectView, {
      global: { plugins: [router], stubs: { GroupBrowser: true } },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  it('has no materials list when nothing is attached', async () => {
    const wrapper = await showProject([])
    expect(wrapper.find('#materials-heading').exists()).toBe(false)
  })

  it('downloads a file and hands it to the browser under its own name', async () => {
    const blob = new Blob(['%PDF-'])
    const download = vi.spyOn(groupsApi, 'downloadMaterial').mockResolvedValue(blob)
    URL.createObjectURL = vi.fn(() => 'blob:brief')
    URL.revokeObjectURL = vi.fn()
    let saved
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      saved = { href: this.href, name: this.download }
    })

    const wrapper = await showProject([pdfEntry])
    expect(wrapper.get('#materials-heading').text()).toBe('Materials')
    await wrapper.get('button[aria-label="Download Week 3 brief.pdf"]').trigger('click')
    await flushPromises()
    expect(download).toHaveBeenCalledWith(draftId, 'm1')
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(saved).toEqual({ href: 'blob:brief', name: 'Week 3 brief.pdf' })
  })

  it('shows the server message when a download fails', async () => {
    vi.spyOn(groupsApi, 'downloadMaterial').mockRejectedValue({
      response: { status: 404, data: { error: { message: 'No file found with that id.' } } },
    })
    const wrapper = await showProject([pdfEntry])
    await wrapper.get('button[aria-label="Download Week 3 brief.pdf"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('No file found with that id.')
  })
})
