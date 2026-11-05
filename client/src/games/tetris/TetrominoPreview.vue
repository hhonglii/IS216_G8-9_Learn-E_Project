<script setup>
import { computed } from 'vue'
import { cellsFor } from './useTetrisGame.js'
const props = defineProps({
  type: { type: String, required: true },
  color: { type: String, default: '#00f5d4' },
})
const shape = computed(() => {
  const cells = cellsFor({ type: props.type, rotation: 0, x: 0, y: 0 })
  const minX = Math.min(...cells.map((cell) => cell.x))
  const minY = Math.min(...cells.map((cell) => cell.y))
  return {
    cells: cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY })),
    width: Math.max(...cells.map((cell) => cell.x)) - minX + 1,
    height: Math.max(...cells.map((cell) => cell.y)) - minY + 1,
  }
})
</script>
<template>
  <svg
    class="tetromino-preview"
    :viewBox="`0 0 ${shape.width * 24} ${shape.height * 24}`"
    :data-preview-piece="type"
    role="img"
    :aria-label="`${type} piece`"
    :style="{ color }"
  >
    <g v-for="(cell, index) in shape.cells" :key="index">
      <rect
        :x="cell.x * 24 + 1"
        :y="cell.y * 24 + 1"
        width="22"
        height="22"
        rx="2"
        fill="currentColor"
        fill-opacity=".19"
        stroke="currentColor"
        stroke-width="1"
      />
      <path
        :d="`M${cell.x * 24 + 4} ${cell.y * 24 + 19}V${cell.y * 24 + 4}H${cell.x * 24 + 19}`"
        fill="none"
        stroke="currentColor"
        stroke-opacity=".6"
        stroke-width="1"
      />
    </g>
  </svg>
</template>
<style scoped>
.tetromino-preview {
  display: block;
  width: 90px;
  height: 48px;
  overflow: visible;
}
</style>
