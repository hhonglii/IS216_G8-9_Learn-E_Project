<script setup>
// The hearts left. The parent names the heart that is breaking, so a reloaded
// battle shows no old losses, and the parent's --impact-delay makes the heart
// break as the monster's attack lands.
const HEART = `M12 21s-8.5-5.2-10-10.6C.9 6.3 3.4 3 6.8 3c2.2 0 4 1.2 5.2 3.2C13.2 4.2 15 3 17.2 3c3.4 0 5.9 3.3 4.8 7.4C20.5 15.8 12 21 12 21z`

defineProps({
  left: { type: Number, required: true },
  max: { type: Number, required: true },
  breaking: { type: Number, default: 0 }, // the heart that is breaking, 0 for none
})
</script>

<template>
  <p class="hearts mb-0" role="img" :aria-label="`${left} of ${max} hearts left`">
    <span v-for="index in max" :key="index" class="heart-slot">
      <svg
        class="heart"
        :class="{ 'heart--lost': index > left }"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path :d="HEART" />
      </svg>
      <template v-if="index === breaking">
        <svg class="heart-piece heart-piece--whole" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="HEART" />
        </svg>
        <svg class="heart-piece heart-piece--left" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="HEART" />
        </svg>
        <svg class="heart-piece heart-piece--right" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="HEART" />
        </svg>
      </template>
    </span>
  </p>
</template>

<style scoped>
.hearts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.heart-slot {
  position: relative;
  display: block;
  width: var(--heart-size, 1.5rem);
  height: var(--heart-size, 1.5rem);
}
.heart {
  display: block;
  width: var(--heart-size, 1.5rem);
  height: var(--heart-size, 1.5rem);
  fill: var(--le-danger);
  transition: fill var(--le-duration) ease;
}
.heart--lost {
  fill: none;
  stroke: var(--le-input-border);
  stroke-width: 2;
}
.heart-piece {
  position: absolute;
  inset: 0;
  width: var(--heart-size, 1.5rem);
  height: var(--heart-size, 1.5rem);
  fill: var(--le-danger);
  overflow: visible;
  pointer-events: none;
}
/* The heart stays whole until the attack lands, swells, then splits along a crack. */
.heart-piece--whole {
  animation: heart-swell 200ms ease-out var(--impact-delay, 0ms) both;
}
.heart-piece--left,
.heart-piece--right {
  opacity: 0;
  /* forwards, not both: the pieces must stay hidden until the heart splits. */
  animation: 720ms cubic-bezier(0.16, 1, 0.3, 1) calc(var(--impact-delay, 0ms) + 160ms) forwards;
}
.heart-piece--left {
  clip-path: polygon(0 0, 52% 0, 42% 30%, 58% 50%, 44% 72%, 50% 100%, 0 100%);
  animation-name: heart-fall-left;
}
.heart-piece--right {
  clip-path: polygon(52% 0, 100% 0, 100% 100%, 50% 100%, 44% 72%, 58% 50%, 42% 30%);
  animation-name: heart-fall-right;
}
@keyframes heart-swell {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  70% {
    opacity: 1;
    transform: scale(1.4);
    filter: brightness(1.5);
  }
  100% {
    opacity: 0;
    transform: scale(1.4);
  }
}
@keyframes heart-fall-left {
  0% {
    opacity: 1;
    transform: scale(1.4);
  }
  100% {
    opacity: 0;
    transform: translate(-0.75rem, 1.25rem) rotate(-32deg) scale(1);
  }
}
@keyframes heart-fall-right {
  0% {
    opacity: 1;
    transform: scale(1.4);
  }
  100% {
    opacity: 0;
    transform: translate(0.75rem, 1.25rem) rotate(32deg) scale(1);
  }
}
</style>
