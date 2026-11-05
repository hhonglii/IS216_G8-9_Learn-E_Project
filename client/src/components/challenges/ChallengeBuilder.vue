<script setup>
// Learn-E challenge block builder.
// B-7: emit fresh lists; B-8: array position is sent without an order field.
import { ref } from 'vue'
import {
  commonErrorCategories,
  lineChoiceLabels,
  newQuestion,
  withAddedChoices,
  withoutMissingAnswers,
} from '../../utils/challengeEditor.js'
import ListEditor from '../shared/ListEditor.vue'
import InfoTip from '../shared/InfoTip.vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // Fields the server reported, named its way (questions.0.prompt), to outline.
  problemFields: { type: Array, default: () => [] },
  // Control ids are idBase-<block id>-prompt and so on, so a page can link to them.
  idBase: { type: String, default: 'block' },
  // The challenge's code, for "Add a choice for every line" (UX audit item 7).
  codeSnippet: { type: String, default: '' },
})
// True when the server named this part of block index, or something inside it.
const flagged = (index, part) =>
  props.problemFields.some(
    (field) =>
      field === `questions.${index}.${part}` || field.startsWith(`questions.${index}.${part}.`),
  )
const invalid = (index, part) => (flagged(index, part) ? 'true' : undefined)
const emit = defineEmits(['update:modelValue'])
const chosenType = ref('predict-output')
const labels = {
  'predict-output': 'Predict output',
  'locate-fault': 'Locate fault',
  'repair-order': 'Repair order',
}
// A locate-fault block keeps both lists in options, told apart by id prefix.
const locateGroups = [
  {
    prefix: 'line-',
    field: 'location',
    heading: 'Line choices',
    topic: 'lineChoices',
    item: 'Line choice',
    add: 'Add line choice',
    accepted: 'Accepted line',
  },
  {
    prefix: 'category-',
    field: 'category',
    heading: 'Error category choices',
    topic: 'errorCategories',
    item: 'Error category',
    add: 'Add error category',
    accepted: 'Accepted error category',
  },
]
const inGroup = (block, group) =>
  block.options.filter((option) => option.id.startsWith(group.prefix))

// Professors see a choice by its place in the list and the text they typed,
// never by its stored id (option-1, s2), which only the server needs.
function choiceName(block, id) {
  const position = block.options.findIndex((option) => option.id === id) + 1
  return `${block.type === 'repair-order' ? 'Step' : 'Option'} ${position}`
}
function choiceText(block, id) {
  return block.options.find((option) => option.id === id)?.label.trim() || choiceName(block, id)
}

function changeBlock(id, changes) {
  emit(
    'update:modelValue',
    props.modelValue.map((block) => (block.id === id ? { ...block, ...changes } : block)),
  )
}
function addBlock() {
  emit('update:modelValue', [...props.modelValue, newQuestion(chosenType.value)])
}
function removeBlock(id) {
  emit(
    'update:modelValue',
    props.modelValue.filter((block) => block.id !== id),
  )
}
function moveBlock(index, direction) {
  const destination = index + direction
  if (destination < 0 || destination >= props.modelValue.length) return
  const blocks = [...props.modelValue]
  ;[blocks[index], blocks[destination]] = [blocks[destination], blocks[index]]
  emit('update:modelValue', blocks)
}
// The list editor sends the whole new list. An accepted answer that points at a
// removed choice is cleared, so it never names something that is gone.
function setOptions(block, options) {
  changeBlock(block.id, withoutMissingAnswers({ ...block, options }))
}
function setGroupOptions(block, group, groupOptions) {
  const others = block.options.filter((option) => !option.id.startsWith(group.prefix))
  const ordered =
    group.prefix === 'line-' ? [...groupOptions, ...others] : [...others, ...groupOptions]
  setOptions(block, ordered)
}
function addChoices(block, group, labels) {
  setGroupOptions(block, group, withAddedChoices(inGroup(block, group), group.prefix, labels))
}
// The quick categories a block doesn't have yet; each disappears once added.
const missingCategories = (block, group) => {
  const have = inGroup(block, group).map((option) => option.label.trim().toLowerCase())
  return commonErrorCategories.filter((category) => !have.includes(category.toLowerCase()))
}
function appendAnswer(block, event) {
  const id = event.target.value
  if (id && !block.acceptedAnswer.includes(id)) {
    changeBlock(block.id, { acceptedAnswer: [...block.acceptedAnswer, id] })
  }
  event.target.value = ''
}
function moveAnswer(block, index, direction) {
  const destination = index + direction
  if (destination < 0 || destination >= block.acceptedAnswer.length) return
  const answer = [...block.acceptedAnswer]
  ;[answer[index], answer[destination]] = [answer[destination], answer[index]]
  changeBlock(block.id, { acceptedAnswer: answer })
}
</script>

<template>
  <section aria-label="Questions">
    <h3 class="h5">Questions</h3>
    <p class="text-body-secondary">
      Answers and explanations here are visible to the owning professor.
    </p>
    <p v-if="!modelValue.length" class="text-body-secondary">No questions yet.</p>
    <fieldset
      v-for="(block, index) in modelValue"
      :key="block.id"
      :data-block-id="block.id"
      class="le-block mb-3"
    >
      <legend>Question {{ index + 1 }}: {{ labels[block.type] }}</legend>
      <div class="d-flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          :disabled="index === 0"
          :aria-label="`Move question ${index + 1} up`"
          @click="moveBlock(index, -1)"
        >
          Move up
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          :disabled="index === modelValue.length - 1"
          :aria-label="`Move question ${index + 1} down`"
          @click="moveBlock(index, 1)"
        >
          Move down
        </button>
        <button
          type="button"
          class="btn btn-outline-danger btn-sm"
          :aria-label="`Remove question ${index + 1}`"
          @click="removeBlock(block.id)"
        >
          Remove question
        </button>
      </div>
      <label :for="`${idBase}-${block.id}-prompt`" class="form-label">Question prompt</label>
      <InfoTip topic="blockPrompt" />
      <textarea
        :id="`${idBase}-${block.id}-prompt`"
        class="form-control mb-3"
        :class="{ 'is-invalid': flagged(index, 'prompt') }"
        :aria-invalid="invalid(index, 'prompt')"
        rows="2"
        :value="block.prompt"
        @input="changeBlock(block.id, { prompt: $event.target.value })"
      />

      <template v-if="block.type !== 'locate-fault'">
        <h4 class="h6">{{ block.type === 'repair-order' ? 'Repair steps' : 'Options' }}</h4>
        <p v-if="block.type === 'repair-order'" class="form-text mt-0">
          Students start from the steps in this order, so list them in a different order from the
          correct one below.
        </p>
        <ListEditor
          class="mb-3"
          :model-value="block.options"
          :item-name="block.type === 'repair-order' ? 'Step' : 'Option'"
          :add-label="block.type === 'repair-order' ? 'Add repair step' : 'Add option'"
          :id-prefix="block.type === 'repair-order' ? 's' : 'option-'"
          :min-rows="2"
          :id-base="`${idBase}-${block.id}-options`"
          multiline
          @update:model-value="setOptions(block, $event)"
        />
      </template>

      <template v-if="block.type === 'predict-output'">
        <label :for="`${idBase}-${block.id}-answer`" class="form-label d-block"
          >Accepted option</label
        >
        <select
          :id="`${idBase}-${block.id}-answer`"
          class="form-select mb-3"
          :class="{ 'is-invalid': flagged(index, 'acceptedAnswer') }"
          :aria-invalid="invalid(index, 'acceptedAnswer')"
          :value="block.acceptedAnswer"
          @change="changeBlock(block.id, { acceptedAnswer: $event.target.value })"
        >
          <option value="">No answer yet</option>
          <option v-for="option in block.options" :key="option.id" :value="option.id">
            {{ choiceText(block, option.id) }}
          </option>
        </select>
      </template>
      <template v-else-if="block.type === 'locate-fault'">
        <div v-for="group in locateGroups" :key="group.prefix" class="mb-3">
          <div class="le-heading-tip">
            <h4 class="h6">{{ group.heading }}</h4>
            <InfoTip :topic="group.topic" />
          </div>
          <ListEditor
            class="mb-3"
            :model-value="inGroup(block, group)"
            :item-name="group.item"
            :add-label="group.add"
            :id-prefix="group.prefix"
            :min-rows="2"
            :id-base="`${idBase}-${block.id}-${group.field}-options`"
            @update:model-value="setGroupOptions(block, group, $event)"
          />
          <div v-if="group.prefix === 'line-'" class="mb-3">
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              :disabled="!lineChoiceLabels(codeSnippet).length"
              :aria-describedby="`${idBase}-${block.id}-every-line-hint`"
              @click="addChoices(block, group, lineChoiceLabels(codeSnippet))"
            >
              Add a choice for every line
            </button>
            <p :id="`${idBase}-${block.id}-every-line-hint`" class="form-text mb-0">
              {{
                lineChoiceLabels(codeSnippet).length
                  ? 'Adds "Line 3: ..." for each line of the code snippet that has text and isn\'t listed yet. Remove the ones you don\'t want.'
                  : 'Add a code snippet above first.'
              }}
            </p>
          </div>
          <div v-else-if="missingCategories(block, group).length" class="mb-3">
            <p :id="`${idBase}-${block.id}-quick-categories`" class="form-text mt-0 mb-1">
              Add a common category:
            </p>
            <div
              class="d-flex flex-wrap gap-2"
              role="group"
              :aria-labelledby="`${idBase}-${block.id}-quick-categories`"
            >
              <button
                v-for="category in missingCategories(block, group)"
                :key="category"
                type="button"
                class="btn btn-outline-secondary btn-sm"
                @click="addChoices(block, group, [category])"
              >
                <span aria-hidden="true">+ </span>{{ category }}
              </button>
            </div>
          </div>
          <label :for="`${idBase}-${block.id}-${group.field}`" class="form-label d-block">{{
            group.accepted
          }}</label>
          <select
            :id="`${idBase}-${block.id}-${group.field}`"
            class="form-select"
            :class="{ 'is-invalid': flagged(index, `acceptedAnswer.${group.field}`) }"
            :aria-invalid="invalid(index, `acceptedAnswer.${group.field}`)"
            :value="block.acceptedAnswer[group.field]"
            @change="
              changeBlock(block.id, {
                acceptedAnswer: { ...block.acceptedAnswer, [group.field]: $event.target.value },
              })
            "
          >
            <option value="">No answer yet</option>
            <option
              v-for="(option, optionIndex) in inGroup(block, group)"
              :key="option.id"
              :value="option.id"
            >
              {{ option.label || `${group.item} ${optionIndex + 1}` }}
            </option>
          </select>
        </div>
      </template>
      <template v-else-if="block.type === 'repair-order'">
        <h4 class="h6">Correct repair order</h4>
        <ol class="ps-4">
          <li v-for="(step, answerIndex) in block.acceptedAnswer" :key="step" class="mb-2">
            <span class="text-break">{{ choiceText(block, step) }}</span>
            <div class="d-flex flex-wrap gap-2 mt-1">
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="answerIndex === 0"
                :aria-label="`Move accepted ${choiceName(block, step).toLowerCase()} up`"
                @click="moveAnswer(block, answerIndex, -1)"
              >
                Move up
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="answerIndex === block.acceptedAnswer.length - 1"
                :aria-label="`Move accepted ${choiceName(block, step).toLowerCase()} down`"
                @click="moveAnswer(block, answerIndex, 1)"
              >
                Move down
              </button>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                :aria-label="`Remove accepted ${choiceName(block, step).toLowerCase()}`"
                @click="
                  changeBlock(block.id, {
                    acceptedAnswer: block.acceptedAnswer.filter((id) => id !== step),
                  })
                "
              >
                Remove
              </button>
            </div>
          </li>
        </ol>
        <label :for="`${idBase}-${block.id}-answer`" class="form-label"
          >Add a step to correct order</label
        >
        <select
          :id="`${idBase}-${block.id}-answer`"
          class="form-select mb-3"
          :class="{ 'is-invalid': flagged(index, 'acceptedAnswer') }"
          :aria-invalid="invalid(index, 'acceptedAnswer')"
          value=""
          @change="appendAnswer(block, $event)"
        >
          <option value="">Choose a step</option>
          <option
            v-for="option in block.options.filter(
              (item) => !block.acceptedAnswer.includes(item.id),
            )"
            :key="option.id"
            :value="option.id"
          >
            {{ choiceText(block, option.id) }}
          </option>
        </select>
      </template>

      <label :for="`${idBase}-${block.id}-explanation`" class="form-label"
        >Question explanation</label
      >
      <InfoTip topic="blockExplanation" />
      <textarea
        :id="`${idBase}-${block.id}-explanation`"
        class="form-control"
        :class="{ 'is-invalid': flagged(index, 'explanation') }"
        :aria-invalid="invalid(index, 'explanation')"
        rows="2"
        :value="block.explanation"
        @input="changeBlock(block.id, { explanation: $event.target.value })"
      />
    </fieldset>
    <div class="row g-2 align-items-end">
      <div class="col-sm-7">
        <label :for="`${idBase}-new-type`" class="form-label">New question type</label>
        <select :id="`${idBase}-new-type`" v-model="chosenType" class="form-select">
          <option v-for="(label, type) in labels" :key="type" :value="type">{{ label }}</option>
        </select>
      </div>
      <div class="col-sm-5">
        <button
          :id="`${idBase}-add`"
          type="button"
          class="btn btn-outline-primary"
          @click="addBlock"
        >
          Add question
        </button>
      </div>
    </div>
  </section>
</template>
