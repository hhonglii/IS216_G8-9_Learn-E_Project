import { computed, ref } from 'vue'
import { COMMAND_REFERENCE, formatCommandHelp } from './commandReference.js'

export const RULES = Object.freeze({
  cipher: 'hvsuhvvr',
  shift: 3,
  decoded: 'espresso',
  host: 'coffee.local',
  user: 'barista',
  port: 4040,
  frequency: 404,
  passcode: 'BEAN-404',
})

const ROOT = '/home/student'
const COMMANDS = COMMAND_REFERENCE.map((command) => command.name)
const FORBIDDEN = /[;|&<>`\n\r]|\$\(/
const FILES = Object.freeze({
  'README.txt': [
    'ROOTKIT OS // Espresso recovery mission',
    '1. Decode the captured order in cipher.txt. The sticky note supplies the shift key.',
    '2. Find the service host and user in network.log. Inspect the red network packet for its port.',
    '   Tune the System Monitor to reveal the password, then connect with ssh.',
    '3. After authenticating, run the approved command documented in brew.sh.',
    '',
    'Syntax: decrypt <cipher> --shift <number>',
    '        ssh <user>@<host> -p <port>',
    'Explore with ls, cd, cat and grep. Type help for all commands.',
    'This shell and its files are a local simulation. No real commands or connections are executed.',
  ].join('\n'),
  'cipher.txt':
    'Captured order: hvsuhvvr\nOffset clue: binary digits on the sticky note represent a decimal shift.\nUsage: decrypt <cipher> --shift <number>',
  'network.log':
    '[coffee-service] host=coffee.local\n[coffee-service] user=barista\n[coffee-service] port=[redacted: inspect the red packet in Sniffer]\n[authentication] password supplied by the tuned System Monitor',
  'brew.sh':
    '# Local training script; not an executable system file.\n# Approved authenticated command:\nsudo brew --espresso',
  'notes/clock.txt':
    'Frequency clue: use the familiar HTTP Not Found status code, in MHz.\nOnly an exact integer frequency locks the signal.',
  'notes/security.txt':
    'The red packet reveals a destination port.\nPassword attempts are never echoed or added to terminal history.\nA wrong password keeps the authentication prompt open for another attempt.',
})

export const filesystem = Object.freeze({
  root: ROOT,
  files: FILES,
  directories: Object.freeze(['', 'notes']),
})

const ok = (event = 'command', extra = {}) => ({ ok: true, error: false, event, ...extra })

function tokenize(line, partial = false) {
  // This is a small local grammar, never a shell: reject operators before parsing quotes.
  if (FORBIDDEN.test(line) || line.includes(String.fromCharCode(0)))
    throw new Error('Shell operators are unsupported. Enter one local command at a time.')
  const tokens = []
  const starts = []
  let token = ''
  let quote = null
  let started = false
  let start = 0
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (!started && !/\s/.test(character)) {
      started = true
      start = index
    }
    if (character === '\\' && index + 1 < line.length) {
      const next = line[index + 1]
      if (next === quote || next === '\\' || (!quote && /\s/.test(next))) {
        token += next
        index += 1
      } else token += character
    } else if (quote) {
      if (character === quote) quote = null
      else token += character
    } else if (character === '"' || character === "'") quote = character
    else if (/\s/.test(character)) {
      if (started) {
        tokens.push(token)
        starts.push(start)
        token = ''
        started = false
      }
    } else token += character
  }
  if (quote && !partial) throw new Error('Unclosed quote. Close the quoted text and try again.')
  if (started) {
    tokens.push(token)
    starts.push(start)
  }
  return { tokens, starts, quote }
}

function resolvePath(path, cwd) {
  // Every normalized path remains inside the in-memory home, including absolute aliases.
  const source = path === '~' ? ROOT : path.replace(/^~\//, `${ROOT}/`)
  let relative
  if (source === '/' || source === ROOT) relative = ''
  else if (source.startsWith(`${ROOT}/`)) relative = source.slice(ROOT.length + 1)
  else if (source.startsWith('/home/') || source === '/home') {
    throw new Error('Access is limited to the virtual /home/student filesystem.')
  } else if (source.startsWith('/')) relative = source.slice(1)
  else relative = [cwd, source].filter(Boolean).join('/')
  const parts = []
  for (const part of relative.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) throw new Error('Cannot traverse above the virtual home directory.')
      parts.pop()
    } else parts.push(part)
  }
  return parts.join('/')
}

function isDirectory(path) {
  return filesystem.directories.includes(path)
}

function directoryEntries(path) {
  const prefix = path ? `${path}/` : ''
  const names = new Set()
  for (const file of Object.keys(FILES)) {
    if (!file.startsWith(prefix)) continue
    const remainder = file.slice(prefix.length)
    const slash = remainder.indexOf('/')
    names.add(slash < 0 ? remainder : `${remainder.slice(0, slash)}/`)
  }
  return [...names].sort()
}

function readFile(path, cwd) {
  let resolved = resolvePath(path, cwd)
  if (!Object.hasOwn(FILES, resolved) && !path.includes('/')) {
    // Basename aliases let beginners read a clue without first navigating its folder.
    const alias = Object.keys(FILES).find((file) => file.split('/').at(-1) === path)
    if (alias) resolved = alias
  }
  if (isDirectory(resolved)) throw new Error(`${path}: is a directory. Use ls to inspect it.`)
  if (!Object.hasOwn(FILES, resolved)) throw new Error(`${path}: file not found.`)
  return { path: resolved, content: FILES[resolved] }
}

function decryptCaesar(cipher, shift) {
  return cipher.replace(/[a-z]/gi, (character) => {
    const base = character >= 'a' && character <= 'z' ? 97 : 65
    return String.fromCharCode(((((character.charCodeAt(0) - base - shift) % 26) + 26) % 26) + base)
  })
}

function initialState() {
  return {
    status: 'ready',
    paused: false,
    elapsed: 0,
    elapsedMs: 0,
    stage: 0,
    decoded: false,
    portFound: false,
    passcodeFound: false,
    connected: false,
    awaitingPassword: false,
    frequency: 320,
    log: [],
    errorRevision: 0,
    packetPort: null,
    passcode: null,
  }
}

export function useRootkitEngine({ now = Date.now } = {}) {
  const state = ref(initialState())
  const cwd = ref('')
  const prompt = computed(() => {
    if (state.value.awaitingPassword) return 'password:'
    const user = state.value.connected ? 'barista@coffee' : 'student@rootkit'
    return `${user}:~${cwd.value ? `/${cwd.value}` : ''}$`
  })
  let startedAt = null
  let pausedAt = null
  let nextLogId = 0
  let history = []
  let historyIndex = 0
  let savedDraft = ''

  function append(kind, text) {
    state.value.log.push({ id: ++nextLogId, kind, text })
    if (state.value.log.length > 160) state.value.log.splice(0, state.value.log.length - 160)
  }

  function fail(message) {
    append('error', message)
    state.value.errorRevision += 1
    return { ok: false, error: true, event: 'error' }
  }

  function updateStage() {
    state.value.stage =
      state.value.status === 'won' ? 3 : state.value.connected ? 2 : state.value.decoded ? 1 : 0
  }

  function tick() {
    if (state.value.status !== 'playing' || state.value.paused) return state.value.elapsed
    // Compare timestamps rather than counting callbacks, so hidden-tab play still counts.
    // Keep a millisecond high-water mark so clock corrections cannot improve a finish time.
    state.value.elapsedMs = Math.max(
      state.value.elapsedMs,
      Math.floor(Math.max(0, now() - startedAt)),
    )
    state.value.elapsed = Math.floor(state.value.elapsedMs / 1000)
    return state.value.elapsed
  }

  function pause() {
    tick()
    if (state.value.status !== 'playing' || state.value.paused) return false
    pausedAt = now()
    state.value.paused = true
    return true
  }

  function resume() {
    if (state.value.status !== 'playing' || !state.value.paused) return false
    // Exclude time in the guide without resetting elapsed play or its fractional second.
    startedAt += Math.max(0, now() - pausedAt)
    pausedAt = null
    state.value.paused = false
    return true
  }

  function begin() {
    state.value = initialState()
    state.value.status = 'playing'
    cwd.value = ''
    history = []
    historyIndex = 0
    savedDraft = ''
    startedAt = now()
    pausedAt = null
    append('system', 'ROOTKIT OS // LOCAL TRAINING SIMULATION')
    append(
      'system',
      'No time limit. Decode the order, authenticate the coffee service, then brew. Faster finishes rank higher.',
    )
    append(
      'output',
      'Read README.txt to begin. Type help for commands. Desktop utilities hold the other clues.',
    )
    return true
  }

  function start() {
    if (state.value.status !== 'ready') return false
    return begin()
  }

  function restart() {
    return begin()
  }

  function active() {
    tick()
    return state.value.status === 'playing' && !state.value.paused
  }

  function inspectPacket() {
    if (!active()) return { ok: false, error: true, event: 'error' }
    if (state.value.portFound) return ok()
    state.value.portFound = true
    state.value.packetPort = RULES.port
    append('success', `Red packet inspected // coffee.local destination port: ${RULES.port}.`)
    return ok('unlock')
  }

  function setFrequency(value) {
    if (!active()) return { ok: false, error: true, event: 'error' }
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !value.trim()) ||
      !Number.isFinite(Number(value))
    )
      return fail('Frequency must be a finite number between 200 and 600 MHz.')
    state.value.frequency = Math.min(600, Math.max(200, Math.round(Number(value))))
    if (state.value.frequency !== RULES.frequency || state.value.passcodeFound) return ok()
    state.value.passcodeFound = true
    state.value.passcode = RULES.passcode
    append(
      'success',
      `System Monitor locked at ${RULES.frequency} MHz // authentication passcode: ${RULES.passcode}.`,
    )
    return ok('unlock')
  }

  function remember(line) {
    history.push(line)
    if (history.length > 80) history.splice(0, history.length - 80)
    historyIndex = history.length
    savedDraft = ''
  }

  function execute(line) {
    tick()
    if (state.value.paused) return { ok: false, error: true, event: 'error' }
    if (state.value.status === 'ready') return fail('Start the mission before using the terminal.')
    if (state.value.status !== 'playing') return { ok: false, error: true, event: 'error' }
    const source = typeof line === 'string' ? line.trim() : ''
    if (state.value.awaitingPassword) {
      // Password attempts deliberately bypass both command history and input logs.
      if (source !== RULES.passcode)
        return fail('Permission denied. Password is hidden; try again at this prompt.')
      state.value.awaitingPassword = false
      state.value.connected = true
      updateStage()
      append(
        'success',
        'Authenticated as barista@coffee.local. Inspect brew.sh for the approved final command.',
      )
      return ok('unlock')
    }
    if (!source) return ok()
    if (source.length > 512)
      return fail('Command too long. Keep local commands within 512 characters.')
    append('input', `${prompt.value} ${source}`)
    remember(source)
    try {
      const { tokens } = tokenize(source)
      const [command, ...args] = tokens
      switch (command) {
        case 'help':
          append('output', formatCommandHelp())
          return ok()
        case 'pwd':
          if (args.length) return fail('Usage: pwd')
          append('output', `${ROOT}${cwd.value ? `/${cwd.value}` : ''}`)
          return ok()
        case 'ls': {
          if (args.length > 1) return fail('Usage: ls [directory]')
          const path = args.length ? resolvePath(args[0], cwd.value) : cwd.value
          if (!isDirectory(path)) return fail(`${args[0]}: directory not found.`)
          append('output', directoryEntries(path).join('  '))
          return ok()
        }
        case 'cd': {
          if (args.length > 1) return fail('Usage: cd <directory>')
          const path = args.length ? resolvePath(args[0], cwd.value) : ''
          if (!isDirectory(path)) return fail(`${args[0]}: directory not found.`)
          cwd.value = path
          return ok()
        }
        case 'cat': {
          if (args.length !== 1) return fail('Usage: cat <file>')
          append('output', readFile(args[0], cwd.value).content)
          return ok()
        }
        case 'grep': {
          const insensitive = args[0] === '-i'
          const searchArgs = insensitive ? args.slice(1) : args
          if (searchArgs.length !== 2)
            return fail('Usage: grep [-i] <pattern> <file>. Quote patterns containing spaces.')
          const [pattern, filename] = searchArgs
          const file = readFile(filename, cwd.value)
          const needle = insensitive ? pattern.toLowerCase() : pattern
          const matches = file.content.split('\n').flatMap((text, index) => {
            const haystack = insensitive ? text.toLowerCase() : text
            return haystack.includes(needle) ? [`${file.path}:${index + 1}: ${text}`] : []
          })
          append('output', matches.length ? matches.join('\n') : 'No matching lines.')
          return ok()
        }
        case 'clear':
          if (args.length) return fail('Usage: clear')
          state.value.log = []
          return ok('command', { clear: true })
        case 'decrypt': {
          let cipher = args[0]
          let shift
          if (args.length === 1 && /^[-+]?\d+$/.test(args[0])) {
            cipher = RULES.cipher
            shift = Number(args[0])
          } else if (args.length === 2 && /^[-+]?\d+$/.test(args[1])) shift = Number(args[1])
          else if (args.length === 3 && args[1] === '--shift' && /^[-+]?\d+$/.test(args[2]))
            shift = Number(args[2])
          else if (args.length === 2 && /^--shift=[-+]?\d+$/.test(args[1]))
            shift = Number(args[1].slice(8))
          if (!cipher || !Number.isSafeInteger(shift))
            return fail(
              'Usage: decrypt <cipher> --shift <number>. Convert the sticky note binary key to decimal.',
            )
          const decoded = decryptCaesar(cipher, shift)
          if (cipher.toLowerCase() !== RULES.cipher || decoded.toLowerCase() !== RULES.decoded) {
            return fail(
              `Decoded: ${decoded}. That does not validate the captured order; check the cipher and shift.`,
            )
          }
          const newlyDecoded = !state.value.decoded
          state.value.decoded = true
          updateStage()
          append(
            'success',
            'Cipher recovered: espresso. Next: use Sniffer for the port and System Monitor for the passcode, then ssh.',
          )
          return ok(newlyDecoded ? 'unlock' : 'command')
        }
        case 'ssh': {
          if (state.value.connected)
            return fail(
              'Already connected. Use disconnect before opening another simulated session.',
            )
          if (!state.value.decoded)
            return fail('Decode the captured order before connecting to the coffee service.')
          if (!state.value.portFound)
            return fail('Inspect the red packet in Sniffer to discover the service port.')
          if (!state.value.passcodeFound)
            return fail('Tune the System Monitor to recover the authentication passcode first.')
          if (
            args.length !== 3 ||
            args[0] !== `${RULES.user}@${RULES.host}` ||
            args[1] !== '-p' ||
            args[2] !== String(RULES.port)
          ) {
            return fail(
              'Connection refused. Use ssh <user>@<host> -p <port> with the discovered network details.',
            )
          }
          state.value.awaitingPassword = true
          append(
            'system',
            'Coffee service located. Enter the System Monitor passcode; password attempts will not be displayed or saved.',
          )
          return ok()
        }
        case 'sudo':
          if (!state.value.connected)
            return fail('Authentication required. Connect to the coffee service before brewing.')
          if (args.length !== 2 || args[0] !== 'brew' || args[1] !== '--espresso')
            return fail('Only the approved command is supported: sudo brew --espresso')
          state.value.status = 'won'
          updateStage()
          append(
            'success',
            `ESPRESSO ONLINE // Mission completed in ${state.value.elapsed} seconds.`,
          )
          return ok('unlock')
        case 'exit':
        case 'disconnect':
          if (args.length) return fail(`Usage: ${command}`)
          state.value.connected = false
          state.value.awaitingPassword = false
          updateStage()
          append('system', 'Local terminal active. No real network connection was opened.')
          return ok()
        default:
          return fail(`${command}: command not found. Type help for the local simulation commands.`)
      }
    } catch (error) {
      return fail(error.message)
    }
  }

  function historyPrevious(draft = '') {
    if (state.value.awaitingPassword || !history.length)
      return typeof draft === 'string' ? draft : ''
    if (historyIndex === history.length) savedDraft = typeof draft === 'string' ? draft : ''
    historyIndex = Math.max(0, historyIndex - 1)
    return history[historyIndex]
  }

  function historyNext() {
    if (state.value.awaitingPassword) return ''
    if (historyIndex < history.length - 1) return history[++historyIndex]
    historyIndex = history.length
    return savedDraft
  }

  function pathMatches(prefix, directoriesOnly) {
    const slash = prefix.lastIndexOf('/')
    const parent = slash < 0 ? '' : prefix.slice(0, slash + 1)
    const fragment = slash < 0 ? prefix : prefix.slice(slash + 1)
    let path
    try {
      path = parent ? resolvePath(parent, cwd.value) : cwd.value
    } catch {
      return []
    }
    if (!isDirectory(path)) return []
    return directoryEntries(path)
      .filter((name) => name.startsWith(fragment) && (!directoriesOnly || name.endsWith('/')))
      .map((name) => `${parent}${name}`)
  }

  function complete(line) {
    const source = typeof line === 'string' ? line : ''
    const unchanged = { value: source, matches: [] }
    if (state.value.awaitingPassword) return unchanged
    let parsed
    try {
      parsed = tokenize(source, true)
    } catch {
      return unchanged
    }
    const trailingSpace = /\s$/.test(source) && !parsed.quote
    const tokens = trailingSpace
      ? [...parsed.tokens, '']
      : parsed.tokens.length
        ? parsed.tokens
        : ['']
    const index = tokens.length - 1
    const prefix = tokens[index]
    const start = trailingSpace ? source.length : parsed.starts.at(-1) || 0
    const command = tokens[0]
    let candidates = []
    if (index === 0) candidates = COMMANDS
    else if (command === 'decrypt') {
      if (index === 1) candidates = [RULES.cipher]
      else if (index === 2)
        candidates = prefix.startsWith('--shift=') ? ['--shift=3'] : ['--shift', '3']
      else if (index === 3 && tokens[2] === '--shift') candidates = ['3']
    } else if (command === 'ssh') {
      if (index === 1) candidates = [`${RULES.user}@${RULES.host}`]
      else if (index === 2) candidates = ['-p']
      else if (index === 3 && tokens[2] === '-p' && state.value.portFound)
        candidates = [String(RULES.port)]
    } else if (command === 'sudo') {
      if (index === 1) candidates = ['brew']
      else if (index === 2 && tokens[1] === 'brew') candidates = ['--espresso']
    } else if (
      (['ls', 'cd', 'cat'].includes(command) && index === 1) ||
      (command === 'grep' && index === (tokens[1] === '-i' ? 3 : 2))
    )
      candidates = pathMatches(prefix, command === 'cd' || command === 'ls')
    const matches = candidates.filter((candidate) => candidate.startsWith(prefix)).sort()
    if (!matches.length) return unchanged
    let replacement = matches[0]
    // Ambiguous matches extend only their shared prefix; Tab must not guess a file.
    for (const match of matches.slice(1)) {
      while (!match.startsWith(replacement)) replacement = replacement.slice(0, -1)
    }
    if (replacement.length <= prefix.length && matches.length > 1) return { value: source, matches }
    const quote = ['"', "'"].includes(source[start]) ? source[start] : ''
    const finished = matches.length === 1 && !replacement.endsWith('/')
    return {
      value: `${source.slice(0, start)}${quote}${replacement}${finished ? `${quote} ` : ''}`,
      matches,
    }
  }

  return {
    state,
    prompt,
    execute,
    complete,
    historyPrevious,
    historyNext,
    start,
    restart,
    tick,
    pause,
    resume,
    inspectPacket,
    setFrequency,
  }
}
