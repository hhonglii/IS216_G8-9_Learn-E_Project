<script setup>
defineProps({ compact: Boolean })
const blocks = [
  [0, 17, 'i'],
  [1, 17, 'i'],
  [2, 17, 'i'],
  [3, 17, 'i'],
  [4, 17, 't'],
  [5, 17, 't'],
  [6, 17, 't'],
  [7, 17, 'o'],
  [8, 17, 'o'],
  [0, 16, 'j'],
  [0, 15, 'j'],
  [1, 15, 'j'],
  [2, 15, 'j'],
  [4, 16, 't'],
  [5, 16, 't'],
  [5, 15, 't'],
  [6, 16, 't'],
  [7, 16, 'o'],
  [8, 16, 'o'],
  [1, 14, 's'],
  [2, 14, 's'],
  [2, 13, 's'],
  [3, 13, 's'],
  [6, 15, 'l'],
  [7, 15, 'l'],
  [8, 15, 'l'],
  [8, 14, 'l'],
  [4, 3, 't'],
  [3, 4, 't'],
  [4, 4, 't'],
  [5, 4, 't'],
]
</script>
<template>
  <div class="tetris-cover" :class="{ 'is-compact': compact }" aria-hidden="true">
    <div class="tetris-cover-copy">
      <span>Neon circuit</span><strong>Tetris</strong>
      <p>Find your rhythm.<br />Clear a little space.</p>
    </div>
    <div class="cover-mini-board">
      <svg viewBox="0 0 110 198" fill="none">
        <defs>
          <pattern id="tetris-cover-grid" width="11" height="11" patternUnits="userSpaceOnUse">
            <rect
              x=".5"
              y=".5"
              width="10"
              height="10"
              stroke="#31465b"
              stroke-opacity=".35"
              stroke-width=".5"
            />
          </pattern>
        </defs>
        <rect width="110" height="198" fill="#080d14" />
        <rect width="110" height="198" fill="url(#tetris-cover-grid)" />
        <rect
          v-for="([x, y, type], index) in blocks"
          :key="index"
          :x="x * 11 + 1"
          :y="y * 11 + 1"
          width="9"
          height="9"
          rx=".8"
          :class="`cover-piece-${type}`"
        />
        <g stroke="#c273ff" stroke-width=".7" stroke-dasharray="1.8 1.8" opacity=".6">
          <rect x="45" y="133" width="9" height="9" />
          <rect x="34" y="144" width="9" height="9" />
          <rect x="45" y="144" width="9" height="9" />
          <rect x="56" y="144" width="9" height="9" />
        </g>
      </svg>
    </div>
    <div class="tetris-cover-foot"><i></i> Stack. Rotate. Reset.</div>
  </div>
</template>
<style scoped>
.tetris-cover {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 19rem;
  background:
    radial-gradient(ellipse at 65% 50%, #c273ff0d, transparent 55%),
    repeating-linear-gradient(0deg, transparent 0 31px, #29415612 31px 32px),
    repeating-linear-gradient(90deg, transparent 0 31px, #29415612 31px 32px), #0b0e14;
  color: #e1eef4;
}
.tetris-cover-copy {
  position: absolute;
  z-index: 1;
  top: 40px;
  left: 24px;
}
.tetris-cover-copy > span {
  color: #00f0ff;
  font: 10px var(--bs-font-monospace);
}
.tetris-cover-copy strong {
  display: block;
  margin-top: 16px;
  font: 700 clamp(42px, 9cqw, 62px)/1 var(--bs-body-font-family);
  letter-spacing: -0.055em;
}
.tetris-cover-copy p {
  margin: 16px 0 0;
  color: #a1b4c4;
  font-size: 14px;
  line-height: 1.6;
}
.cover-mini-board {
  position: absolute;
  top: 24px;
  right: 10%;
  width: 135px;
  padding: 5px;
  border: 1px solid #526078;
  border-radius: 4px;
  background: #172334;
  transform: rotate(9deg);
  box-shadow:
    10px 14px 0 #04070b50,
    0 0 25px #00f0ff0a;
}
.cover-mini-board svg {
  display: block;
  width: 100%;
}
.cover-mini-board rect[class] {
  stroke-width: 0.6;
}
.cover-piece-i {
  fill: #154357;
  stroke: #00f0ff;
}
.cover-piece-t {
  fill: #4b2860;
  stroke: #c273ff;
}
.cover-piece-o {
  fill: #4a4021;
  stroke: #ffe06b;
}
.cover-piece-j {
  fill: #253763;
  stroke: #759cff;
}
.cover-piece-s {
  fill: #14493d;
  stroke: #00f5b8;
}
.cover-piece-l {
  fill: #503421;
  stroke: #ffad59;
}
.tetris-cover-foot {
  position: absolute;
  z-index: 2;
  bottom: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a8b7;
  font-size: 11px;
}
.tetris-cover-foot > i {
  width: 12px;
  height: 3px;
  background: #ffb800;
}
@container (max-width:450px) {
  .tetris-cover {
    min-height: 20.625rem;
  }
  .tetris-cover-copy {
    top: 30px;
    left: 20px;
  }
  .tetris-cover-copy strong {
    font-size: 49px;
  }
  .cover-mini-board {
    top: 60px;
    right: 8%;
    width: 123px;
  }
  .tetris-cover-copy p {
    margin-top: 14px;
    max-width: 20ch;
    font-size: 12px;
  }
  .tetris-cover-foot {
    left: 20px;
  }
}
@container (max-width:320px) {
  .cover-mini-board {
    right: 6%;
    top: 80px;
    width: 110px;
  }
  .tetris-cover-copy strong {
    font-size: 44px;
  }
  .tetris-cover-copy p {
    max-width: 20ch;
    font-size: 11px;
  }
}
.tetris-cover.is-compact {
  height: 100%;
  min-height: 0;
}
.is-compact .tetris-cover-copy {
  top: 12%;
  left: 6%;
}
.is-compact .tetris-cover-copy > span {
  font-size: 0.5rem;
}
.is-compact .tetris-cover-copy strong {
  margin-top: 0.4rem;
  font-size: clamp(1.75rem, 10cqw, 2.25rem);
}
.is-compact .tetris-cover-copy p {
  margin-top: 0.4rem;
  font-size: 0.625rem;
  line-height: 1.35;
}
.is-compact .cover-mini-board {
  top: 10%;
  right: 11%;
  width: min(19cqw, calc(var(--game-cover-height) * 0.42));
  padding: 3px;
}
.is-compact .tetris-cover-foot {
  display: none;
}
</style>
