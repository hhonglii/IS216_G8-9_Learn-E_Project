// UX audit item 5: one list editor for every list a professor types.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import ListEditor from '../components/shared/ListEditor.vue'

const mounted = []
function setup(initial, props = {}) {
  const model = ref(initial)
  const Host = defineComponent({
    components: { ListEditor },
    setup: () => ({ model, props }),
    template: '<ListEditor v-model="model" v-bind="props" />',
  })
  const wrapper = mount(Host)
  mounted.push(wrapper)
  return { wrapper, model }
}
const base = { itemName: 'Hint', addLabel: 'Add hint', idBase: 'hint' }
const values = (wrapper) => wrapper.findAll('input, textarea').map((item) => item.element.value)
const button = (wrapper, name) =>
  wrapper
    .findAll('button')
    .find((item) => item.attributes('aria-label') === name || item.text() === name)
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('list editor', () => {
  it('shows the minimum rows as placeholders that only join the list once typed in', async () => {
    const { wrapper, model } = setup([], { ...base, minRows: 2 })
    expect(values(wrapper)).toEqual(['', ''])
    expect(wrapper.findAll('label').map((item) => item.text())).toEqual(['Hint 1', 'Hint 2'])
    expect(model.value).toEqual([])
    await wrapper.get('#hint-1').setValue('Second')
    expect(model.value).toEqual(['', 'Second'])
  })

  it('uses one-line boxes, or textareas for a multi-line list', () => {
    const { wrapper } = setup(['a'], base)
    expect(wrapper.get('#hint-0').element.tagName).toBe('INPUT')
    const code = setup(['print(x)'], { ...base, idBase: 'code', multiline: true })
    expect(code.wrapper.get('#code-0').element.tagName).toBe('TEXTAREA')
  })

  it('adds an empty item at the end', async () => {
    const { wrapper, model } = setup(['First'], base)
    await button(wrapper, 'Add hint').trigger('click')
    expect(model.value).toEqual(['First', ''])
    expect(wrapper.find('#hint-1').exists()).toBe(true)
  })

  it('moves items and disables the moves past either end', async () => {
    const { wrapper, model } = setup(['One', 'Two', 'Three'], base)
    expect(button(wrapper, 'Move hint 1 up').element.disabled).toBe(true)
    expect(button(wrapper, 'Move hint 3 down').element.disabled).toBe(true)
    await button(wrapper, 'Move hint 3 up').trigger('click')
    expect(model.value).toEqual(['One', 'Three', 'Two'])
    await button(wrapper, 'Move hint 1 down').trigger('click')
    expect(model.value).toEqual(['Three', 'One', 'Two'])
  })

  it('removes an item, keeping the minimum number of rows on screen', async () => {
    const { wrapper, model } = setup(['One', 'Two'], { ...base, minRows: 2 })
    await button(wrapper, 'Remove hint 1').trigger('click')
    expect(model.value).toEqual(['Two'])
    expect(values(wrapper)).toEqual(['Two', ''])
  })

  it('gives new object items the next free id and keeps the saved ones', async () => {
    const { wrapper, model } = setup([{ id: 'option-2', label: 'Two' }], {
      itemName: 'Option',
      addLabel: 'Add option',
      idPrefix: 'option-',
      minRows: 2,
    })
    await wrapper.findAll('input')[1].setValue('More')
    expect(model.value).toEqual([
      { id: 'option-2', label: 'Two' },
      { id: 'option-1', label: 'More' },
    ])
    await button(wrapper, 'Add option').trigger('click')
    expect(model.value.map((item) => item.id)).toEqual(['option-2', 'option-1', 'option-3'])
  })

  it('reads the page hint with every row', () => {
    const { wrapper } = setup(['a', 'b'], { ...base, describedby: 'page-hint' })
    expect(wrapper.get('#hint-0').attributes('aria-describedby')).toBe('page-hint')
    expect(wrapper.get('#hint-1').attributes('aria-describedby')).toBe('page-hint')
  })
})
