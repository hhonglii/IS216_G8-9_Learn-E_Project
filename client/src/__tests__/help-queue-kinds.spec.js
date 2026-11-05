// Decision H-14: question help and general class help. The ask form, the cards and
// the details panel for each kind, and requests saved before H-14. API mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import HelpQueueView from '../views/HelpQueueView.vue'
import HelpRequestForm from '../components/mentoring/HelpRequestForm.vue'
import { listHelpRequests, withdrawHelpRequest } from '../services/helpRequestsApi.js'
import { getClassroom } from '../services/classroomsApi.js'
import { getChallenge } from '../services/challengesApi.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
vi.mock('../services/helpRequestsApi.js', () => ({
  listHelpRequests: vi.fn(),
  createHelpRequest: vi.fn(),
  claimHelpRequest: vi.fn(),
  respondToHelpRequest: vi.fn(),
  resolveHelpRequest: vi.fn(),
  unclaimHelpRequest: vi.fn(),
  withdrawHelpRequest: vi.fn(),
}))
vi.mock('../services/classroomsApi.js', () => ({ getClassroom: vi.fn() }))
vi.mock('../services/challengesApi.js', () => ({ getChallenge: vi.fn() }))

const classroomId = '507f1f77bcf86cd799439106'
const askerId = '507f1f77bcf86cd799439401'
const { currentUser } = useCurrentUser()

const questionRequest = {
  id: 'r1',
  kind: 'question',
  status: 'open',
  hintType: 'Fault-location clue',
  challengeTitle: 'Loops',
  questionNumber: 2,
  questionPrompt: 'Which line holds the bug?',
  requesterId: askerId,
  requesterName: 'Asha',
  canClaim: false,
}
const generalRequest = {
  id: 'r2',
  kind: 'general',
  status: 'open',
  hintType: 'Concept reminder',
  challengeTitle: undefined,
  questionNumber: null,
  codeSnippet: 'for (let i = 0; i <= n; i++)',
  expectedBehaviour: 'Runs n times.',
  actualBehaviour: 'Runs n + 1 times.',
  requesterId: askerId,
  requesterName: 'Asha',
  canClaim: false,
}
// Saved before H-14: a challenge, no question, and the old reasoning fields.
const oldRequest = {
  id: 'r3',
  kind: 'question',
  status: 'open',
  hintType: 'Guiding question',
  challengeTitle: 'Loops',
  questionNumber: null,
  expectedBehaviour: 'Prints 6.',
  actualBehaviour: 'Prints 3.',
  attemptedReasoning: 'I traced i.',
  suspectedCause: 'The bound.',
  requesterId: askerId,
  requesterName: 'Asha',
  canClaim: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  getClassroom.mockResolvedValue({ data: { challenges: [{ id: 'c1', title: 'Loops' }] } })
  getChallenge.mockResolvedValue({
    data: {
      questions: [
        { id: 'q1', prompt: 'What does it print?' },
        { id: 'q2', prompt: 'Which line holds the bug?' },
      ],
    },
  })
  listHelpRequests.mockResolvedValue({ data: [] })
})
afterEach(() => {
  currentUser.value = null
  vi.restoreAllMocks()
})
enableAutoUnmount(afterEach)

async function showQueue(path = `/classrooms/${classroomId}/help`) {
  currentUser.value = { id: askerId, role: 'student' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/classrooms/:classroomId/help', component: HelpQueueView },
      { path: '/profiles/:userId', name: 'profile', component: { template: '<p />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(HelpQueueView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const cardFor = (wrapper, id) =>
  wrapper.findAll('.le-queue > li').find((item) => item.html().includes(`request-details-${id}`))
async function openRequest(wrapper, index) {
  await wrapper.findAll('.le-queue > li')[index].findAll('button')[0].trigger('click')
  return wrapper.get('.le-details')
}

describe('asking for each kind of help', () => {
  it('starts on question help and shows the form only once a question is chosen', async () => {
    const wrapper = await showQueue()
    expect(wrapper.get('#help-kind-question').element.checked).toBe(true)
    expect(wrapper.find('#question-pick').exists()).toBe(false)
    expect(wrapper.findComponent(HelpRequestForm).exists()).toBe(false)

    await wrapper.get('#challenge-pick').setValue('c1')
    await flushPromises()
    expect(getChallenge).toHaveBeenCalledWith('c1')
    const options = wrapper.findAll('#question-pick option').map((option) => option.text())
    expect(options).toEqual([
      'Choose a question',
      'Question 1: What does it print?',
      'Question 2: Which line holds the bug?',
    ])
    expect(wrapper.findComponent(HelpRequestForm).exists()).toBe(false)

    await wrapper.get('#question-pick').setValue('q2')
    expect(wrapper.get('.le-callout').text()).toContain('Question 2')
    expect(wrapper.get('.le-callout').text()).toContain('Which line holds the bug?')
    const form = wrapper.getComponent(HelpRequestForm)
    expect(form.props()).toMatchObject({ kind: 'question', contextId: 'c1', questionId: 'q2' })
    // UX audit item 17: the asker knows their last wrong answer goes with the request.
    expect(form.text()).toContain('your mentor also sees your last answer')
  })

  it('picks the challenge in the address and loads its questions', async () => {
    const wrapper = await showQueue(`/classrooms/${classroomId}/help?challenge=c1`)
    expect(getChallenge).toHaveBeenCalledWith('c1')
    expect(wrapper.find('#question-pick').exists()).toBe(true)
  })

  it('also picks the question in the address (fifth pass W3)', async () => {
    const wrapper = await showQueue(`/classrooms/${classroomId}/help?challenge=c1&question=q2`)
    expect(wrapper.get('#question-pick').element.value).toBe('q2')
    expect(wrapper.getComponent(HelpRequestForm).props()).toMatchObject({ questionId: 'q2' })
  })

  it('ignores a question in the address that the challenge does not have', async () => {
    const wrapper = await showQueue(`/classrooms/${classroomId}/help?challenge=c1&question=gone`)
    expect(wrapper.get('#question-pick').element.value).toBe('')
    expect(wrapper.findComponent(HelpRequestForm).exists()).toBe(false)
  })

  it('says so when the questions cannot load', async () => {
    getChallenge.mockRejectedValue({ response: { data: { error: { message: 'Nope.' } } } })
    const wrapper = await showQueue()
    await wrapper.get('#challenge-pick').setValue('c1')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Nope.')
    expect(wrapper.find('#question-pick').exists()).toBe(false)
  })

  it('switches to general class help for the classroom, with no challenge to pick', async () => {
    const wrapper = await showQueue()
    await wrapper.get('#help-kind-general').setValue(true)
    expect(wrapper.find('#challenge-pick').exists()).toBe(false)
    const form = wrapper.getComponent(HelpRequestForm)
    expect(form.props()).toMatchObject({ kind: 'general', contextId: classroomId })
    expect(form.findAll('textarea')).toHaveLength(3)
    expect(form.text()).not.toContain('your mentor also sees your last answer')
  })
})

describe('showing each kind of request', () => {
  it('labels the cards by kind and shows the question or what went wrong', async () => {
    listHelpRequests.mockResolvedValue({ data: [questionRequest, generalRequest, oldRequest] })
    const wrapper = await showQueue()
    const cards = wrapper.findAll('.le-queue > li')
    expect(cards[0].get('.le-chip').text()).toContain('Loops · Question 2')
    expect(cards[0].get('.le-request-text').text()).toBe('Which line holds the bug?')
    expect(cards[1].get('.le-chip').text()).toBe('General class help')
    expect(cards[1].get('.le-request-text').text()).toBe('Runs n + 1 times.')
    expect(cards[2].get('.le-chip').text()).not.toContain('Question')
    expect(cards[2].get('.le-request-text').text()).toBe('Prints 3.')
  })

  it('details question help with its question and the hint wanted', async () => {
    listHelpRequests.mockResolvedValue({ data: [questionRequest] })
    const wrapper = await showQueue()
    const details = await openRequest(wrapper, 0)
    expect(wrapper.get('#request-details-r1').text()).toBe('Loops, question 2')
    expect(details.findAll('dt').map((dt) => dt.text())).toEqual(['Question', 'Hint wanted'])
    expect(details.text()).toContain('Which line holds the bug?')
    expect(details.text()).toContain('Fault-location clue')
  })

  it('details general class help with the code and both behaviors', async () => {
    listHelpRequests.mockResolvedValue({ data: [generalRequest] })
    const wrapper = await showQueue()
    const details = await openRequest(wrapper, 0)
    expect(wrapper.get('#request-details-r2').text()).toBe('General class help')
    expect(details.findAll('dt').map((dt) => dt.text())).toEqual([
      'Code',
      'Expected',
      'Actual',
      'Hint wanted',
    ])
    expect(details.get('pre').text()).toBe('for (let i = 0; i <= n; i++)')
  })

  // UX audit items 12 and 17: the challenge's code and the asker's last wrong answer.
  it("shows the asker their last answer and the challenge's code, numbered", async () => {
    listHelpRequests.mockResolvedValue({
      data: [
        {
          ...questionRequest,
          askerAnswer: 'Line 2: total = 0, Wrong variable',
          challengeCode: 'a\nb',
        },
      ],
    })
    const wrapper = await showQueue()
    const details = await openRequest(wrapper, 0)
    expect(details.findAll('dt').map((dt) => dt.text())).toEqual([
      'Question',
      'Your last answer',
      'Challenge code',
      'Hint wanted',
    ])
    expect(details.text()).toContain('Line 2: total = 0, Wrong variable')
    expect(
      details.findAll('pre.le-code-numbered .le-code-line').map((line) => line.text()),
    ).toEqual(['a', 'b'])
  })

  // UX audit item 13: the mentor is told what the hint type means and not to give the answer.
  it('tells the mentor what a good hint of that type is, above the hint box', async () => {
    listHelpRequests.mockResolvedValue({
      data: [
        {
          ...questionRequest,
          status: 'claimed',
          requesterId: '507f1f77bcf86cd799439499',
          mentorId: askerId,
          askerAnswer: 'Line 4: return total',
        },
      ],
    })
    const wrapper = await showQueue()
    const details = await openRequest(wrapper, 0)
    expect(details.findAll('dt').map((dt) => dt.text())).toContain('Their last answer')
    const guide = wrapper.get('#hint-guide').text()
    expect(guide).toContain("Point them in the right direction, but don't give them the answer.")
    expect(guide).toContain(
      "Tell them where to look, such as a line or a function, but not what's wrong there.",
    )
    expect(wrapper.get('#hint').attributes('aria-describedby')).toBe('hint-guide hint-count')
  })

  it('still shows the old reasoning fields on a request from before H-14', async () => {
    listHelpRequests.mockResolvedValue({ data: [oldRequest] })
    const wrapper = await showQueue()
    const details = await openRequest(wrapper, 0)
    expect(wrapper.get('#request-details-r3').text()).toBe('Loops')
    expect(details.findAll('dt').map((dt) => dt.text())).toEqual([
      'Expected',
      'Actual',
      'Tried',
      'Suspected cause',
      'Hint wanted',
    ])
  })

  it.each([
    [questionRequest, 'question 2 of "Loops"'],
    [generalRequest, 'general class help'],
  ])('names what a withdrawn request was about', async (request, topic) => {
    listHelpRequests.mockResolvedValue({ data: [request] })
    withdrawHelpRequest.mockResolvedValue({ data: {} })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await showQueue()
    const withdraw = wrapper.findAll('button').find((b) => b.text() === 'Withdraw request')
    await withdraw.trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(
      `Withdraw your help request about ${topic}? This can't be undone.`,
    )
    expect(wrapper.text()).toContain(`Withdrew your help request about ${topic}.`)
    expect(cardFor(wrapper, request.id)).toBeUndefined()
  })
})
