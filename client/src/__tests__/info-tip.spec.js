// UX audit item 1: the (i) button beside a label shows its text below.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InfoTip from '../components/shared/InfoTip.vue'
import { fieldHelp } from '../config/fieldHelp.js'

describe('InfoTip', () => {
  it('is a named button, closed until pressed', () => {
    const wrapper = mount(InfoTip, { props: { topic: 'rubric' } })
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-label')).toBe('About Rubric')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.le-infotip-text').exists()).toBe(false)
  })

  it('shows the text under the label on one press and hides it on the next', async () => {
    const wrapper = mount(InfoTip, { props: { topic: 'rubric' } })
    const button = wrapper.get('button')
    await button.trigger('click')
    const text = wrapper.get('.le-infotip-text')
    expect(text.text()).toBe(fieldHelp.rubric.text)
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.attributes('aria-controls')).toBe(text.attributes('id'))
    await button.trigger('click')
    expect(wrapper.find('.le-infotip-text').exists()).toBe(false)
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('follows a change of topic', async () => {
    const wrapper = mount(InfoTip, { props: { topic: 'rubric' } })
    await wrapper.get('button').trigger('click')
    await wrapper.setProps({ topic: 'brief' })
    expect(wrapper.get('button').attributes('aria-label')).toBe(`About ${fieldHelp.brief.label}`)
    expect(wrapper.get('.le-infotip-text').text()).toBe(fieldHelp.brief.text)
  })

  it('every entry has a label and some text', () => {
    for (const help of Object.values(fieldHelp)) {
      expect(help.label).toBeTruthy()
      expect(help.text).toBeTruthy()
    }
  })
})
