// B9c intent tests; wrapper/state checks live in classrooms.spec.js.
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HintDraftSuggestions from '../components/challenges/HintDraftSuggestions.vue'
it('emits edited copies and opt-in use without mutating provided suggestions', async () => {
  const suggestions = ['Trace', 'Compare']
  const wrapper = mount(HintDraftSuggestions, { props: { modelValue: suggestions } })
  await wrapper.get('textarea').setValue('Edited trace')
  expect(suggestions).toEqual(['Trace', 'Compare'])
  expect(wrapper.emitted('update:modelValue')[0]).toEqual([['Edited trace', 'Compare']])
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'Use suggestion 1')
    .trigger('click')
  expect(wrapper.emitted('use-hint')[0]).toEqual(['Trace'])
})
it('disables suggestions during a request', () => {
  const wrapper = mount(HintDraftSuggestions, {
    props: { modelValue: [' ', 'Compare'], busy: true },
  })
  expect(wrapper.findAll('button').every((item) => item.element.disabled)).toBe(true)
  expect(wrapper.get('textarea').element.disabled).toBe(true)
  expect(wrapper.text()).toContain('Suggesting hints')
})
it('shows disclosure, an error and retry intent', async () => {
  const wrapper = mount(HintDraftSuggestions, {
    props: { error: 'Hint suggestions are not set up.' },
  })
  expect(wrapper.text()).toContain('Google Gemini')
  expect(wrapper.get('[role="alert"]').text()).toBe('Hint suggestions are not set up.')
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'Try again')
    .trigger('click')
  expect(wrapper.emitted('suggest')).toHaveLength(1)
})
it('renders suggestion markup as editable text', () => {
  const wrapper = mount(HintDraftSuggestions, { props: { modelValue: ['<img src=x>', 'Compare'] } })
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.get('textarea').element.value).toBe('<img src=x>')
})
