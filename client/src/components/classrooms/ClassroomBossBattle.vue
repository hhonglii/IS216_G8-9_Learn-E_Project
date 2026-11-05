<script setup>
// The classroom page's Boss Battle section (H-20; it was two links in the header
// until 2026-11-06). A student sees it only while a battle is published: the
// professor's monster in its idle pose beside the battle's name, its hearts and
// question count, how far the student got, and a Play link to the battle page.
// The owning professor always sees it, so the editor is one click away even
// before a battle exists or when the battle couldn't be loaded. It all sits in a
// lair lit in the monster's own colour, like the battle page's arena.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import BossPortrait from '../classroom-games/BossPortrait.vue'
import HeartsRow from '../classroom-games/HeartsRow.vue'
import { findBoss } from '../classroom-games/bosses.js'

const props = defineProps({
  classroomId: { type: String, required: true },
  isOwningProfessor: { type: Boolean, default: false },
  // The classroom game reply, or null while it loads or if it failed.
  gameInfo: { type: Object, default: null },
})
const game = computed(() => props.gameInfo?.game ?? null)
const shown = computed(
  () => props.isOwningProfessor || (props.gameInfo?.viewer === 'student' && Boolean(game.value)),
)
// Only a reply that says so counts as "no battle"; a failed load still offers Edit.
const noBattleYet = computed(() => props.gameInfo?.viewer === 'professor' && !game.value)
const boss = computed(() => (game.value ? findBoss(game.value.bossId) : null))
// The student's reply counts the questions; the professor's lists them.
const questionCount = computed(
  () => game.value?.questionCount ?? game.value?.questions?.length ?? 0,
)
const status = computed(() => {
  if (props.isOwningProfessor) {
    return game.value?.status === 'published'
      ? 'Published. Your students can play it now.'
      : "Draft. Students can't see it until you publish it."
  }
  if (props.gameInfo?.play?.status === 'in-progress') return 'You have a battle in progress.'
  if (props.gameInfo?.defeated) return "You've beaten this boss. Play again any time."
  return 'Answer every question before your hearts run out.'
})
const battlePage = computed(() => ({
  name: 'classroom-games',
  params: { classroomId: props.classroomId },
}))
</script>

<template>
  <section v-if="shown" class="card mt-4 section-games" aria-labelledby="boss-battle-heading">
    <div class="card-body">
      <div class="le-card-head">
        <span class="le-section-icon" aria-hidden="true">
          <svg class="le-icon" viewBox="0 0 16 16">
            <path
              d="M8 13.5S2.5 10 2.5 6a2.75 2.75 0 0 1 5.5-1 2.75 2.75 0 0 1 5.5 1c0 4-5.5 7.5-5.5 7.5z"
            />
          </svg>
        </span>
        <h2 id="boss-battle-heading" class="h4 mb-0">Boss Battle</h2>
      </div>
      <div class="boss-battle-lair" :style="boss ? { '--boss-color': boss.color } : null">
        <template v-if="game">
          <div class="boss-battle-portrait">
            <BossPortrait :boss-id="game.bossId" />
          </div>
          <div class="boss-battle-info">
            <p class="boss-battle-name mb-1">{{ boss.name }}</p>
            <h3 class="h3 mb-3">{{ game.title || 'Untitled battle' }}</h3>
            <div class="boss-battle-stats mb-3">
              <div aria-hidden="true">
                <HeartsRow :left="game.hearts" :max="game.hearts" />
              </div>
              <span>
                {{ game.hearts }} {{ game.hearts === 1 ? 'heart' : 'hearts' }} · {{ questionCount }}
                {{ questionCount === 1 ? 'question' : 'questions' }}
              </span>
            </div>
            <p class="text-body-secondary mb-3">{{ status }}</p>
            <RouterLink v-if="isOwningProfessor" class="btn btn-outline-primary" :to="battlePage">
              Edit Boss Battle
            </RouterLink>
            <RouterLink v-else class="btn btn-primary btn-lg" :to="battlePage">
              Play<span class="visually-hidden"> the Boss Battle</span>
            </RouterLink>
          </div>
        </template>
        <div v-else class="boss-battle-empty">
          <p v-if="noBattleYet" class="text-body-secondary mb-3">
            No Boss Battle yet. Build one for the class to play.
          </p>
          <RouterLink class="btn btn-outline-primary" :to="battlePage">
            {{ noBattleYet ? 'Create Boss Battle' : 'Edit Boss Battle' }}
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The monster and its details sit side by side in the middle of the lair, over a
   faint dot grid that fades out at the edges; on a phone they stack. With no
   battle yet the lair falls back to the section's purple. */
.boss-battle-lair {
  --boss-color: var(--section-accent);
  position: relative;
  isolation: isolate;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1.5rem 3rem;
  margin-top: 1rem;
  padding: 2rem 1.5rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--boss-color) 30%, transparent);
  border-radius: var(--le-radius-input);
  background:
    radial-gradient(
      ellipse 60% 90% at 50% 45%,
      color-mix(in srgb, var(--boss-color) 14%, transparent),
      transparent 70%
    ),
    var(--section-tint);
}
.boss-battle-lair::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image: radial-gradient(
    color-mix(in srgb, var(--boss-color) 35%, transparent) 1px,
    transparent 1.5px
  );
  background-size: 22px 22px;
  mask-image: radial-gradient(ellipse at center, black, transparent 75%);
}
/* The floor glow sits under the monster's feet; the top padding leaves room for its float. */
.boss-battle-portrait {
  position: relative;
  width: 11rem;
  padding-top: 0.5rem;
}
.boss-battle-portrait::after {
  content: '';
  position: absolute;
  left: -25%;
  right: -25%;
  bottom: -0.75rem;
  z-index: -1;
  height: 3rem;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--boss-color) 45%, transparent),
    transparent
  );
}
.boss-battle-info {
  flex: 0 1 22rem;
  min-width: 0;
}
.boss-battle-name {
  /* Lightened toward the text colour so every boss's name stays readable. */
  color: color-mix(in srgb, var(--boss-color) 60%, var(--le-text));
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.boss-battle-stats {
  --heart-size: 1.1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}
.boss-battle-empty {
  text-align: center;
}
@media (max-width: 575.98px) {
  .boss-battle-info {
    text-align: center;
  }
  .boss-battle-stats {
    justify-content: center;
  }
}
</style>
