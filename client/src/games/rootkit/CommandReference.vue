<script setup>
import { COMMAND_GROUPS, COMMAND_REFERENCE } from './commandReference.js'
</script>

<template>
  <div class="command-reference">
    <p class="reference-notation">
      Replace <code>&lt;placeholders&gt;</code> with your values. Items in
      <code>[brackets]</code> are optional. Don’t type the brackets.
    </p>
    <section
      v-for="group in COMMAND_GROUPS"
      :key="group"
      class="reference-group"
      :aria-label="group"
    >
      <h4>{{ group }}</h4>
      <dl>
        <div
          v-for="command in COMMAND_REFERENCE.filter((entry) => entry.group === group)"
          :key="command.name"
          class="reference-entry"
          :data-command="command.name"
        >
          <dt>
            <code>{{ command.syntax }}</code>
          </dt>
          <dd>
            <p>{{ command.description }}</p>
            <div v-if="command.examples" class="reference-examples">
              <span>Examples</span
              ><code v-for="example in command.examples" :key="example">{{ example }}</code>
            </div>
            <div v-if="command.variants" class="reference-variants">
              <span>Also accepted</span
              ><code v-for="variant in command.variants" :key="variant">{{ variant }}</code>
            </div>
            <p v-if="command.note" class="reference-note">{{ command.note }}</p>
          </dd>
        </div>
      </dl>
    </section>
    <section class="reference-tips" aria-label="Terminal tips">
      <h4>Keyboard and input</h4>
      <ul>
        <li><kbd>Enter</kbd> or <strong>↵</strong> runs the command.</li>
        <li><kbd>Tab</kbd> completes commands, paths, and supported arguments.</li>
        <li><kbd>↑</kbd> / <kbd>↓</kbd> recalls command history.</li>
        <li><kbd>Shift</kbd> + <kbd>Tab</kbd> leaves the command field.</li>
        <li>Commands and filenames are case sensitive. Quote phrases containing spaces.</li>
        <li>
          At the password prompt, submit the recovered password directly, without quotes.
          Command-looking text is treated as a password too; wrong attempts let you retry.
        </li>
      </ul>
      <p>
        Enter one command at a time. Pipes, redirects, command chaining, wildcards, and shell
        variables are unsupported.
      </p>
    </section>
  </div>
</template>

<style scoped>
.command-reference {
  color: var(--rk-text);
  font: 14px/1.65 var(--bs-body-font-family);
}
.reference-notation {
  margin: 0 0 24px;
  padding: 12px;
  border-left: 2px solid var(--rk-accent);
  background: var(--rk-soft);
  color: var(--rk-muted);
  font-size: 13px;
}
.command-reference code {
  color: var(--rk-accent);
  font-family: var(--bs-font-monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.reference-group + .reference-group,
.reference-tips {
  margin-top: 26px;
}
.command-reference h4 {
  margin: 0 0 6px;
  color: var(--rk-muted);
  font: 600 15px/1.4 var(--bs-body-font-family);
}
.reference-group dl {
  margin: 0;
}
.reference-entry {
  padding: 14px 0;
  border-bottom: 1px solid var(--rk-border);
}
.reference-entry dt {
  margin: 0 0 6px;
  font-weight: 600;
}
.reference-entry dt code {
  font-size: 13px;
}
.reference-entry dd {
  margin: 0;
}
.reference-entry p {
  margin: 0;
}
.reference-examples,
.reference-variants {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  margin-top: 8px;
}
.reference-examples > span,
.reference-variants > span {
  color: var(--rk-muted);
  font-size: 12px;
}
.reference-variants {
  flex-direction: column;
  gap: 3px;
}
.reference-entry .reference-note {
  margin-top: 8px;
  color: var(--rk-muted);
  font-size: 12px;
}
.reference-tips ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 20px;
  margin: 14px 0;
}
.reference-tips li::marker {
  color: var(--rk-accent);
}
.reference-tips p {
  margin: 16px 0 0;
  color: var(--rk-muted);
  font-size: 12px;
}
.reference-tips kbd {
  padding: 1px 4px;
  border: 1px solid var(--rk-border);
  border-radius: 3px;
  background: var(--rk-bg);
  color: var(--rk-text);
  font-size: 11px;
}
</style>
