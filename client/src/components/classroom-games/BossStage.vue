<script setup>
// The monster plus whatever is happening to it: an impact ring, sparks and the
// damage label. Changing impact.key replays the effect. All of it is decoration,
// because the battle's own text and health bar already say what happened.
import { computed } from 'vue'
import BossPortrait from './BossPortrait.vue'
import { findBoss } from './bosses.js'

const props = defineProps({
  bossId: { type: String, default: '' },
  mood: { type: String, default: 'idle' },
  impact: { type: Object, default: null }, // { key, kind: 'hit' | 'fatal', label }
})

const SPARKS = { hit: 10, fatal: 18 }
const REACH = { hit: 48, fatal: 72 } // % of the monster's width from its centre

const color = computed(() => findBoss(props.bossId).color)
// Long and short sparks alternate, so a burst looks uneven without being random.
const sparks = computed(() => {
  if (!props.impact) return []
  const { kind } = props.impact
  const count = SPARKS[kind]
  return Array.from({ length: count }, (_, index) => ({
    '--spark-angle': `${(360 / count) * index}deg`,
    '--spark-reach': `${REACH[kind] * (index % 2 ? 0.7 : 1)}cqw`,
  }))
})
</script>

<template>
  <div class="boss-stage" :style="{ '--boss-color': color }">
    <BossPortrait :boss-id="bossId" :mood="mood" />
    <div
      v-if="impact"
      :key="impact.key"
      class="boss-impact"
      :class="`boss-impact--${impact.kind}`"
      aria-hidden="true"
    >
      <span class="boss-impact__ring"></span>
      <span v-if="impact.kind === 'fatal'" class="boss-impact__ring boss-impact__ring--late"></span>
      <i
        v-for="(style, index) in sparks"
        :key="index"
        class="boss-impact__spark"
        :style="style"
      ></i>
      <span v-if="impact.label" class="boss-impact__label le-num">{{ impact.label }}</span>
    </div>
  </div>
</template>

<style scoped>
/* The effects are sized in cqw, so they scale with however large the monster is. */
.boss-stage {
  position: relative;
  container-type: inline-size;
}
.boss-impact {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.boss-impact__ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  aspect-ratio: 1;
  margin: -50% 0 0 -50%;
  border: 0.25rem solid var(--boss-color);
  border-radius: 50%;
  opacity: 0;
  animation: impact-ring 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
.boss-impact__ring--late {
  border-color: var(--le-text);
  animation-delay: 240ms;
}
.boss-impact--fatal .boss-impact__ring {
  animation-duration: 760ms;
}
.boss-impact__spark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2cqw;
  height: 8cqw;
  margin: -4cqw 0 0 -1cqw;
  border-radius: var(--le-radius-pill);
  background: var(--boss-color);
  opacity: 0;
  animation: impact-spark 460ms cubic-bezier(0.16, 1, 0.3, 1);
}
.boss-impact__spark:nth-child(3n) {
  background: var(--le-text);
}
.boss-impact--fatal .boss-impact__spark {
  height: 11cqw;
  animation-duration: 820ms;
}
.boss-impact__label {
  position: absolute;
  bottom: 82%;
  left: 50%;
  color: var(--le-text);
  font-size: clamp(1rem, 10cqw, 2.25rem);
  font-weight: 800;
  line-height: 1;
  /* A dark outline keeps the text readable over the monster's white hit flash. */
  -webkit-text-stroke: 0.22em var(--le-dark);
  paint-order: stroke fill;
  white-space: nowrap;
  opacity: 0;
  animation: impact-label 900ms cubic-bezier(0.16, 1, 0.3, 1);
}
.boss-impact--fatal .boss-impact__label {
  font-size: clamp(1rem, 9cqw, 2rem);
  animation-duration: 1400ms;
}
@keyframes impact-ring {
  0% {
    opacity: 0.9;
    transform: scale(0.2);
  }
  100% {
    opacity: 0;
    transform: scale(1.35);
  }
}
@keyframes impact-spark {
  0% {
    opacity: 1;
    transform: rotate(var(--spark-angle)) translateY(-14cqw) scaleY(1.4);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--spark-angle)) translateY(calc(var(--spark-reach) * -1)) scaleY(0.3);
  }
}
@keyframes impact-label {
  0% {
    opacity: 0;
    transform: translate(-50%, 0.75rem) scale(0.7);
  }
  18% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.15);
  }
  70% {
    opacity: 1;
    transform: translate(-50%, -1rem) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -1.75rem) scale(1);
  }
}
</style>
