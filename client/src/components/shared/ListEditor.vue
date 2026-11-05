<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — list editor (UX audit item 5)
//  One way to type a list everywhere: each item has its own box, an Add button
//  goes under the list, and every item has Move up, Move down and Remove. A
//  list that needs a minimum shows that many rows from the start. Rows past
//  the saved items are placeholders until something is typed in them, so
//  opening a form never counts as a change. Blank items are the page's to
//  drop when it saves.
// ════════════════════════════════════════════════════════════════════
import { computed, useId } from 'vue'

const props = defineProps({
  // Strings, or { id, label } objects when idPrefix is set.
  modelValue: { type: Array, default: () => [] },
  itemName: { type: String, required: true }, // labels each row: "Option 1"
  addLabel: { type: String, required: true }, // the add button's text
  idPrefix: { type: String, default: '' }, // new objects get ids like option-3
  minRows: { type: Number, default: 1 },
  multiline: { type: Boolean, default: false }, // a textarea per item instead of one line
  describedby: { type: String, default: undefined }, // the list's hint text, read with each row
  idBase: { type: String, default: '' }, // row ids are idBase-0, idBase-1; generated when blank
})
const emit = defineEmits(['update:modelValue'])
const generatedId = useId()
const uid = computed(() => props.idBase || generatedId)

const usesIds = computed(() => props.idPrefix !== '')
const lowerName = computed(() => props.itemName.toLowerCase())
const textOf = (item) => (usesIds.value ? item?.label : item) ?? ''
const rowCount = computed(() => Math.max(props.modelValue.length, props.minRows))
const rows = computed(() =>
  Array.from({ length: rowCount.value }, (_, index) => ({
    key:
      usesIds.value && index < props.modelValue.length
        ? props.modelValue[index].id
        : `row-${index}`,
    text: textOf(props.modelValue[index]),
  })),
)
const inputId = (index) => `${uid.value}-${index}`

function newItem(text, list) {
  if (!usesIds.value) return text
  let number = 1
  while (list.some((item) => item.id === `${props.idPrefix}${number}`)) number++
  return { id: `${props.idPrefix}${number}`, label: text }
}
// The model with every placeholder row made real, ready to change.
function fullList() {
  const list = [...props.modelValue]
  while (list.length < rowCount.value) list.push(newItem('', list))
  return list
}

function setText(index, text) {
  const list = fullList()
  list[index] = usesIds.value ? { ...list[index], label: text } : text
  emit('update:modelValue', list)
}
function add() {
  const list = fullList()
  list.push(newItem('', list))
  emit('update:modelValue', list)
}
function remove(index) {
  const list = fullList()
  list.splice(index, 1)
  emit('update:modelValue', list)
}
function move(index, direction) {
  const destination = index + direction
  if (destination < 0 || destination >= rowCount.value) return
  const list = fullList()
  ;[list[index], list[destination]] = [list[destination], list[index]]
  emit('update:modelValue', list)
}
</script>

<template>
  <div class="le-list-editor">
    <ol class="list-unstyled mb-2">
      <li v-for="(row, index) in rows" :key="row.key" class="mb-2">
        <label :for="inputId(index)" class="form-label small mb-1">
          {{ itemName }} {{ index + 1 }}
        </label>
        <div class="le-list-row">
          <textarea
            v-if="multiline"
            :id="inputId(index)"
            class="form-control le-list-input"
            rows="2"
            :value="row.text"
            :aria-describedby="describedby"
            @input="setText(index, $event.target.value)"
          ></textarea>
          <input
            v-else
            :id="inputId(index)"
            type="text"
            class="form-control le-list-input"
            :value="row.text"
            :aria-describedby="describedby"
            @input="setText(index, $event.target.value)"
          />
          <div class="d-flex gap-1">
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :disabled="index === 0"
              :aria-label="`Move ${lowerName} ${index + 1} up`"
              @click="move(index, -1)"
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :disabled="index === rows.length - 1"
              :aria-label="`Move ${lowerName} ${index + 1} down`"
              @click="move(index, 1)"
            >
              <span aria-hidden="true">↓</span>
            </button>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              :aria-label="`Remove ${lowerName} ${index + 1}`"
              @click="remove(index)"
            >
              Remove
            </button>
          </div>
        </div>
      </li>
    </ol>
    <button type="button" class="btn btn-outline-primary btn-sm" @click="add">
      {{ addLabel }}
    </button>
  </div>
</template>
