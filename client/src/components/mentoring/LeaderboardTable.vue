<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — leaderboard table
//  Renders the entries it is given, keyed by entry.userId. The server decides
//  the totals and the tie order (decision G-6). The avatar beside each name
//  comes from UserAvatar, seeded by entry.userId (G-9). Each name links to
//  that student's profile; a deleted account has no id and stays plain text.
// ════════════════════════════════════════════════════════════════════
import UserAvatar from '../shared/UserAvatar.vue'
defineProps({ entries: { type: Array, default: () => [] } })
</script>
<template>
  <div class="table-responsive">
    <table class="table align-middle mb-0">
      <caption>
        Classroom contributions, not academic grades
      </caption>
      <thead>
        <tr>
          <th scope="col">Student</th>
          <th scope="col" class="text-end">Contribution points</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.userId">
          <td>
            <div class="le-person">
              <UserAvatar
                v-if="entry.userId"
                :user-id="entry.userId"
                :display-name="entry.displayName"
              />
              <RouterLink
                v-if="entry.userId"
                class="le-request-text"
                :to="{ name: 'profile', params: { userId: entry.userId } }"
                >{{ entry.displayName }}</RouterLink
              >
              <span v-else class="le-request-text">{{ entry.displayName }}</span>
            </div>
          </td>
          <td class="text-end le-num">{{ entry.contributionPoints }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
