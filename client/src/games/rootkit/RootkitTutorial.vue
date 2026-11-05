<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import RootkitIcon from './RootkitIcon.vue'
import CommandReference from './CommandReference.vue'

defineProps({ inMission: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'start', 'sound'])
const step = ref(0)
const heading = ref(null)
const dialog = ref(null)
const practiceInput = ref(null)
const practiceOutput = ref(null)
const command = ref('')
const listed = ref(false)
const read = ref(false)
const log = ref([{ kind: 'system', text: 'Practice shell ready. Try ls to see the files.' }])
// Practice deliberately never calls the mission engine or modifies its discoveries.
const practiced = computed(() => listed.value && read.value)
const steps = [
  { title: 'Your mission: rescue the coffee', icon: 'coffee' },
  { title: 'Try the terminal', icon: 'terminal' },
  { title: 'Read the clues', icon: 'notes' },
  { title: 'Trace the coffee service', icon: 'sniffer' },
  { title: 'You’re ready to boot', icon: 'coffee' },
]
const nextDisabled = computed(() => step.value === 1 && !practiced.value)

async function changeStep(delta) {
  step.value = Math.max(0, Math.min(steps.length - 1, step.value + delta))
  await nextTick()
  heading.value?.focus({ preventScroll: true })
  dialog.value?.querySelector('.tutorial-body')?.scrollTo({ top: 0 })
}

async function runPractice(example) {
  const value = (typeof example === 'string' ? example : command.value).trim()
  if (!value) return
  log.value.push({ kind: 'input', text: `practice:~$ ${value}` })
  if (value === 'ls') {
    listed.value = true
    log.value.push({ kind: 'output', text: 'briefing.txt' })
  } else if (value === 'cat briefing.txt') {
    read.value = true
    log.value.push({
      kind: 'success',
      text: 'Practice file opened. Nice work!\nFiles contain clues. In the mission, start with cat README.txt.',
    })
  } else if (value === 'help') {
    log.value.push({
      kind: 'output',
      text: 'ls                  List files\ncat briefing.txt    Read the practice file\nhelp                Show these commands',
    })
  } else {
    log.value.push({
      kind: 'output',
      text: 'This practice shell understands help, ls, and cat briefing.txt. Try one of those.',
    })
  }
  log.value = log.value.slice(-8)
  command.value = ''
  emit('sound', 'key')
  await nextTick()
  practiceInput.value?.focus({ preventScroll: true })
  if (practiceOutput.value) practiceOutput.value.scrollTop = practiceOutput.value.scrollHeight
}

function practiceKey(event) {
  if (event.key !== 'Tab' || event.shiftKey) return
  const candidates = ['help', 'ls', 'cat briefing.txt'].filter((value) =>
    value.startsWith(command.value.trim()),
  )
  if (candidates.length === 1) {
    event.preventDefault()
    command.value = candidates[0]
  }
}

function dialogKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const controls = [
    ...dialog.value.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'),
  ]
  const first = controls[0]
  const last = controls.at(-1)
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === heading.value)
  ) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>

<template>
  <div class="tutorial-overlay">
    <section
      ref="dialog"
      class="tutorial-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="RootKit OS tutorial"
      aria-describedby="tutorial-timing"
      @keydown="dialogKey"
    >
      <header class="tutorial-topbar">
        <div><RootkitIcon name="coffee" /><span>RootKit field guide</span></div>
        <button type="button" class="tutorial-dismiss" @click="emit('close')">
          {{ inMission ? 'Return to game' : 'Skip tutorial' }}<span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="tutorial-body">
        <div class="tutorial-heading">
          <span class="tutorial-step-icon"><RootkitIcon :name="steps[step].icon" /></span>
          <div>
            <p class="tutorial-position">Step {{ step + 1 }} of {{ steps.length }}</p>
            <h3 ref="heading" tabindex="-1">{{ steps[step].title }}</h3>
          </div>
        </div>
        <p id="tutorial-timing" class="tutorial-timing">
          <span aria-hidden="true">◷</span
          >{{
            inMission
              ? 'Mission paused. Your progress is safe while this guide is open.'
              : 'No time limit. Elapsed time starts when you boot the mission.'
          }}
        </p>

        <div v-if="step === 0" class="tutorial-content">
          <p>
            The professor’s espresso machine is locked. Use this desktop to find clues and unlock a
            fresh cup in three stages.
          </p>
          <ol class="tutorial-stages">
            <li>
              <span>1</span>
              <div>
                <strong>Decode the order</strong>
                <p>Read files and use a note’s clue to recover an access phrase.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Connect to the machine</strong>
                <p>Find the connection details and a password in the desktop apps.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Brew the coffee</strong>
                <p>Use the final command once you’re connected.</p>
              </div>
            </li>
          </ol>
          <p class="tutorial-callout">
            Everything happens in a simulated desktop. You can experiment with the commands.
          </p>
        </div>

        <div v-else-if="step === 1" class="tutorial-content">
          <p>
            The terminal follows written commands. Type <code>ls</code> and press Enter to list
            files, then <code>cat briefing.txt</code> to read one. You can also use the example
            buttons below.
          </p>
          <div class="practice-terminal">
            <div class="practice-title">
              <span aria-hidden="true">&gt;_</span> Practice terminal
              <small>Separate from your mission</small>
            </div>
            <div
              ref="practiceOutput"
              class="practice-output"
              role="log"
              aria-label="Practice terminal output"
              aria-live="polite"
            >
              <pre v-for="(entry, index) in log" :key="index" :class="`practice-${entry.kind}`">{{
                entry.text
              }}</pre>
            </div>
            <form class="practice-form" @submit.prevent="runPractice()">
              <label for="rootkit-practice">practice:~$</label
              ><input
                id="rootkit-practice"
                ref="practiceInput"
                v-model="command"
                name="rootkit-practice"
                aria-label="Practice terminal command"
                autocomplete="off"
                autocapitalize="off"
                :spellcheck="false"
                maxlength="80"
                @keydown="practiceKey"
              /><button type="submit" aria-label="Run practice command">↵</button>
            </form>
          </div>
          <div class="practice-examples">
            <span>Try a command:</span
            ><button type="button" @click="runPractice('ls')">Try ls</button
            ><button type="button" @click="runPractice('cat briefing.txt')">
              Try cat briefing.txt
            </button>
          </div>
          <p class="practice-check" role="status">
            {{
              practiced
                ? 'You’ve listed and read a file. You’re ready for the real terminal.'
                : listed
                  ? 'File found. Now read it with cat briefing.txt.'
                  : read
                    ? 'File read. Try ls too, so you know how to find files.'
                    : 'List a file and read it to continue.'
            }}
          </p>
          <p class="tutorial-key-hint">
            In the mission: <kbd>Tab</kbd> completes commands and filenames. <kbd>↑</kbd
            ><kbd>↓</kbd> recalls commands. <kbd>Shift</kbd> + <kbd>Tab</kbd> leaves the command
            field.
          </p>
        </div>

        <div v-else-if="step === 2" class="tutorial-content">
          <p>
            Files and sticky notes work together. Open <strong>Notes</strong> to look for clues,
            then return to <strong>Terminal</strong> to use what you found.
          </p>
          <div class="tutorial-clue-pair">
            <div class="tutorial-file">
              <RootkitIcon name="terminal" /><code>cat &lt;filename&gt;</code>
              <p>
                Read the file named after <code>cat</code>. Start the mission with
                <code>cat README.txt</code>.
              </p>
            </div>
            <div class="tutorial-note">
              <RootkitIcon name="notes" /><strong>A clue, not just decoration.</strong>
              <p>
                Notes hint at a cipher and a useful frequency. Move them by the grip at the top.
              </p>
            </div>
          </div>
          <div class="tutorial-window-help">
            <div aria-hidden="true"><i>×</i><i>−</i><i>+</i></div>
            <p>
              Drag a window’s header to move it. The three buttons close, minimize, or maximize it.
              Reopen any app from the bottom taskbar.
            </p>
          </div>
        </div>

        <div v-else-if="step === 3" class="tutorial-content">
          <p>
            Two utilities hold the details you need to connect. Open them using their desktop or
            taskbar icons.
          </p>
          <div class="tutorial-utilities">
            <div>
              <span class="utility-heading"
                ><RootkitIcon name="sniffer" /><strong>Sniffer</strong></span
              >
              <div class="tutorial-packet" aria-hidden="true">
                ! <code>45 00 · unusual destination</code>
              </div>
              <p>
                Click the highlighted unusual packet. Its detail panel reveals the server’s port
                number. Read <code>network.log</code> for the host and user.
              </p>
            </div>
            <div>
              <span class="utility-heading"
                ><RootkitIcon name="monitor" /><strong>Monitor</strong></span
              >
              <div class="tutorial-frequency" aria-hidden="true">
                <span></span><i></i><span></span>
              </div>
              <p>
                Use a note’s clue to tune the frequency with the slider or number field. Watch the
                locked diagnostic panel for a password.
              </p>
            </div>
          </div>
          <p class="tutorial-callout">
            Then return to Terminal. <code>help</code> explains the <code>ssh</code> command. When
            it asks for a password, typing is hidden; press Enter to submit it.
          </p>
        </div>

        <div v-else class="tutorial-content">
          <p>
            {{
              inMission
                ? 'Pick up where you left off. The guide has kept your mission progress intact.'
                : 'You know your way around. Your first task is to read the mission instructions.'
            }}
          </p>
          <div class="tutorial-first-command">
            <span>Start in Terminal</span><code>cat README.txt</code>
            <p>Type the command, then press Enter or click ↵.</p>
          </div>
          <ul class="tutorial-checklist">
            <li>Read files and notes before guessing.</li>
            <li>Use the taskbar to switch between the four apps.</li>
            <li>Type <code>help</code> for command syntax.</li>
            <li>Open <strong>Commands</strong> for the full reference and examples.</li>
            <li>Open <strong>How to play</strong> anytime to pause and revisit this guide.</li>
          </ul>
          <details class="tutorial-command-reference">
            <summary>All terminal commands</summary>
            <p>Keep this list handy for the mission terminal.</p>
            <CommandReference />
          </details>
          <p class="tutorial-callout">
            {{
              inMission
                ? 'Return when you’re ready. Elapsed time resumes when you leave this guide.'
                : 'Elapsed time starts when you boot. Practice commands haven’t changed the mission.'
            }}
          </p>
        </div>
      </div>
      <footer class="tutorial-navigation">
        <div class="tutorial-progress" aria-hidden="true">
          <span v-for="(_, index) in steps" :key="index" :class="{ visited: index <= step }"></span>
        </div>
        <div class="tutorial-nav-buttons">
          <button v-if="step > 0" type="button" class="tutorial-back" @click="changeStep(-1)">
            Back</button
          ><button
            v-if="step < steps.length - 1"
            type="button"
            class="tutorial-next"
            :disabled="nextDisabled"
            @click="changeStep(1)"
          >
            Next <span aria-hidden="true">→</span></button
          ><button
            v-else
            type="button"
            class="tutorial-next"
            @click="emit(inMission ? 'close' : 'start')"
          >
            {{ inMission ? 'Resume mission' : 'Boot RootKit OS' }}<span aria-hidden="true">→</span>
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.tutorial-overlay {
  position: absolute;
  inset: 0;
  z-index: 11000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--rk-bg) 93%, transparent);
}
.tutorial-dialog {
  display: flex;
  flex-direction: column;
  width: min(100%, 720px);
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--rk-border);
  border-radius: 12px;
  background: var(--rk-window-bg);
  color: var(--rk-text);
  box-shadow: 0 18px 60px #0004;
}
.tutorial-dialog button {
  cursor: pointer;
  touch-action: manipulation;
}
.tutorial-dialog button:focus-visible,
.tutorial-dialog input:focus-visible {
  outline: 2px solid var(--rk-accent);
  outline-offset: 3px;
}
.tutorial-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  min-height: 52px;
  padding: 6px 20px;
  border-bottom: 1px solid var(--rk-border);
  color: var(--rk-muted);
  font-size: 11px;
}
.tutorial-topbar > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tutorial-topbar svg {
  width: 20px;
  height: 20px;
  color: var(--rk-accent);
}
.tutorial-dismiss {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 6px 0 6px 8px;
  border: 0;
  background: transparent;
  color: var(--rk-muted);
  font-size: 11px !important;
}
.tutorial-dismiss > span {
  font-size: 22px;
  line-height: 1;
}
.tutorial-dismiss:hover {
  color: var(--rk-text);
}
.tutorial-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--rk-border) transparent;
  padding: 24px 28px;
}
.tutorial-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}
.tutorial-step-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 46px;
  height: 46px;
  border: 1px solid var(--rk-border);
  border-radius: 9px;
  background: var(--rk-soft);
  color: var(--rk-accent);
}
.tutorial-step-icon > svg {
  width: 26px;
  height: 26px;
}
.tutorial-position {
  margin: 0 0 3px;
  color: var(--rk-muted);
  font-size: 11px;
}
.tutorial-heading h3 {
  margin: 0;
  color: var(--rk-text);
  font: 600 25px/1.2 var(--bs-body-font-family);
  letter-spacing: -0.025em;
  text-wrap: balance;
}
.tutorial-heading h3:focus {
  outline: none;
}
.tutorial-timing {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 16px 0 20px;
  padding: 9px 12px;
  border-left: 2px solid var(--rk-accent);
  background: var(--rk-soft);
  color: var(--rk-accent);
  font-size: 11px;
  line-height: 1.65;
}
.tutorial-content {
  font-family: var(--bs-body-font-family);
  font-size: 15px;
  line-height: 1.6;
}
.tutorial-content > p {
  margin: 0 0 16px;
}
.tutorial-content code {
  color: var(--rk-accent);
  font-family: var(--bs-font-monospace);
  font-size: 0.85em;
}
.tutorial-content strong {
  color: var(--rk-text);
  font-weight: 600;
}
.tutorial-stages {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin: 22px 0;
  padding: 0;
  list-style: none;
}
.tutorial-stages > li {
  display: flex;
  gap: 14px;
}
.tutorial-stages > li > span {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--rk-border);
  border-radius: 50%;
  color: var(--rk-accent);
  font: 12px var(--bs-font-monospace);
}
.tutorial-stages strong {
  display: block;
}
.tutorial-stages p {
  margin: 2px 0 0;
  color: var(--rk-muted);
  font-size: 14px;
}
.tutorial-content .tutorial-callout {
  margin: 18px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--rk-border);
  color: var(--rk-muted);
  font-size: 13px;
}
.practice-terminal {
  overflow: hidden;
  border: 1px solid var(--rk-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--rk-bg) 85%, transparent);
  font-family: var(--bs-font-monospace);
}
.practice-title {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--rk-border);
  color: var(--rk-accent);
  font-size: 11px;
}
.practice-title small {
  margin-left: auto;
  color: var(--rk-muted);
  font-size: 10px;
}
.practice-output {
  height: 114px;
  overflow-y: auto;
  padding: 10px 12px;
  scrollbar-width: thin;
}
.practice-output > pre {
  margin: 0 0 8px;
  color: var(--rk-text);
  font: 12px/1.65 var(--bs-font-monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.practice-output > .practice-input,
.practice-output > .practice-success {
  color: var(--rk-accent);
}
.practice-output > .practice-system {
  color: var(--rk-muted);
}
.practice-form {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  margin: 0 12px;
  border-top: 1px solid var(--rk-border);
}
.practice-form label {
  flex: none;
  color: var(--rk-accent);
  font-size: 11px;
}
.practice-form input {
  min-width: 0;
  width: 100%;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: var(--rk-text);
  font: 14px var(--bs-font-monospace);
  caret-color: var(--rk-accent);
}
.practice-form button {
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
  background: var(--rk-soft);
  color: var(--rk-accent);
}
.practice-examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-top: 10px;
  color: var(--rk-muted);
  font-size: 12px;
}
.practice-examples button {
  min-height: 36px;
  padding: 4px 8px;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
  background: var(--rk-soft);
  color: var(--rk-accent);
  font: 11px var(--bs-font-monospace) !important;
}
.practice-examples button:hover {
  border-color: var(--rk-accent);
}
.tutorial-content .practice-check {
  margin: 12px 0;
  color: var(--rk-accent);
  font-size: 13px;
}
.tutorial-content .tutorial-key-hint {
  margin: 0;
  color: var(--rk-muted);
  font-size: 12px;
}
.tutorial-key-hint kbd {
  padding: 1px 3px;
  border: 1px solid var(--rk-border);
  background: var(--rk-bg);
  color: var(--rk-text);
  font-size: 10px;
}
.tutorial-clue-pair,
.tutorial-utilities {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 22px 0;
}
.tutorial-clue-pair > div,
.tutorial-utilities > div {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
}
.tutorial-clue-pair svg {
  display: block;
  width: 24px;
  height: 24px;
  margin-bottom: 12px;
  color: var(--rk-accent);
}
.tutorial-clue-pair strong {
  font-size: 14px;
}
.tutorial-clue-pair p,
.tutorial-utilities p {
  margin: 8px 0 0;
  color: var(--rk-muted);
  font-size: 13px;
}
.tutorial-note {
  background: color-mix(in srgb, var(--rk-accent2) 7%, var(--rk-bg));
}
.tutorial-note > svg {
  color: var(--rk-accent2);
}
.tutorial-window-help {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--rk-border);
}
.tutorial-window-help > div {
  display: flex;
  flex: none;
  gap: 5px;
  padding-top: 2px;
}
.tutorial-window-help i {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--rk-close);
  color: #21190b;
  font-style: normal;
  font-size: 10px;
}
.tutorial-window-help i:nth-child(2) {
  background: var(--rk-minimize);
}
.tutorial-window-help i:nth-child(3) {
  background: var(--rk-maximize);
}
.tutorial-window-help > p {
  margin: 0;
  color: var(--rk-muted);
  font-size: 13px;
}
.utility-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.utility-heading > svg {
  width: 22px;
  height: 22px;
  color: var(--rk-accent);
}
.tutorial-packet {
  margin: 16px 0;
  padding: 8px;
  border: 1px solid var(--rk-danger);
  border-radius: 3px;
  color: var(--rk-danger);
  font-size: 13px;
}
.tutorial-packet > code {
  margin-left: 5px;
  color: inherit;
  font-size: 10px;
}
.tutorial-frequency {
  display: flex;
  align-items: center;
  margin: 28px 0 25px;
}
.tutorial-frequency > span {
  flex: 1;
  height: 4px;
  background: var(--rk-border);
}
.tutorial-frequency > span:first-child {
  background: var(--rk-accent);
}
.tutorial-frequency > i {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--rk-accent);
}
.tutorial-first-command {
  margin: 20px 0;
  padding: 18px;
  border: 1px solid var(--rk-border);
  border-radius: 5px;
  background: var(--rk-soft);
}
.tutorial-first-command > span {
  display: block;
  margin-bottom: 8px;
  color: var(--rk-muted);
  font-size: 12px;
}
.tutorial-first-command > code {
  font-size: 18px;
}
.tutorial-first-command > p {
  margin: 8px 0 0;
  color: var(--rk-muted);
  font-size: 13px;
}
.tutorial-checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 20px;
  font-size: 14px;
}
.tutorial-checklist li::marker {
  color: var(--rk-accent);
}
.tutorial-command-reference {
  margin: 20px 0;
  padding: 12px;
  border: 1px solid var(--rk-border);
  border-radius: 4px;
}
.tutorial-command-reference > summary {
  min-height: 30px;
  color: var(--rk-accent);
  cursor: pointer;
  font-size: 14px;
}
.tutorial-command-reference > summary:focus-visible {
  outline: 2px solid var(--rk-accent);
  outline-offset: 3px;
}
.tutorial-command-reference > p {
  margin: 12px 0;
  color: var(--rk-muted);
  font-size: 13px;
}
.tutorial-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex: none;
  min-height: 72px;
  padding: 12px 28px;
  border-top: 1px solid var(--rk-border);
  background: var(--rk-bg);
}
.tutorial-progress {
  display: flex;
  gap: 5px;
}
.tutorial-progress > span {
  width: 18px;
  height: 3px;
  background: var(--rk-border);
}
.tutorial-progress > span.visited {
  background: var(--rk-accent);
}
.tutorial-nav-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tutorial-back,
.tutorial-next {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--rk-border);
  border-radius: 5px;
  font-size: 12px !important;
}
.tutorial-back {
  background: transparent;
  color: var(--rk-text);
}
.tutorial-back:hover {
  border-color: var(--rk-accent);
}
.tutorial-next {
  border-color: var(--rk-accent);
  background: var(--rk-accent);
  color: var(--rk-bg);
  font-weight: 600 !important;
}
.tutorial-next:hover:not(:disabled) {
  filter: brightness(1.12);
}
.tutorial-next:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (max-width: 767px) {
  .tutorial-overlay {
    padding: 8px;
  }
  .tutorial-topbar {
    padding: 6px 12px;
  }
  .tutorial-topbar > div {
    gap: 5px;
    font-size: 10px;
  }
  .tutorial-dismiss {
    gap: 7px;
    font-size: 10px !important;
  }
  .tutorial-body {
    padding: 20px 16px;
  }
  .tutorial-heading {
    align-items: flex-start;
    gap: 10px;
  }
  .tutorial-step-icon {
    width: 36px;
    height: 36px;
  }
  .tutorial-step-icon > svg {
    width: 22px;
    height: 22px;
  }
  .tutorial-heading h3 {
    font-size: 23px;
  }
  .tutorial-content {
    font-size: 15px;
  }
  .tutorial-clue-pair,
  .tutorial-utilities {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .tutorial-clue-pair > div,
  .tutorial-utilities > div {
    padding: 12px;
  }
  .tutorial-window-help {
    flex-direction: column;
    gap: 10px;
  }
  .practice-title small {
    display: none;
  }
  .practice-form {
    gap: 6px;
    margin: 0 8px;
  }
  .practice-form label {
    font-size: 9px;
  }
  .practice-form input {
    font-size: 16px;
  }
  .practice-form button {
    width: 32px;
  }
  .tutorial-navigation {
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 16px;
  }
  .tutorial-progress {
    gap: 4px;
  }
  .tutorial-progress > span {
    width: 10px;
  }
  .tutorial-nav-buttons {
    gap: 8px;
    margin-left: auto;
  }
  .tutorial-back,
  .tutorial-next {
    padding: 8px 12px;
    gap: 8px;
    font-size: 11px !important;
  }
}
</style>
