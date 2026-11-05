// B4 interaction/immutable-prop checks.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import ChallengeBuilder from '../components/challenges/ChallengeBuilder.vue'
import {
  copyDraft,
  draftPayload,
  lineChoiceLabels,
  newQuestion,
  publishChecklist,
  withAddedChoices,
  workingCopy,
} from '../utils/challengeEditor.js'

const mounted = []
function block(id, type = 'predict-output') {
  return { ...newQuestion(type), id, prompt: `Prompt ${id}` }
}
function setup(initial = [], codeSnippet = '') {
  const model = ref(initial)
  const Host = defineComponent({
    components: { ChallengeBuilder },
    setup: () => ({ model, codeSnippet }),
    template: '<ChallengeBuilder v-model="model" :code-snippet="codeSnippet" />',
  })
  const wrapper = mount(Host)
  mounted.push(wrapper)
  return { wrapper, model }
}
function control(wrapper, name) {
  const result = wrapper
    .findAll('button')
    .find((item) => item.attributes('aria-label') === name || item.text() === name)
  expect(result, `Missing control ${name}`).toBeDefined()
  return result
}
function labelled(wrapper, text) {
  const label = wrapper.findAll('label').find((item) => item.text() === text)
  expect(label, `Missing label ${text}`).toBeDefined()
  return wrapper
    .findAll('input, textarea, select')
    .find((item) => item.attributes('id') === label.attributes('for'))
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('challenge builder', () => {
  it('adds all three formats with distinct stable client ids and empty answer shapes', async () => {
    const { wrapper, model } = setup()
    for (const type of ['predict-output', 'locate-fault', 'repair-order']) {
      await labelled(wrapper, 'New question type').setValue(type)
      await control(wrapper, 'Add question').trigger('click')
    }
    expect(model.value.map((item) => item.type)).toEqual([
      'predict-output',
      'locate-fault',
      'repair-order',
    ])
    expect(new Set(model.value.map((item) => item.id)).size).toBe(3)
    expect(model.value.map((item) => item.acceptedAnswer)).toEqual([
      '',
      { location: '', category: '' },
      [],
    ])
    expect(model.value.every((item) => item.options.length === 0)).toBe(true)
  })

  it('keeps input and DOM identity with its block after reorder and removal', async () => {
    const { wrapper, model } = setup([block('first'), block('second'), block('third')])
    const second = wrapper.get('[data-block-id="second"]')
    const originalInput = labelled(second, 'Question prompt').element
    await labelled(second, 'Question prompt').setValue('Typed second block')
    await control(wrapper, 'Move question 2 up').trigger('click')
    expect(model.value.map((item) => item.id)).toEqual(['second', 'first', 'third'])
    expect(labelled(wrapper.get('[data-block-id="second"]'), 'Question prompt').element).toBe(
      originalInput,
    )
    await control(wrapper, 'Remove question 2').trigger('click')
    expect(model.value.map((item) => item.id)).toEqual(['second', 'third'])
    expect(labelled(wrapper.get('[data-block-id="second"]'), 'Question prompt').element.value).toBe(
      'Typed second block',
    )
    expect(control(wrapper, 'Move question 1 up').attributes('disabled')).toBeDefined()
    expect(control(wrapper, 'Move question 2 down').attributes('disabled')).toBeDefined()
  })

  it('emits new lists and nested values without mutating frozen props', async () => {
    const original = Object.freeze([
      Object.freeze({
        ...block('frozen', 'locate-fault'),
        options: Object.freeze([
          Object.freeze({ id: 'line-1', label: 'line 2' }),
          Object.freeze({ id: 'category-1', label: 'boundary' }),
        ]),
        acceptedAnswer: Object.freeze({ location: '', category: '' }),
      }),
    ])
    const wrapper = mount(ChallengeBuilder, { props: { modelValue: original } })
    mounted.push(wrapper)
    await labelled(wrapper, 'Accepted line').setValue('line-1')
    const emitted = wrapper.emitted('update:modelValue')[0][0]
    expect(emitted).not.toBe(original)
    expect(emitted[0].acceptedAnswer).toEqual({ location: 'line-1', category: '' })
    expect(original[0].acceptedAnswer).toEqual({ location: '', category: '' })
  })

  it('authors predict-output choices and clears a removed accepted choice', async () => {
    const { wrapper, model } = setup([block('prediction')])
    // A question needs two choices, so two empty rows are there from the start.
    await labelled(wrapper, 'Option 1').setValue('Logs one')
    // Choices show the professor's text, or their position, never the stored id.
    expect(
      labelled(wrapper, 'Accepted option')
        .findAll('option')
        .map((option) => option.text()),
    ).toEqual(['No answer yet', 'Logs one', 'Option 2'])
    await labelled(wrapper, 'Accepted option').setValue('option-1')
    await labelled(wrapper, 'Question explanation').setValue('The loop visits index zero.')
    expect(model.value[0].acceptedAnswer).toBe('option-1')
    expect(model.value[0].explanation).toBe('The loop visits index zero.')
    await control(wrapper, 'Remove option 1').trigger('click')
    expect(model.value[0].options).toEqual([{ id: 'option-2', label: '' }])
    expect(model.value[0].acceptedAnswer).toBe('')
  })

  it('authors separate line and category choices and clears a removed accepted one', async () => {
    const { wrapper, model } = setup([block('location', 'locate-fault')])
    await labelled(wrapper, 'Line choice 1').setValue('line 2')
    await labelled(wrapper, 'Line choice 2').setValue('line 3')
    await labelled(wrapper, 'Error category 1').setValue('boundary')
    await labelled(wrapper, 'Error category 2').setValue('syntax')
    expect(model.value[0].options).toEqual([
      { id: 'line-1', label: 'line 2' },
      { id: 'line-2', label: 'line 3' },
      { id: 'category-1', label: 'boundary' },
      { id: 'category-2', label: 'syntax' },
    ])
    const accepted = labelled(wrapper, 'Accepted line')
    expect(accepted.findAll('option').map((option) => option.text())).toEqual([
      'No answer yet',
      'line 2',
      'line 3',
    ])
    await accepted.setValue('line-2')
    await labelled(wrapper, 'Accepted error category').setValue('category-1')
    expect(model.value[0].acceptedAnswer).toEqual({ location: 'line-2', category: 'category-1' })
    await control(wrapper, 'Remove line choice 2').trigger('click')
    expect(model.value[0].options.map((option) => option.id)).toEqual([
      'line-1',
      'category-1',
      'category-2',
    ])
    expect(model.value[0].acceptedAnswer).toEqual({ location: '', category: 'category-1' })
  })

  it('builds an ordered repair answer of step ids and removes deleted steps from it', async () => {
    const { wrapper, model } = setup([block('repair', 'repair-order')])
    await labelled(wrapper, 'Step 1').setValue('Trace')
    await labelled(wrapper, 'Step 2').setValue('Repair')
    await labelled(wrapper, 'Add a step to correct order').setValue('s2')
    await labelled(wrapper, 'Add a step to correct order').setValue('s1')
    expect(model.value[0].acceptedAnswer).toEqual(['s2', 's1'])
    expect(wrapper.findAll('ol.ps-4 li').map((item) => item.find('span').text())).toEqual([
      'Repair',
      'Trace',
    ])
    await control(wrapper, 'Move accepted step 1 up').trigger('click')
    expect(model.value[0].acceptedAnswer).toEqual(['s1', 's2'])
    await control(wrapper, 'Remove step 1').trigger('click')
    expect(model.value[0].acceptedAnswer).toEqual(['s2'])
    expect(model.value[0].options).toEqual([{ id: 's2', label: 'Repair' }])
  })
})

// UX audit item 7: line choices from the snippet, and common categories in one click.
describe('locate-fault quick adds', () => {
  const snippet = 'function sum(xs) {\n  let total = 0\n\n  return total\n}'

  it('numbers line choices as students see them, skipping blank lines', () => {
    expect(lineChoiceLabels(snippet)).toEqual([
      'Line 1: function sum(xs) {',
      'Line 2: let total = 0',
      'Line 4: return total',
      'Line 5: }',
    ])
    expect(lineChoiceLabels('')).toEqual([])
    expect(lineChoiceLabels(undefined)).toEqual([])
  })

  it('keeps typed choices, drops blank rows, skips repeats and fills the lowest free ids', () => {
    const before = [
      { id: 'line-2', label: 'Line 2: let total = 0' },
      { id: 'line-1', label: '  ' },
    ]
    expect(
      withAddedChoices(before, 'line-', [
        'line 2: LET TOTAL = 0',
        'Line 4: return total',
        'Line 5: }',
      ]),
    ).toEqual([
      { id: 'line-2', label: 'Line 2: let total = 0' },
      { id: 'line-1', label: 'Line 4: return total' },
      { id: 'line-3', label: 'Line 5: }' },
    ])
  })

  it('adds a choice for every line of the snippet in one click', async () => {
    const { wrapper, model } = setup([block('location', 'locate-fault')], snippet)
    await labelled(wrapper, 'Line choice 1').setValue('Line 4: return total')
    await control(wrapper, 'Add a choice for every line').trigger('click')
    const lines = model.value[0].options.filter((option) => option.id.startsWith('line-'))
    expect(lines.map((option) => option.label)).toEqual([
      'Line 4: return total',
      'Line 1: function sum(xs) {',
      'Line 2: let total = 0',
      'Line 5: }',
    ])
    expect(new Set(lines.map((option) => option.id)).size).toBe(4)
  })

  it('disables the line button and says why when there is no snippet', () => {
    const { wrapper } = setup([block('location', 'locate-fault')])
    const button = control(wrapper, 'Add a choice for every line')
    expect(button.attributes('disabled')).toBeDefined()
    const hint = wrapper.find(`#${button.attributes('aria-describedby')}`)
    expect(hint.text()).toBe('Add a code snippet above first.')
  })

  it('adds a common category and stops offering it', async () => {
    const { wrapper, model } = setup([block('location', 'locate-fault')])
    const group = wrapper.find('[role="group"]')
    expect(group.findAll('button').map((button) => button.text())).toEqual([
      '+ Off-by-one',
      '+ Wrong operator',
      '+ Wrong variable',
      '+ Missing return',
      '+ Wrong condition',
      '+ Syntax error',
    ])
    await group.findAll('button')[0].trigger('click')
    expect(model.value[0].options.filter((option) => option.id.startsWith('category-'))).toEqual([
      { id: 'category-1', label: 'Off-by-one' },
    ])
    expect(wrapper.find('[role="group"]').text()).not.toContain('Off-by-one')
  })
})

describe('editor copies and payloads', () => {
  it('deep-copies nested options, answers, applied case and hints away from saved data', () => {
    const saved = {
      questions: [
        {
          ...block('locate', 'locate-fault'),
          options: [],
          acceptedAnswer: { location: '2', category: 'boundary' },
        },
      ],
      appliedCase: { prompt: 'Saved case' },
      progressiveHints: ['Saved hint'],
    }
    const before = copyDraft(saved)
    const working = workingCopy(saved)
    working.questions[0].acceptedAnswer.location = '5'
    working.appliedCase.prompt = 'Typed case'
    working.progressiveHints[0] = 'Typed hint'
    expect(saved).toEqual(before)
  })

  it('strips system fields, temporary ids and order while retaining saved block ids for updates', () => {
    const realId = '507f1f77bcf86cd799439021'
    const draft = {
      ...workingCopy(),
      status: 'published',
      classroomId: 'foreign',
      createdBy: 'foreign',
      questions: [{ ...block(realId), order: 99 }, newQuestion('repair-order')],
    }
    const updating = draftPayload(draft, true)
    expect(updating.questions[0].id).toBe(realId)
    expect(updating.questions[1]).not.toHaveProperty('id')
    expect(updating.questions[0]).not.toHaveProperty('order')
    expect(updating).not.toHaveProperty('status')
    expect(updating).not.toHaveProperty('classroomId')
    expect(updating).not.toHaveProperty('createdBy')
    expect(draftPayload(draft).questions.every((item) => !Object.hasOwn(item, 'id'))).toBe(true)
  })
})

describe('publish checklist (UX audit item 2)', () => {
  const ready = (block) =>
    publishChecklist({ questions: [block] }).find((item) => item.field === 'questions.0').done
  const choices = (...pairs) => pairs.map(([id, label]) => ({ id, label }))
  const base = { prompt: 'Which line?', explanation: 'Because.' }

  it('needs two filled choices and an accepted one for predict output', () => {
    const block = {
      ...base,
      type: 'predict-output',
      options: choices(['option-1', '3'], ['option-2', '']),
    }
    expect(ready({ ...block, acceptedAnswer: 'option-1' })).toBe(false)
    block.options[1].label = '6'
    expect(ready({ ...block, acceptedAnswer: '' })).toBe(false)
    expect(ready({ ...block, acceptedAnswer: 'option-1' })).toBe(true)
    expect(ready({ ...block, explanation: ' ', acceptedAnswer: 'option-1' })).toBe(false)
  })

  it('needs two lines, two categories and both answers for locate fault', () => {
    const block = {
      ...base,
      type: 'locate-fault',
      options: choices(['line-1', 'line 2'], ['line-2', 'line 3'], ['category-1', 'boundary']),
      acceptedAnswer: { location: 'line-1', category: 'category-1' },
    }
    expect(ready(block)).toBe(false)
    block.options.push({ id: 'category-2', label: 'syntax' })
    expect(ready(block)).toBe(true)
    expect(ready({ ...block, acceptedAnswer: { location: 'line-1', category: '' } })).toBe(false)
  })

  it('needs every filled step in the correct order for repair order', () => {
    const block = {
      ...base,
      type: 'repair-order',
      options: choices(['s1', 'Trace'], ['s2', 'Fix'], ['s3', '']),
      acceptedAnswer: ['s2'],
    }
    expect(ready(block)).toBe(false)
    expect(ready({ ...block, acceptedAnswer: ['s2', 's1'] })).toBe(true)
  })

  // Third-pass audit B: students start from the listed order, so listing the
  // steps in the correct order would give the answer away.
  it('needs the steps listed in a different order from the correct one', () => {
    const block = {
      ...base,
      type: 'repair-order',
      options: choices(['s1', 'Trace'], ['s2', 'Fix']),
      acceptedAnswer: ['s1', 's2'],
    }
    expect(ready(block)).toBe(false)
    expect(publishChecklist({ questions: [block] })[5].label).toBe(
      'Question 1: prompt, two steps listed out of order, all steps in the correct order and an explanation',
    )
  })

  it('asks for a first question, and for two hints that are not blank', () => {
    const list = publishChecklist({ questions: [], progressiveHints: ['One', '  '] })
    expect(list.find((item) => item.field === 'questions')).toMatchObject({
      label: 'At least one question',
      done: false,
    })
    expect(list.find((item) => item.field === 'progressiveHints')).toMatchObject({ done: false })
  })
})
