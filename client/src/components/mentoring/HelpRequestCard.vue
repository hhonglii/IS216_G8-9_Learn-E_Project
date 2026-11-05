<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — help request card
//  Shows one request and emits claim, open and withdraw with request.id. The server
//  decides who may claim (canClaim); this card only says so. Claim is hidden
//  on your own request and once a request is taken, and a student who can't
//  mentor yet reads why instead of meeting a dead button (UX audit item 6).
//  The asker gets Withdraw on their own request while it is still open
//  (UX audit A2); the view asks before sending it.
//  busy disables the button while a claim is out. showClaim is false for
//  professors, who never claim. The chip says what the request is about:
//  general class help, or a challenge and, since H-14, which question. The
//  asker's name links to their profile.
// ════════════════════════════════════════════════════════════════════
import UserAvatar from '../shared/UserAvatar.vue'
defineProps({
  request: { type: Object, default: () => ({}) },
  canClaim: Boolean,
  busy: Boolean,
  own: Boolean, // the viewer asked for this help
  showClaim: { type: Boolean, default: true },
})
defineEmits(['claim', 'open', 'withdraw'])
</script>
<template>
  <article class="card">
    <div class="card-body">
      <div class="d-flex flex-wrap align-items-start gap-2">
        <span v-if="request.kind === 'general'" class="le-chip le-chip-section">
          <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
            <path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M8 11.2v.1" />
          </svg>
          General class help
        </span>
        <span v-else-if="request.challengeTitle" class="le-chip le-chip-section">
          <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 4 2 8l4 4M10 4l4 4-4 4" />
          </svg>
          <span class="visually-hidden">Challenge:</span> {{ request.challengeTitle }}
          <template v-if="request.questionNumber">· Question {{ request.questionNumber }}</template>
        </span>
        <span
          class="badge le-status text-capitalize ms-auto"
          :class="{ 'is-active': request.status !== 'open' }"
        >
          <svg class="le-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path v-if="request.status === 'resolved'" d="m3 8.5 3 3 7-7" />
            <path
              v-else-if="request.status === 'responded'"
              d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
            />
            <path
              v-else-if="request.status === 'claimed'"
              d="M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"
            />
            <circle v-else cx="8" cy="8" r="5.5" />
          </svg>
          <span class="visually-hidden">Status:</span> {{ request.status }}
        </span>
      </div>
      <h3 class="h5 mt-3 mb-2">{{ request.hintType }}</h3>
      <p class="le-request-text mb-3">
        {{ request.questionPrompt || request.actualBehaviour }}
      </p>
      <div class="le-card-foot">
        <div v-if="request.requesterName" class="le-person">
          <UserAvatar :user-id="request.requesterId" :display-name="request.requesterName" />
          <div>
            <p class="le-person-name">
              <RouterLink
                v-if="request.requesterId"
                :to="{ name: 'profile', params: { userId: request.requesterId } }"
                >{{ request.requesterName }}</RouterLink
              >
              <template v-else>{{ request.requesterName }}</template>
            </p>
            <p class="le-person-role">Requester</p>
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2 ms-auto">
          <button type="button" class="btn btn-outline-primary" @click="$emit('open', request.id)">
            Open request
          </button>
          <button
            v-if="own && request.status === 'open'"
            type="button"
            class="btn btn-outline-danger"
            :disabled="busy"
            @click="$emit('withdraw', request.id)"
          >
            Withdraw request
          </button>
          <template v-if="showClaim && request.status === 'open' && !own">
            <button
              v-if="canClaim"
              type="button"
              class="btn btn-primary"
              :disabled="busy"
              @click="$emit('claim', request.id)"
            >
              Claim request
            </button>
            <p v-else class="le-claim-reason form-text">
              Finish this challenge and get your diagnosis approved to help here.
            </p>
          </template>
        </div>
      </div>
    </div>
  </article>
</template>
