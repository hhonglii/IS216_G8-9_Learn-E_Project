// Tests for the locate-fault dropdowns and the "View code snippet" link that
// replaced the snippet copied into every question. The API is mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import LocateFaultQuestion from '../components/challenges/LocateFaultQuestion.vue'
import PredictOutputQuestion from '../components/challenges/PredictOutputQuestion.vue'
import ChallengeView from '../views/ChallengeView.vue'
import { getChallenge } from '../services/challengesApi.js'
vi.mock('../services/challengesApi.js', () => ({
  getChallenge: vi.fn(),
  createAttempt: vi.fn(),
  submitAppliedDiagnosis: vi.fn(),
}))

const snippet = 'def average(scores):\n    total = 0\n    for i in range(1, len(scores)):'
const locate = {
  id: 'q2',
  type: 'locate-fault',
  prompt: 'Which line contains the fault, and what kind of error is it?',
  options: [
    { id: 'line-1', label: 'line 2' },
    { id: 'category-1', label: 'off-by-one' },
    { id: 'line-2', label: 'line 3' },
    { id: 'category-2', label: 'wrong operator' },
  ],
}

beforeEach(() => vi.resetAllMocks())
enableAutoUnmount(afterEach)

describe('locate-fault question', () => {
  const choices = (select) =>
    select.findAll('option').map((option) => [option.attributes('value'), option.text()])

  it('splits the options into a line dropdown and a category dropdown', () => {
    const wrapper = mount(LocateFaultQuestion, { props: { question: locate } })
    const [lines, categories] = wrapper.findAll('select')
    expect(choices(lines)).toEqual([
      ['', 'Select a line'],
      ['line-1', 'line 2'],
      ['line-2', 'line 3'],
    ])
    expect(choices(categories)).toEqual([
      ['', 'Select a category'],
      ['category-1', 'off-by-one'],
      ['category-2', 'wrong operator'],
    ])
    expect(wrapper.find('label[for="' + lines.attributes('id') + '"]').text()).toBe(
      'Line or region',
    )
    expect(wrapper.find('label[for="' + categories.attributes('id') + '"]').text()).toBe(
      'Error category',
    )
  })

  it('emits both chosen ids together, keeping the other half', async () => {
    const wrapper = mount(LocateFaultQuestion, {
      props: { question: locate, modelValue: { location: 'line-2' } },
    })
    await wrapper.findAll('select')[1].setValue('category-1')
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({
      location: 'line-2',
      category: 'category-1',
    })
  })

  it('no longer repeats the code snippet inside a question', () => {
    const question = { ...locate, codeSnippet: snippet }
    expect(mount(LocateFaultQuestion, { props: { question } }).find('pre').exists()).toBe(false)
    const predict = { id: 'q1', type: 'predict-output', options: [], codeSnippet: snippet }
    expect(
      mount(PredictOutputQuestion, { props: { question: predict } })
        .find('pre')
        .exists(),
    ).toBe(false)
  })
})

describe('View code snippet link', () => {
  const challengeId = '507f1f77bcf86cd799439201'
  const blank = { template: '<div />' }

  async function showChallenge(codeSnippet) {
    getChallenge.mockResolvedValue({
      data: {
        id: challengeId,
        classroomId: '507f1f77bcf86cd799439106',
        title: 'Average of exam scores',
        prompt: 'Read the code, then answer each block.',
        codeSnippet,
        questions: [{ id: 'q1', type: 'predict-output', options: [] }, locate],
        attempt: null,
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/challenges/:challengeId', name: 'challenge', component: ChallengeView },
        { path: '/classrooms/:classroomId', name: 'classroom', component: blank },
        { path: '/classrooms/:classroomId/help', name: 'help-queue', component: blank },
      ],
    })
    await router.push(`/challenges/${challengeId}`)
    const wrapper = mount(ChallengeView, {
      attachTo: document.body,
      global: { plugins: [router], stubs: { AppliedCaseForm: true } },
    })
    await flushPromises()
    return wrapper
  }

  const links = (wrapper) =>
    wrapper.findAll('a').filter((link) => link.text().startsWith('View code snippet'))

  it('shows the snippet once and gives each question a link back to it', async () => {
    const wrapper = await showChallenge(snippet)
    expect(wrapper.findAll('pre')).toHaveLength(1)
    expect(links(wrapper).map((link) => link.text())).toEqual([
      'View code snippet for question 1',
      'View code snippet for question 2',
    ])
  })

  // The browser follows the link; tabindex="-1" on the target lets focus land there too.
  it('links to the snippet, which can take focus', async () => {
    const wrapper = await showChallenge(snippet)
    expect(links(wrapper)[1].attributes('href')).toBe('#challenge-code')
    const target = wrapper.get('#challenge-code')
    expect(target.attributes('tabindex')).toBe('-1')
    expect(target.text()).toContain('for i in range(1, len(scores)):')
  })

  it('has no link when the challenge has no snippet', async () => {
    const wrapper = await showChallenge('')
    expect(links(wrapper)).toHaveLength(0)
    expect(wrapper.find('#challenge-code').exists()).toBe(false)
  })
})
