<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — GitHub repository panel
//  It must never call GitHub itself. It emits refresh and displays what it is
//  handed. Its props ARE the response contract: repository.name, description,
//  language, defaultBranch and updatedAt; commits keyed by sha with message,
//  author, date and url; contributors (F7) with login, commits and url, or
//  null for a snapshot saved before F7; plus lastRefreshedAt, loading and
//  error. githubService.js maps the upstream fields to exactly these names.
//  A repository with fewer than five commits shows the commits it has. Do not
//  pad the list to five.
//  No GitHub
//  profile pictures, because they would make the browser call GitHub once per
//  contributor (F6) and these are GitHub accounts, not Learn-E users (F-7).
// ════════════════════════════════════════════════════════════════════
import { formatDateTime } from '../../utils/formatDate.js'
defineProps({
  repository: { type: Object, default: () => ({}) },
  commits: { type: Array, default: () => [] },
  lastRefreshedAt: String,
  loading: Boolean,
  error: String,
  contributors: { type: Array, default: null },
})
defineEmits(['refresh'])

// A commit's first line is its summary; the rest can be long.
const summaryOf = (message) => String(message ?? '').split('\n')[0]
</script>
<template>
  <section class="card overflow-hidden le-gh" aria-label="GitHub repository evidence">
    <div class="card-body p-4">
      <!-- The error sits above the old data, which stays visible (F6). -->
      <p v-if="error" class="alert alert-danger le-request-text" role="alert">{{ error }}</p>
      <div class="le-card-head justify-content-between mb-2">
        <h3 class="h5 mb-0 le-request-text">
          {{ repository.name || 'Not refreshed yet' }}
        </h3>
        <span v-if="repository.language" class="le-chip le-chip-section">
          <span class="visually-hidden">Language:</span> {{ repository.language }}
        </span>
      </div>
      <p class="text-body-secondary small mb-2">
        <template v-if="repository.defaultBranch">
          Default branch: {{ repository.defaultBranch }} ·
        </template>
        Repository updated: {{ formatDateTime(repository.updatedAt) || 'Unknown' }}
      </p>
      <p v-if="repository.description" class="le-request-text mb-0">
        {{ repository.description }}
      </p>
    </div>

    <h4 class="h6 le-gh-subhead">Latest commits</h4>
    <ol v-if="commits.length" class="le-rows le-rows-2">
      <li v-for="commit in commits" :key="commit.sha" class="le-row">
        <div>
          <h5 class="h6 mb-1 le-request-text">{{ summaryOf(commit.message) }}</h5>
          <p class="text-body-secondary small mb-0">
            {{ commit.author || 'Unknown author' }}
            <template v-if="formatDateTime(commit.date)">
              · {{ formatDateTime(commit.date) }}</template
            >
          </p>
        </div>
        <a v-if="commit.url" :href="commit.url" target="_blank" rel="noopener" class="small">
          View on GitHub<span class="visually-hidden">: {{ summaryOf(commit.message) }}</span>
        </a>
      </li>
    </ol>
    <p v-else class="text-body-secondary le-gh-note">No commits yet.</p>

    <h4 class="h6 le-gh-subhead">Contributors</h4>
    <p v-if="contributors == null" class="text-body-secondary le-gh-note">
      Not retrieved yet. Refresh to load contributors.
    </p>
    <p v-else-if="contributors.length === 0" class="text-body-secondary le-gh-note">
      No contributors yet.
    </p>
    <template v-else>
      <div class="le-rows-head le-rows-2" aria-hidden="true">
        <span>GitHub login</span>
        <span>Commits</span>
      </div>
      <ul class="le-rows le-rows-2">
        <li v-for="contributor in contributors" :key="contributor.login" class="le-row">
          <a :href="contributor.url" target="_blank" rel="noopener" class="le-request-text">{{
            contributor.login
          }}</a>
          <span class="le-num">{{ contributor.commits }} commits</span>
        </li>
      </ul>
    </template>
    <p class="text-body-secondary small le-gh-note">
      Counts are as reported by GitHub, and they may be a few hours old: a record of activity, not a
      measure of anyone's contribution.
    </p>

    <div class="le-card-foot le-gh-foot">
      <p class="text-body-secondary small mb-0">
        Last successful refresh:
        <time v-if="lastRefreshedAt" :datetime="lastRefreshedAt">{{
          formatDateTime(lastRefreshedAt) || lastRefreshedAt
        }}</time>
        <template v-else>Never</template>
      </p>
      <button
        class="btn btn-outline-primary"
        type="button"
        :disabled="loading"
        @click="$emit('refresh')"
      >
        {{ loading ? 'Refreshing' : 'Refresh GitHub data' }}
      </button>
    </div>
  </section>
</template>
