<script setup>
// ════════════════════════════════════════════════════════════════════
//  Learn-E — the Boss Battle screens: intro, battle and the ending
//  The same component runs a real battle and the professor's preview. The
//  engine prop decides who marks answers: the server, or the browser's copy.
//  Course techniques only (decision H-17): a status line tells screen readers
//  what happened, Continue is an #id link back to the question, and every effect
//  is a CSS class switched on a timer. The sound in useBattleAudio.js is the one
//  accepted exception.
// ════════════════════════════════════════════════════════════════════
import { computed, onBeforeUnmount, ref } from 'vue'
import BattleSoundControls from './BattleSoundControls.vue'
import BossPortrait from './BossPortrait.vue'
import BossStage from './BossStage.vue'
import HeartsRow from './HeartsRow.vue'
import { findBoss } from './bosses.js'
import { useBattleAudio } from './useBattleAudio.js'

// One attack: a bolt flies for IMPACT_MS, then the hit lands. The numbers and the
// status line update as soon as the server answers; only their on-screen change
// waits, through CSS, for the impact. Each sound is started beside the visual it
// belongs to, so the two cannot drift apart.
const IMPACT_MS = 260
const COUNTER_LEAD_MS = 60 // the monster starts its lunge before it fires
const RECOVER_MS = 480
const DYING_MS = 1300
const SHAKE_MS = 480
const BREAK_MS = 1400 // how long a lost heart's pieces stay on screen

const props = defineProps({
  game: { type: Object, required: true }, // { title, bossId, hearts, questionCount }
  engine: { type: Object, required: true }, // { start(), answer(playId, questionId, optionId, answerCount) }
  initialPlay: { type: Object, default: null },
  alreadyDefeated: { type: Boolean, default: false },
  errorMessage: { type: Function, required: true },
})
const emit = defineEmits(['stale'])

const play = ref(props.initialPlay)
const question = ref(props.initialPlay?.currentQuestion ?? null)
const feedback = ref(null) // { correct, explanation, optionId }
const busy = ref(false)
const error = ref('')
const mood = ref('idle')
const beaten = ref(props.alreadyDefeated)
const announcement = ref('') // read out by screen readers, never shown
const round = ref(0) // changes with each question, so the next one animates in
const strike = ref(null) // the bolt in flight: { key, kind }
const impact = ref(null) // what BossStage shows: { key, kind, label }
const shake = ref('') // '' | 'hit' | 'hurt' | 'fatal'
const breakingHeart = ref(0) // the number of the heart that is breaking, 0 for none
const audio = useBattleAudio()
const soundControls = computed(() => ({
  supported: audio.supported.value,
  muted: audio.muted.value,
  musicMuted: audio.musicMuted.value,
  onToggleEffects: audio.toggleMute,
  onToggleMusic: audio.toggleMusic,
}))

const bossName = computed(() => findBoss(props.game.bossId).name)
const bossColor = computed(() => findBoss(props.game.bossId).color)
const ended = computed(() => !!play.value && play.value.status !== 'in-progress')
const screen = computed(() => {
  if (!play.value) return 'intro'
  return ended.value && !feedback.value ? 'end' : 'battle'
})
const hitsLanded = computed(() => play.value.totalQuestions - play.value.remaining)
const healthPercent = computed(() =>
  Math.round((play.value.remaining / play.value.totalQuestions) * 100),
)
const resultLine = computed(() =>
  feedback.value?.correct
    ? `Direct hit on ${bossName.value}!`
    : `Not quite. ${bossName.value} strikes back and you lose a heart. This question will come back.`,
)
const won = computed(() => play.value?.status === 'won')
const endHeading = computed(() => (won.value ? 'Boss defeated!' : 'You ran out of hearts'))
const endText = computed(() =>
  won.value
    ? `You cleared every question with ${play.value.heartsLeft} of ${play.value.maxHearts} hearts left.`
    : `${bossName.value} survives this time. Go through what you missed, then try again.`,
)

let fxTimers = []
let fxKey = 0
let musicStarted = false
function after(ms, action) {
  fxTimers.push(setTimeout(action, ms))
}
function clearEffects() {
  fxTimers.forEach(clearTimeout)
  fxTimers = []
  strike.value = null
  shake.value = ''
  breakingHeart.value = 0
}
onBeforeUnmount(clearEffects)

function fireBolt(kind) {
  fxKey += 1
  strike.value = { key: fxKey, kind }
}

function shakeFor(kind) {
  shake.value = kind
  after(SHAKE_MS, () => {
    shake.value = ''
  })
}

// The student's answer flies at the monster and knocks off its share of health.
function playHit(damage, won) {
  audio.play('fire')
  fireBolt('hit')
  after(IMPACT_MS, () => {
    audio.play(won ? 'fatal' : 'hit')
    if (won) audio.setPlaying(false)
    strike.value = null
    fxKey += 1
    impact.value = {
      key: fxKey,
      kind: won ? 'fatal' : 'hit',
      label: won ? 'FATAL ERROR' : `−${damage} HP`,
    }
    shakeFor(won ? 'fatal' : 'hit')
    mood.value = won ? 'dying' : 'hurt'
    after(won ? DYING_MS : RECOVER_MS, () => {
      mood.value = won ? 'defeated' : 'idle'
    })
  })
}

// The monster lunges and fires at the heart that is about to break. The heart's
// own CSS waits for the impact before it splits.
function playCounter(heartsLeft, lost) {
  mood.value = 'attack'
  audio.play('counter')
  breakingHeart.value = heartsLeft + 1
  after(COUNTER_LEAD_MS, () => fireBolt('attack'))
  after(IMPACT_MS, () => {
    audio.play('hurt')
    if (lost) audio.setPlaying(false)
    strike.value = null
    shakeFor('hurt')
  })
  after(RECOVER_MS, () => {
    mood.value = lost ? 'gloat' : 'idle'
  })
  after(BREAK_MS, () => {
    breakingHeart.value = 0
  })
}

async function start() {
  audio.unlock()
  busy.value = true
  error.value = ''
  try {
    const started = await props.engine.start()
    play.value = started
    question.value = started.currentQuestion
    feedback.value = null
    clearEffects()
    impact.value = null
    mood.value = 'idle'
    round.value += 1
    announcement.value = `The battle has started. ${started.currentQuestion?.prompt ?? ''}`
    audio.play('start')
    audio.setHealth(started.remaining / started.totalQuestions)
    audio.setPlaying(true)
    musicStarted = true
  } catch (err) {
    error.value = props.errorMessage(err)
  } finally {
    busy.value = false
  }
}

async function choose(optionId) {
  if (busy.value || feedback.value) return
  // A battle resumed after a reload has had no click yet, so its music starts here.
  audio.unlock()
  audio.setHealth(play.value.remaining / play.value.totalQuestions)
  if (!musicStarted) audio.setPlaying(true)
  musicStarted = true
  busy.value = true
  error.value = ''
  try {
    const result = await props.engine.answer(
      play.value.id,
      question.value.id,
      optionId,
      play.value.answerCount,
    )
    const healthBefore = healthPercent.value
    play.value = result.play
    feedback.value = { correct: result.correct, explanation: result.explanation, optionId }
    announcement.value = `${resultLine.value} ${result.explanation ?? ''}`.trim()
    if (result.play.status === 'won') beaten.value = true
    audio.setHealth(result.play.remaining / result.play.totalQuestions)
    clearEffects()
    if (result.correct) playHit(healthBefore - healthPercent.value, result.play.status === 'won')
    else playCounter(result.play.heartsLeft, result.play.status === 'lost')
  } catch (err) {
    // The game was unpublished or this run moved on elsewhere: reload the truth.
    if (err.response?.status === 409) emit('stale')
    else error.value = props.errorMessage(err)
  } finally {
    busy.value = false
  }
}

// Runs on the Continue link's click, before the browser follows the link to the
// next question's heading or, at the end, to the top of the battle.
function next() {
  feedback.value = null
  if (ended.value) {
    question.value = null
    // The student may have skipped ahead, so the last blow must not land over the ending.
    clearEffects()
    audio.setPlaying(false)
    audio.play(won.value ? 'victory' : 'defeat')
    announcement.value = `${endHeading.value} ${endText.value}`
  } else {
    question.value = play.value.currentQuestion
    round.value += 1
    // The link moves to the question's heading, which is read out from there.
    announcement.value = ''
  }
}

const bossMood = computed(() => {
  if (screen.value === 'end') return won.value ? 'defeated' : 'gloat'
  return mood.value
})
const healthBars = computed(() => ({ transform: `scaleX(${healthPercent.value / 100})` }))
// One last burst when the victory screen opens, with no label over the heading.
const victoryBurst = { key: 'victory', kind: 'fatal', label: '' }
</script>

<template>
  <section id="boss-battle" class="battle" :aria-label="game.title" tabindex="-1">
    <p class="visually-hidden" role="status">{{ announcement }}</p>
    <div v-if="error" role="alert" class="alert alert-danger">{{ error }}</div>

    <!-- Intro -->
    <div v-if="screen === 'intro'" class="card battle-card" :style="{ '--boss-color': bossColor }">
      <BattleSoundControls v-bind="soundControls" class="battle-card-sound" />
      <div class="card-body p-4 battle-intro">
        <div class="battle-boss"><BossPortrait :boss-id="game.bossId" /></div>
        <div class="battle-intro-text">
          <p class="le-chip mb-2">Boss Battle</p>
          <h2 class="h3">{{ game.title }}</h2>
          <p class="text-body-secondary">
            Defeat {{ bossName }} by answering all {{ game.questionCount }} questions correctly.
            Each mistake costs a heart, and that question comes back at the end.
          </p>
          <HeartsRow class="mb-3 battle-hearts" :left="game.hearts" :max="game.hearts" />
          <p v-if="beaten" class="le-chip mb-3">You have defeated this boss</p>
          <div>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="start">
              {{ beaten ? 'Fight again' : 'Start battle' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Battle -->
    <div
      v-else-if="screen === 'battle'"
      class="battle-grid"
      :class="shake && `battle-grid--${shake}`"
    >
      <div class="card battle-arena" :style="{ '--boss-color': bossColor }">
        <span
          v-if="strike"
          :key="strike.key"
          class="battle-bolt"
          :class="`battle-bolt--${strike.kind}`"
          aria-hidden="true"
        ></span>
        <div class="battle-hud">
          <div class="battle-hud-text">
            <p class="fw-semibold mb-0">{{ bossName }}</p>
            <p class="small text-body-secondary mb-0 le-num">
              {{ hitsLanded }} of {{ play.totalQuestions }} questions cleared
            </p>
          </div>
          <BattleSoundControls v-bind="soundControls" />
          <div
            class="progress battle-health"
            role="progressbar"
            :aria-label="`${bossName} health`"
            :aria-valuenow="healthPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="battle-health-trail" :style="healthBars"></div>
            <div class="progress-bar" :style="healthBars"></div>
          </div>
        </div>
        <div class="battle-boss battle-boss--entering">
          <BossStage :boss-id="game.bossId" :mood="bossMood" :impact="impact" />
        </div>
        <HeartsRow
          class="battle-hearts"
          :left="play.heartsLeft"
          :max="play.maxHearts"
          :breaking="breakingHeart"
        />
      </div>

      <div class="card battle-question-card">
        <div class="card-body p-4">
          <!-- The heading stays put between questions, so Continue can link to it. -->
          <h2 id="battle-question" class="h5 battle-prompt" tabindex="-1">
            <span :key="round" class="battle-question-in">{{ question.prompt }}</span>
          </h2>
          <div :key="round" class="battle-question-in">
            <pre v-if="question.code" class="le-code mb-3"><code>{{ question.code }}</code></pre>
            <!-- aria-disabled, not disabled, so the pressed answer keeps the focus. -->
            <div class="battle-answers">
              <button
                v-for="option in question.options"
                :key="option.id"
                type="button"
                class="btn battle-answer"
                :class="{
                  'battle-answer--right': feedback?.optionId === option.id && feedback.correct,
                  'battle-answer--wrong': feedback?.optionId === option.id && !feedback.correct,
                }"
                :aria-disabled="busy || !!feedback ? 'true' : 'false'"
                @click="choose(option.id)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <div v-if="feedback" class="le-callout mt-3 battle-feedback">
            <p class="fw-semibold mb-1">{{ resultLine }}</p>
            <!-- Only a right answer has one; a wrong answer's question comes back later. -->
            <p v-if="feedback.explanation" class="battle-explanation">{{ feedback.explanation }}</p>
            <a
              :href="ended ? '#boss-battle' : '#battle-question'"
              class="btn btn-primary"
              @click="next"
            >
              {{ ended ? 'See how it ended' : 'Continue' }}
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Ending -->
    <div v-else class="card battle-card" :style="{ '--boss-color': bossColor }">
      <BattleSoundControls v-bind="soundControls" class="battle-card-sound" />
      <div class="card-body p-4">
        <div class="battle-intro mb-3">
          <div class="battle-boss">
            <BossStage
              :boss-id="game.bossId"
              :mood="bossMood"
              :impact="won ? victoryBurst : null"
            />
          </div>
          <div class="battle-intro-text">
            <h2 class="h3" :class="won ? 'battle-end-won' : 'battle-end-lost'">
              {{ endHeading }}
            </h2>
            <p class="text-body-secondary">{{ endText }}</p>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="start">
              {{ won ? 'Play again' : 'Try again' }}
            </button>
          </div>
        </div>
        <template v-if="play.missed.length">
          <h3 class="h5">What to review</h3>
          <ul class="list-unstyled mb-0">
            <li v-for="item in play.missed" :key="item.id" class="le-subpanel mb-3">
              <p class="fw-semibold mb-2 battle-prompt">{{ item.prompt }}</p>
              <pre v-if="item.code" class="le-code mb-2"><code>{{ item.code }}</code></pre>
              <p class="mb-1 battle-explanation">
                <strong>Correct answer:</strong> {{ item.correctAnswer }}
              </p>
              <p class="mb-0 battle-explanation">{{ item.explanation }}</p>
            </li>
          </ul>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The monster is sized from the window's height, so it stays large on a big monitor
   and still leaves room for the question on a laptop. */
.battle {
  --monster-size: clamp(9rem, 34vh, 26rem);
  --impact-delay: 260ms; /* IMPACT_MS in the script */
  scroll-margin-top: calc(64px + 0.5rem);
}
/* overflow keeps the victory burst's rings inside the card, off the page title. */
.battle-card {
  position: relative;
  overflow: clip;
  background: linear-gradient(
    to bottom,
    var(--le-surface),
    color-mix(in srgb, var(--boss-color) 12%, var(--le-surface))
  );
}
.battle-card-sound {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 1;
}
.battle-intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}
.battle-intro-text {
  width: min(40rem, 100%);
}
.battle-boss {
  width: min(var(--monster-size), 100%);
  margin-inline: auto;
}
.battle-hearts {
  --heart-size: 2rem;
  justify-content: center;
}
.battle-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}
/* The arena stays in view above a long question, so every hit can be seen. */
.battle-arena {
  position: sticky;
  top: calc(64px + 0.5rem);
  z-index: 5;
  padding: 0.75rem 1rem;
  background: linear-gradient(
    to bottom,
    var(--le-surface),
    color-mix(in srgb, var(--boss-color) 12%, var(--le-surface))
  );
}
.battle-hud {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem 1rem;
}
.battle-hud .battle-health {
  grid-column: 1 / -1;
}
/* Continue scrolls to the question's heading, which must not end up behind the
   arena: the arena is the HUD, the monster and the hearts. */
.battle-prompt {
  scroll-margin-top: calc(64px + var(--monster-size) + 9.5rem);
}
.battle-boss--entering {
  animation: boss-enter 560ms cubic-bezier(0.16, 1, 0.3, 1);
}
.battle-health {
  position: relative;
  height: 0.75rem;
}
/* The bar drops on impact; the pale trail behind it catches up a beat later. */
.battle-health .progress-bar,
.battle-health-trail {
  width: 100%;
  transform-origin: left;
}
.battle-health .progress-bar {
  position: relative;
  background: var(--le-danger);
  transition: transform 300ms var(--le-ease) var(--impact-delay);
  animation: health-fill 620ms var(--le-ease);
}
.battle-health-trail {
  position: absolute;
  inset: 0;
  background: var(--le-text);
  transition: transform 460ms ease-in calc(var(--impact-delay) + 340ms);
}
.battle-question-in {
  display: block;
  animation: question-in 280ms cubic-bezier(0.16, 1, 0.3, 1);
}
.battle-feedback {
  animation: feedback-in 300ms cubic-bezier(0.16, 1, 0.3, 1) calc(var(--impact-delay) + 60ms) both;
}
/* The bolts fly up and down the middle of the arena: the student's answer rises
   from the question to the monster, and the monster's attack falls on the hearts. */
.battle-bolt {
  position: absolute;
  left: 50%;
  z-index: 1;
  width: 0.5rem;
  height: 4.5rem;
  margin-left: -0.25rem;
  border-radius: var(--le-radius-pill);
  pointer-events: none;
}
.battle-bolt--hit {
  background: linear-gradient(to top, transparent, var(--le-action) 62%, #fff);
  box-shadow: 0 -0.25rem 1rem var(--le-action);
  transform-origin: center top;
  animation: bolt-rise var(--impact-delay) cubic-bezier(0.55, 0, 1, 0.6) both;
}
.battle-bolt--attack {
  width: 0.75rem;
  margin-left: -0.375rem;
  background: linear-gradient(to bottom, transparent, var(--boss-color) 62%, #fff);
  box-shadow: 0 0.25rem 1rem var(--boss-color);
  transform-origin: center bottom;
  animation: bolt-fall 200ms cubic-bezier(0.55, 0, 1, 0.6) both;
}
.battle-grid--hit .battle-arena {
  animation: shake-small 260ms linear;
}
.battle-grid--hurt {
  animation: shake-large 380ms linear;
}
.battle-grid--hurt .battle-question-card {
  animation: card-hurt 480ms ease-out;
}
.battle-grid--fatal .battle-arena {
  animation: shake-large 480ms linear;
}
.battle-end-won {
  animation: end-slam 620ms cubic-bezier(0.16, 1, 0.3, 1);
}
.battle-end-lost {
  animation: end-sink 460ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes boss-enter {
  0% {
    opacity: 0;
    transform: scale(0.72) translateY(-0.75rem);
    filter: blur(6px) brightness(2);
  }
}
@keyframes health-fill {
  0% {
    transform: scaleX(0);
  }
}
@keyframes question-in {
  0% {
    opacity: 0;
    transform: translateY(0.5rem);
  }
}
@keyframes feedback-in {
  0% {
    opacity: 0;
    transform: translateY(0.5rem);
  }
}
@keyframes bolt-rise {
  0% {
    top: 100%;
    transform: scaleY(0.25);
  }
  100% {
    top: 50%;
    transform: scaleY(1.25);
  }
}
@keyframes bolt-fall {
  0% {
    top: calc(50% - 4.5rem);
    transform: scaleY(0.25);
  }
  100% {
    top: calc(100% - 6.25rem);
    transform: scaleY(1.25);
  }
}
@keyframes shake-small {
  25% {
    transform: translate(-3px, 1px);
  }
  50% {
    transform: translate(3px, -1px);
  }
  75% {
    transform: translate(-2px, 0);
  }
}
@keyframes shake-large {
  15% {
    transform: translate(-7px, 2px);
  }
  35% {
    transform: translate(6px, -2px);
  }
  55% {
    transform: translate(-4px, 1px);
  }
  75% {
    transform: translate(3px, 0);
  }
}
@keyframes card-hurt {
  0% {
    border-color: var(--le-danger);
    box-shadow:
      0 0 0 1px var(--le-danger),
      0 0.5rem 1.75rem color-mix(in srgb, var(--le-danger) 45%, transparent);
  }
}
@keyframes answer-fire {
  0% {
    transform: scale(0.98);
  }
  35% {
    transform: scale(1.012);
    box-shadow: 0 0.25rem 1.25rem color-mix(in srgb, var(--le-action) 45%, transparent);
  }
}
@keyframes answer-miss {
  20% {
    transform: translateX(-5px);
  }
  45% {
    transform: translateX(4px);
  }
  70% {
    transform: translateX(-2px);
  }
}
@keyframes end-slam {
  0% {
    opacity: 0;
    transform: scale(1.5);
    filter: blur(4px);
  }
  55% {
    opacity: 1;
    transform: scale(0.98);
    filter: blur(0);
  }
}
@keyframes end-sink {
  0% {
    opacity: 0;
    transform: translateY(-0.5rem);
  }
}
.battle-prompt,
.battle-explanation {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.battle:focus,
.battle-prompt:focus {
  outline: none;
}
.battle-answers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.battle-answer {
  min-height: 2.75rem;
  border: 1px solid var(--le-input-border);
  color: var(--le-text);
  text-align: left;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.battle-answer:hover:not([aria-disabled='true']) {
  border-color: var(--section-accent);
  background: var(--section-tint);
  color: var(--le-text);
}
.battle-answer[aria-disabled='true'] {
  border-color: var(--le-border);
  color: var(--le-muted);
  cursor: default;
}
.battle-answer--right[aria-disabled='true'] {
  border-color: var(--le-action);
  background: var(--le-action-tint);
  color: var(--le-text);
  animation: answer-fire 340ms ease-out;
}
.battle-answer--wrong[aria-disabled='true'] {
  border-color: var(--le-danger);
  background: var(--le-danger-tint);
  color: var(--le-text);
  animation: answer-miss 320ms linear var(--impact-delay);
}
@media (max-width: 767.98px) {
  .battle {
    --monster-size: clamp(7.5rem, 24vh, 13rem);
  }
  .battle-arena {
    padding: 0.5rem 0.75rem;
  }
  .battle-answers {
    grid-template-columns: minmax(0, 1fr);
  }
}
/* A phone on its side has no height to spare for an arena that stays in place. */
@media (max-height: 560px) {
  .battle-arena {
    position: relative;
  }
  .battle-prompt {
    scroll-margin-top: calc(64px + 1.5rem);
  }
}
</style>
