<script setup>
defineOptions({ name: 'TwentyFortyEightCover' })
defineProps({ compact: Boolean })
const numbers = [2, 0, 4, 0, 4, 8, 16, 0, 8, 32, 64, 128, 16, 64, 256, 2048]
</script>

<template>
  <div class="cover-2048" :class="{ 'is-compact': compact }" aria-hidden="true">
    <div class="cover-stage">
      <div class="motherboard-traces"></div>
      <div class="cover-copy">
        <strong>2048</strong>
        <p>Neon numbers.<br />Clear thinking.</p>
      </div>
      <div class="mini-board">
        <i class="board-hazard hazard-top"></i>
        <i class="board-hazard hazard-bottom"></i>
        <div
          v-for="(number, index) in numbers"
          :key="index"
          class="mini-tile"
          :class="['mini-' + number, { empty: !number }]"
        >
          <span>{{ number || '' }}</span>
        </div>
      </div>
      <span class="cover-footnote"><i></i>Slide. Merge. Repeat.</span>
    </div>
  </div>
</template>

<style scoped>
.cover-2048 {
  container-type: inline-size;
  background: #0b0e14;
  color: #eaf7ff;
}
.cover-stage {
  position: relative;
  isolation: isolate;
  min-height: 19rem;
  overflow: hidden;
  background: radial-gradient(ellipse at 72% 54%, #00f0ff0c, transparent 61%);
}
.motherboard-traces {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(90deg, #65849913 1px, transparent 1px),
    linear-gradient(#65849913 1px, transparent 1px),
    radial-gradient(circle, #00f0ff39 1px, transparent 1.5px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse at 77% 52%, black, transparent 75%);
}
.cover-copy {
  position: absolute;
  top: 3.15rem;
  left: 1.75rem;
  z-index: 1;
}
.cover-copy > strong {
  display: block;
  margin: 0 0 0.85rem;
  color: #eaf7ff;
  font-size: clamp(4.5rem, 15cqw, 6.375rem);
  font-weight: 750;
  letter-spacing: -0.07em;
  line-height: 0.95;
}
.cover-copy > p {
  margin: 0;
  color: #a1b3c6;
  font-size: clamp(0.875rem, 2.8cqw, 1.0625rem);
  line-height: 1.45;
}
.mini-board {
  /* The cover projects decoratively; the playable board keeps standard 4x4 screen directions. */
  position: absolute;
  top: 50%;
  left: 70%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  width: clamp(8.5rem, 38cqw, 14.6875rem);
  aspect-ratio: 1;
  transform: translate(-50%, -50%) rotateX(60deg) rotateZ(-45deg);
  transform-style: preserve-3d;
}
.mini-board::before {
  content: '';
  position: absolute;
  inset: -11px;
  border: 1px solid #3b4b60;
  background:
    repeating-linear-gradient(0deg, transparent 0 24px, #42627a29 24px 25px),
    repeating-linear-gradient(90deg, transparent 0 24px, #42627a29 24px 25px), #141d29;
  box-shadow:
    0 0 0 3px #111a26,
    0 0 0 4px #29394a,
    -14px 18px 24px #0009;
  transform: translateZ(-4px);
}
.board-hazard {
  position: absolute;
  left: 15%;
  width: 42%;
  height: 4px;
  background: repeating-linear-gradient(45deg, #ffb800aa 0 3px, #24261d 3px 6px);
  transform: translateZ(-2px);
}
.hazard-top {
  top: -8px;
}
.hazard-bottom {
  bottom: -8px;
  left: auto;
  right: 15%;
}
.mini-tile {
  --tile-accent: #00f0ff;
  --tile-depth: 10px;
  position: relative;
  display: grid;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--tile-accent) 75%, #333d52);
  border-radius: 2px;
  background: color-mix(in srgb, var(--tile-accent) 16%, #1e2430);
  color: var(--tile-accent);
  box-shadow: inset 0 0 0 2px #0b0e1433;
  transform: translateZ(var(--tile-depth));
  transform-style: preserve-3d;
}
.mini-tile::before,
.mini-tile::after {
  content: '';
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--tile-accent) 25%, #1e2430);
  backface-visibility: hidden;
}
.mini-tile::before {
  top: 100%;
  right: -1px;
  left: -1px;
  height: var(--tile-depth);
  border-top: 0;
  background: color-mix(in srgb, var(--tile-accent) 17%, #111923);
  transform-origin: top;
  transform: rotateX(-90deg);
}
.mini-tile::after {
  top: -1px;
  bottom: -1px;
  left: 100%;
  width: var(--tile-depth);
  border-left: 0;
  background: color-mix(in srgb, var(--tile-accent) 9%, #111923);
  transform-origin: left;
  transform: rotateY(90deg);
}
.mini-tile > span {
  position: absolute;
  top: 50%;
  left: 50%;
  font-family: var(--bs-font-monospace);
  font-size: clamp(0.625rem, 2.4cqw, 0.9375rem);
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  overflow-wrap: normal;
  transform: translate(-50%, -50%) rotateZ(45deg) scaleY(2);
}
.mini-tile.empty {
  --tile-accent: #333d52;
  --tile-depth: 2px;
  background: #1e2430;
}
.mini-4 {
  --tile-accent: #29dfff;
}
.mini-8 {
  --tile-accent: #53c6ff;
}
.mini-16 {
  --tile-accent: #78a9ff;
}
.mini-32 {
  --tile-accent: #9683ff;
}
.mini-64 {
  --tile-accent: #b361f5;
}
.mini-128,
.mini-256 {
  --tile-accent: #c452f4;
}
.mini-2048 {
  --tile-accent: #b537f2;
  --tile-depth: 15px;
  border-color: #dc91ff;
  background: #542176;
  color: #f1ddff;
  box-shadow:
    inset 0 0 0 2px #b537f222,
    0 0 17px #b537f22b;
}
.mini-2048 > span {
  font-size: clamp(0.4375rem, 1.65cqw, 0.6875rem);
}
.cover-footnote {
  position: absolute;
  bottom: 1.3rem;
  left: 1.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #8194ab;
  font-size: 0.6875rem;
}
.cover-footnote i {
  width: 12px;
  height: 3px;
  background: #ffb800;
}
@container (max-width: 450px) {
  .cover-stage {
    min-height: 20.625rem;
  }
  .cover-copy {
    top: 1.5rem;
    left: 1.25rem;
  }
  .cover-copy > strong {
    margin-bottom: 0.65rem;
    font-size: 4.5rem;
  }
  .mini-board {
    top: 71%;
    left: 56%;
    width: clamp(8rem, 54cqw, 12.8125rem);
    gap: 5px;
  }
  .cover-footnote {
    left: 1.25rem;
  }
}
.cover-2048.is-compact,
.is-compact .cover-stage {
  height: 100%;
  min-height: 0;
}
.is-compact .cover-copy {
  top: 15%;
  left: 6%;
}
.is-compact .cover-copy > strong {
  margin-bottom: 0.4rem;
  font-size: clamp(2rem, 13cqw, 3rem);
}
.is-compact .cover-copy > p {
  font-size: clamp(0.625rem, 3cqw, 0.75rem);
  line-height: 1.35;
}
.is-compact .mini-board {
  top: 52%;
  left: 73%;
  width: clamp(4.5rem, 31cqw, 6.5rem);
  gap: 4px;
}
.is-compact .mini-tile > span {
  font-size: 0.5rem;
}
.is-compact .mini-2048 > span {
  font-size: 0.375rem;
}
.is-compact .cover-footnote {
  bottom: 8%;
  left: 6%;
  font-size: 0.5rem;
}
</style>
