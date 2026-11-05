// UX audit item 16: Submit waits until every dropdown has a choice, and the
// hint beside it says which choice is missing.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import QuestionRenderer from '../components/challenges/QuestionRenderer.vue'

const predict = {
  id: 'q1',
  type: 'predict-output',
  prompt: 'What does it print?',
  options: [
    { id: 'a', label: '3' },
    { id: 'b', label: '6' },
  ],
}
const locate = {
  id: 'q2',
  type: 'locate-fault',
  prompt: 'Where is the bug?',
  options: [
    { id: 'line-3', label: 'line 3' },
    { id: 'category-off-by-one', label: 'off-by-one' },
  ],
}
const repair = {
  id: 'q3',
  type: 'repair-order',
  prompt: 'Put the repair in order.',
  options: [
    { id: 's1', label: 'Find the loop' },
    { id: 's2', label: 'Run it again' },
  ],
}

function render(question, answer) {
  return mount(QuestionRenderer, { props: { question, answer } })
}
const submit = (wrapper) =>
  wrapper.findAll('button').find((button) => button.text() === 'Submit answer')
const hintFor = (wrapper) => {
  const id = submit(wrapper).attributes('aria-describedby')
  return id ? wrapper.get(`[id="${id}"]`).text() : ''
}

describe('Submit answer waits for every choice', () => {
  it('waits for a predicted output, then submits it', async () => {
    const wrapper = render(predict, undefined)
    expect(submit(wrapper).element.disabled).toBe(true)
    expect(hintFor(wrapper)).toBe('Choose a predicted output to submit.')

    await wrapper.setProps({ answer: 'b' })
    expect(submit(wrapper).element.disabled).toBe(false)
    expect(submit(wrapper).attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.text()).not.toContain('to submit.')
    await submit(wrapper).trigger('click')
    expect(wrapper.emitted('submit')).toEqual([['b']])
  })

  it('names whichever half of a locate answer is still empty', async () => {
    const wrapper = render(locate, undefined)
    expect(submit(wrapper).element.disabled).toBe(true)
    expect(hintFor(wrapper)).toBe('Choose a line and an error category to submit.')

    await wrapper.setProps({ answer: { location: 'line-3' } })
    expect(submit(wrapper).element.disabled).toBe(true)
    expect(hintFor(wrapper)).toBe('Choose an error category to submit.')

    await wrapper.setProps({ answer: { category: 'category-off-by-one' } })
    expect(hintFor(wrapper)).toBe('Choose a line to submit.')

    await wrapper.setProps({ answer: { location: 'line-3', category: 'category-off-by-one' } })
    expect(submit(wrapper).element.disabled).toBe(false)
    expect(wrapper.text()).not.toContain('to submit.')
  })

  it('never holds back a repair order, which always has every step', () => {
    const wrapper = render(repair, ['s1', 's2'])
    expect(submit(wrapper).element.disabled).toBe(false)
    expect(wrapper.text()).not.toContain('to submit.')
  })
})

// Third-pass audit D: a solved question can't be submitted again.
describe('a solved question', () => {
  it('shows Solved in place of Submit answer', () => {
    const wrapper = mount(QuestionRenderer, {
      props: { question: predict, answer: 'a', solved: true },
    })
    expect(submit(wrapper)).toBeUndefined()
    expect(wrapper.text()).toContain('Solved')
  })
})
