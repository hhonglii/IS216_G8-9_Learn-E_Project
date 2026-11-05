<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — group browser
//  Lists groups and emits join, which MiniProjectView handles. Create group
//  sits in MiniProjectView beside its name field, not here. The
//  place count can be out of date by the time a click arrives, so the server
//  still decides every join.
// ════════════════════════════════════════════════════════════════════
defineProps({
  groups: { type: Array, default: () => [] },
  maxGroupSize: Number,
  currentUserId: String,
})
defineEmits(['join'])
</script>
<template>
  <section aria-labelledby="available-groups-heading">
    <h3 id="available-groups-heading" class="h5">Available groups</h3>
    <p class="text-body-secondary">Maximum group size: {{ maxGroupSize }}</p>
    <ul v-if="groups.length" class="le-list mb-3">
      <li v-for="group in groups" :key="group.id">
        <span class="d-flex flex-wrap align-items-center gap-2">
          <span class="fw-semibold le-request-text">{{ group.name }}</span>
          <span class="le-chip le-num"
            >{{ group.memberIds?.length || 0 }}
            {{ group.memberIds?.length === 1 ? 'member' : 'members' }}</span
          >
        </span>
        <button
          type="button"
          class="btn btn-outline-primary btn-sm"
          @click="$emit('join', group.id)"
        >
          Join group
        </button>
      </li>
    </ul>
  </section>
</template>
