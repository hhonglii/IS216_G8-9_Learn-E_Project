<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — Take a break
//  The optional games library: a carousel to pick a game. Each game shows the
//  player's own best score; there is no shared leaderboard (decision H-16). ?game=<id> in the URL opens one game, so links and the Back
//  button work; an unknown id shows the library. Leaving a game returns focus
//  to the library title. The games are extras outside the course material
//  (docs/COURSE_SCOPE_AUDIT.md).
// ════════════════════════════════════════════════════════════════════
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { games } from '../games/registry.js'
import GameCarousel from '../games/GameCarousel.vue'

const route = useRoute()
const router = useRouter()
const libraryTitle = ref(null)
// Query-based selection supports direct links and browser history; unknown ids show the library.
const activeGame = computed(() => games.find((game) => game.id === route.query.game))
const selectedGameId = ref(activeGame.value?.id ?? games[0]?.id)
watch(activeGame, (game) => {
  if (game) selectedGameId.value = game.id
})

async function returnToLibrary() {
  await router.push({ name: 'take-a-break' })
  // The title only exists after the active game's component has unmounted.
  await nextTick()
  libraryTitle.value?.focus()
}
</script>

<template>
  <component v-if="activeGame" :is="activeGame.component" @exit="returnToLibrary" />
  <section v-else class="break-library" aria-labelledby="take-a-break-title">
    <div class="library-heading">
      <div>
        <p class="library-note"><span aria-hidden="true"></span> A little room to reset</p>
        <h2 id="take-a-break-title" ref="libraryTitle" tabindex="-1">Take a break<span>.</span></h2>
        <p class="library-intro">Take a break, have a kitkat.</p>
      </div>
      <span class="library-count"
        >{{ games.length }} {{ games.length === 1 ? 'game' : 'games' }}
        <span class="library-count-extra">to explore</span></span
      >
    </div>
    <GameCarousel v-model="selectedGameId" :games="games" />
    <p class="library-footer">No grades. A little challenge. A fresh perspective.</p>
  </section>
</template>

<style scoped>
.break-library {
  padding: 0.25rem 0 2rem;
}
.library-heading {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1rem;
}
.library-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  color: var(--le-muted);
  font-size: 0.875rem;
}
.library-note span {
  width: 0.45rem;
  height: 0.45rem;
  background: var(--le-violet);
  border-radius: 50%;
}
.library-heading h2 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.055em;
  line-height: 1.1;
}
.library-heading h2 span {
  color: var(--le-violet);
}
.library-intro {
  margin: 0.5rem 0 0;
  color: var(--le-muted);
  font-size: 0.9375rem;
}
.library-count {
  flex: none;
  margin-bottom: 0.2rem;
  color: var(--le-muted);
  font-size: 0.875rem;
}
.library-footer {
  margin: 2rem 0 0;
  padding-top: 1rem;
  color: var(--le-muted);
  font-size: 0.875rem;
}
@media (max-width: 575px) {
  .library-heading {
    display: block;
    margin-bottom: 0.75rem;
  }
  .library-note {
    padding-right: 4rem;
    font-size: 0.75rem;
  }
  .library-count {
    position: absolute;
    top: 0;
    right: 0;
    font-size: 0.75rem;
  }
  .library-count-extra {
    display: none;
  }
  .break-library {
    padding-top: 0;
  }
}
@media (max-width: 575px) and (max-height: 700px) {
  .library-note {
    display: none;
  }
  .library-count {
    top: 0.5rem;
  }
  .library-heading h2 {
    padding-right: 3.75rem;
  }
  .library-intro {
    font-size: 0.875rem;
  }
}
</style>
