<script setup>
// One monster. Everything that changes is bound from the chosen boss, so adding a
// monster to bosses.js is all it takes to offer a new look.
import { computed } from 'vue'
import { findBoss } from './bosses.js'

const props = defineProps({
  bossId: { type: String, default: '' },
  // Empty when a caption beside the picture already names the monster.
  decorative: { type: Boolean, default: false },
  mood: { type: String, default: 'idle' }, // idle | hurt | attack | dying | defeated | gloat
})
const boss = computed(() => findBoss(props.bossId))
</script>

<template>
  <img
    class="boss"
    :src="boss.image"
    :alt="decorative ? '' : boss.name"
    :class="`boss--${mood}`"
    :style="{ '--boss-color': boss.color }"
  />
</template>

<style scoped>
.boss {
  display: block;
  width: 100%;
  height: auto;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--boss-color) 45%, transparent));
}
.boss--idle {
  animation: boss-float 3.2s ease-in-out infinite;
}
.boss--hurt {
  animation: boss-hurt 480ms linear;
}
.boss--attack {
  animation: boss-attack 480ms ease-in-out;
}
/* Three white flashes in 1.3 seconds, staying under three flashes per second. */
.boss--dying {
  animation: boss-dying 1300ms linear both;
}
.boss--defeated {
  opacity: 0.45;
  filter: grayscale(1);
  transform: rotate(8deg) translateY(3%);
}
.boss--gloat {
  filter: drop-shadow(0 0 22px color-mix(in srgb, var(--boss-color) 75%, transparent));
  animation: boss-gloat 2.4s ease-in-out infinite;
}
@keyframes boss-float {
  50% {
    transform: translateY(-2.5%);
  }
}
/* A pure white silhouette held for a moment sells the hit before the recoil. Moves
   are in % of the monster, so a big monster recoils as far for its size as a small one. */
@keyframes boss-hurt {
  0%,
  22% {
    transform: translate(-8%, -2%) rotate(-6deg) scale(0.95);
    filter: brightness(0) invert(1);
  }
  24% {
    transform: translate(-8%, -2%) rotate(-6deg) scale(0.95);
    filter: brightness(1.5);
  }
  48% {
    transform: translateX(4.5%) rotate(3deg);
    filter: brightness(1.2);
  }
  72% {
    transform: translateX(-2%) rotate(-1deg);
    filter: brightness(1);
  }
  100% {
    transform: none;
    filter: brightness(1);
  }
}
/* It rears back, then lunges down at the hearts below it. */
@keyframes boss-attack {
  18% {
    transform: translateY(-4%) scale(0.94);
  }
  42% {
    transform: translateY(9%) scale(1.18);
  }
}
@keyframes boss-dying {
  0%,
  8% {
    transform: translate(-8%, -2%) rotate(-6deg) scale(0.95);
    filter: brightness(0) invert(1) blur(0);
  }
  10% {
    transform: translate(3.5%, 0) rotate(2deg);
    filter: brightness(1.3) invert(0) blur(0);
  }
  20% {
    transform: translate(-3.5%, 1%) rotate(-3deg);
  }
  30% {
    transform: translate(3.5%, -1%) rotate(3deg);
    filter: brightness(1.3) invert(0) blur(0);
  }
  38%,
  44% {
    transform: translate(-2.5%, 0) rotate(-4deg) scale(0.98);
    filter: brightness(0) invert(1) blur(0);
  }
  46% {
    transform: translate(2.5%, 1%) rotate(4deg);
    filter: brightness(1.3) invert(0) blur(0);
  }
  58% {
    transform: translate(-2.5%, 0) rotate(-5deg);
  }
  70% {
    transform: translate(2.5%, 2%) rotate(5deg);
    filter: brightness(1.3) invert(0) blur(0);
  }
  76%,
  82% {
    transform: scale(1.06);
    filter: brightness(0) invert(1) blur(0);
  }
  84% {
    opacity: 1;
    transform: scale(1.12);
    filter: brightness(2.4) invert(0) blur(5px);
  }
  100% {
    opacity: 0.45;
    transform: rotate(8deg) translateY(3%);
    filter: brightness(1) invert(0) blur(0) grayscale(1);
  }
}
@keyframes boss-gloat {
  50% {
    transform: scale(1.07) translateY(-1.5%);
  }
}
</style>
