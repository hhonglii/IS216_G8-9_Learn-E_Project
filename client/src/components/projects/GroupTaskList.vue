<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — group task list
//  Emits create-task, update-task and remove-task for ONE task and mutates nothing it is
//  given. The server replaces the whole task array, so MiniProjectView merges
//  these single intents into a complete list. Each task is keyed by task.id.
//  The member chips link to each member's profile.
// ════════════════════════════════════════════════════════════════════
import { taskStatusLabels } from '@/config/taskStatuses.js'
defineProps({
  tasks: { type: Array, default: () => [] },
  members: { type: Array, default: () => [] },
  readonly: Boolean,
})
defineEmits(['create-task', 'update-task', 'remove-task'])
</script>
<template>
  <section aria-labelledby="group-tasks-heading">
    <div class="le-card-head">
      <span class="le-section-icon" aria-hidden="true">
        <svg class="le-icon" viewBox="0 0 16 16">
          <path d="M2.5 4 4 5.5 6.5 3M2.5 10l1.5 1.5L6.5 9M8.5 4.5h5M8.5 10.5h5" />
        </svg>
      </span>
      <h2 id="group-tasks-heading" class="h4 mb-0">Group tasks</h2>
    </div>
    <p class="d-flex flex-wrap align-items-center gap-2">
      <span class="text-body-secondary">Available owners:</span>
      <RouterLink
        v-for="member in members"
        :key="member.id"
        class="le-chip"
        :to="{ name: 'profile', params: { userId: member.id } }"
        >{{ member.displayName }}</RouterLink
      >
    </p>
    <ul v-if="tasks.length" class="le-list mb-3">
      <li v-for="task in tasks" :key="task.id">
        <div class="le-request-text">
          <p class="fw-semibold mb-1">{{ task.title }}</p>
          <p class="small text-body-secondary mb-0">
            {{ members.find((member) => member.id === task.ownerId)?.displayName || 'Unassigned' }}
          </p>
          <p v-if="task.evidenceUrl" class="small mb-0">Evidence: {{ task.evidenceUrl }}</p>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span class="badge le-status" :class="{ 'is-active': task.status !== 'todo' }">
            {{ taskStatusLabels[task.status] || task.status }}
          </span>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="readonly"
            @click="$emit('update-task', { ...task })"
          >
            Edit task
          </button>
          <button
            type="button"
            class="btn btn-outline-danger btn-sm"
            :disabled="readonly"
            :aria-label="`Remove task: ${task.title}`"
            @click="$emit('remove-task', { ...task })"
          >
            Remove
          </button>
        </div>
      </li>
    </ul>
    <button
      type="button"
      class="btn btn-outline-primary"
      :disabled="readonly"
      @click="$emit('create-task')"
    >
      Create task
    </button>
  </section>
</template>
