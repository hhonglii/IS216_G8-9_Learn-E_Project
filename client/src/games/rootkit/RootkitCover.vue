<script setup>
defineProps({ compact: Boolean })
</script>

<template>
  <div class="rootkit-cover" :class="{ 'is-compact': compact }" aria-hidden="true">
    <div class="cover-menubar">
      <span>rk_ <b>RootKit OS</b></span
      ><span>00:00</span>
    </div>
    <div class="cover-wordmark"><span>ACCESS DENIED</span><strong>First, coffee.</strong></div>
    <div class="cover-terminal">
      <div class="cover-titlebar"><i></i><i></i><i></i><span>bash_terminal.exe</span></div>
      <div class="cover-code">
        <span>student@rootkit:~ $</span> sudo brew --espresso<br /><em
          >[403] coffee behind firewall</em
        ><br /><span>&gt;</span> Your move.<b class="cover-cursor">_</b>
      </div>
    </div>
    <div class="cover-note">
      <span>Memo / 03</span><strong>00000011</strong><small>A shift in perspective.</small>
    </div>
    <div class="cover-dock"><span>&gt;_</span><span>≡</span><span>⌁</span><span>▥</span></div>
  </div>
</template>

<style scoped>
.rootkit-cover {
  position: relative;
  min-height: 19rem;
  overflow: hidden;
  background: #0f171d;
  color: #00f5d4;
  font-family: var(--bs-font-monospace);
}
.rootkit-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(transparent 0 3px, #0002 3px 4px);
}
.cover-menubar {
  display: flex;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid #28403f;
  color: #8ca7a4;
  font-size: 9px;
}
.cover-menubar b {
  margin-left: 8px;
  color: #d8f1ed;
  font-weight: 500;
}
.cover-wordmark {
  position: absolute;
  top: 61px;
  left: 24px;
}
.cover-wordmark > span {
  display: block;
  margin-bottom: 8px;
  color: #ff6487;
  font-size: 8px;
  letter-spacing: 0.16em;
}
.cover-wordmark strong {
  color: #d8f1ed;
  font: 600 27px/1.1 var(--bs-body-font-family);
  letter-spacing: -0.04em;
}
.cover-terminal {
  position: absolute;
  top: 125px;
  left: 24px;
  width: 70%;
  max-width: 340px;
  overflow: hidden;
  border: 1px solid #3a5f5a;
  border-radius: 7px;
  background: #101d23ed;
  box-shadow: 0 12px 28px #0004;
  transform: rotate(-3deg);
}
.cover-titlebar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 9px;
  border-bottom: 1px solid #28403f;
}
.cover-titlebar i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff625a;
}
.cover-titlebar i:nth-child(2) {
  background: #ffbd44;
}
.cover-titlebar i:nth-child(3) {
  background: #00ca4e;
}
.cover-titlebar > span {
  margin-left: 7px;
  color: #8ca7a4;
  font-size: 7px;
}
.cover-code {
  padding: 12px;
  color: #d8f1ed;
  font-size: 7px;
  line-height: 2;
  white-space: nowrap;
}
.cover-code > span {
  color: #00f5d4;
}
.cover-code em {
  color: #ff6487;
  font-style: normal;
}
.cover-cursor {
  margin-left: 3px;
  color: #00f5d4;
}
.cover-note {
  position: absolute;
  right: 7%;
  top: 75px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px;
  border: 1px solid #71592c;
  background: #30291b;
  color: #ffce75;
  transform: rotate(7deg);
}
.cover-note > span {
  font-size: 6px;
}
.cover-note strong {
  font-size: 14px;
  letter-spacing: 0.06em;
}
.cover-note small {
  font-size: 6px;
}
.cover-dock {
  position: absolute;
  bottom: 10px;
  right: 18px;
  display: flex;
  gap: 15px;
  align-items: center;
  padding: 7px 12px;
  border: 1px solid #28403f;
  border-radius: 7px;
  background: #16242a;
  font-size: 11px;
}
.cover-dock span:nth-child(even) {
  color: #ff6487;
}
@container (max-width: 450px) {
  .rootkit-cover {
    min-height: 20.625rem;
  }
}
.rootkit-cover.is-compact {
  height: 100%;
  min-height: 0;
}
.is-compact .cover-menubar {
  padding: 0.3rem 6%;
  font-size: 0.375rem;
}
.is-compact .cover-wordmark {
  top: 18%;
  left: 6%;
  line-height: 1;
}
.is-compact .cover-wordmark > span {
  margin-bottom: 0.125rem;
  font-size: 0.375rem;
}
.is-compact .cover-wordmark strong {
  font-size: clamp(1.125rem, 8cqw, 1.5rem);
}
.is-compact .cover-terminal {
  top: 54%;
  left: 6%;
  width: 70%;
  border-radius: 4px;
}
.is-compact .cover-titlebar {
  gap: 2px;
  padding: 3px;
}
.is-compact .cover-titlebar i {
  width: 3px;
  height: 3px;
}
.is-compact .cover-titlebar > span {
  margin-left: 3px;
  font-size: 4px;
}
.is-compact .cover-code {
  padding: 3px 6px;
  font-size: 4.5px;
  line-height: 1.5;
}
.is-compact .cover-note {
  top: 28%;
  right: 6%;
  gap: 3px;
  padding: 8px;
}
.is-compact .cover-note > span,
.is-compact .cover-note small {
  font-size: 4.5px;
}
.is-compact .cover-note strong {
  font-size: 10px;
}
.is-compact .cover-dock {
  display: none;
}
</style>
