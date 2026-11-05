<script setup>
defineProps({ name: { type: String, default: 'terminal' } })
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <g v-if="name === 'terminal'">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7 9 3 3-3 3m6 0h4" />
    </g>
    <g v-else-if="name === 'notes'">
      <path d="M5 3h14v13l-5 5H5V3Z" />
      <path d="M14 21v-5h5M8 8h8M8 12h7" />
    </g>
    <g v-else-if="name === 'sniffer'">
      <path d="M3 13h4l3-8 4 14 3-8h4" />
      <path d="M4 4h3M17 20h3" />
    </g>
    <g v-else-if="name === 'monitor'">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M9 21h6m-3-4v4M6 12l3-3 3 4 5-6" />
    </g>
    <g v-else-if="name === 'coffee'">
      <path
        d="M5 9h12v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Zm12 1h2a3 3 0 1 1 0 6h-2M3 22h17M8 6c3-2-2-3 1-5m4 5c3-2-2-3 1-5"
      />
    </g>
  </svg>
</template>
