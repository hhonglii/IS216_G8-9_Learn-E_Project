import { describe, expect, it, vi } from 'vitest'
import { filesystem, useRootkitEngine } from '../games/rootkit/useRootkitEngine.js'

function setup() {
  let time = 100_000
  const game = useRootkitEngine({ now: () => time })
  return {
    game,
    advance: (milliseconds) => {
      time += milliseconds
    },
  }
}
function solveClues(game) {
  game.execute('decrypt hvsuhvvr --shift 3')
  game.inspectPacket()
  game.setFrequency(404)
}
function authenticate(game) {
  solveClues(game)
  game.execute('ssh barista@coffee.local -p 4040')
  game.execute('BEAN-404')
}
const lastText = (game) => game.state.value.log.at(-1)?.text

describe('ROOTKIT recovery mission', () => {
  it('stays idle until boot and completes all stages after more than twenty minutes', () => {
    const { game, advance } = setup()
    advance(700_000)
    game.tick()
    expect(game.state.value).toMatchObject({ status: 'ready', elapsedMs: 0, stage: 0 })
    expect(game.execute('help')).toMatchObject({ ok: false, error: true, event: 'error' })
    expect(game.start()).toBe(true)
    expect(
      game.state.value.log.some((entry) => entry.text.includes('LOCAL TRAINING SIMULATION')),
    ).toBe(true)
    expect(game.execute('decrypt hvsuhvvr --shift 3')).toMatchObject({ ok: true, event: 'unlock' })
    expect(game.state.value).toMatchObject({ decoded: true, stage: 1 })
    expect(lastText(game)).toContain('espresso')
    game.inspectPacket()
    game.setFrequency(404)
    expect(game.execute('ssh barista@coffee.local -p 4040').ok).toBe(true)
    expect(game.prompt.value).toBe('password:')
    expect(game.execute('BEAN-404')).toMatchObject({ ok: true, event: 'unlock' })
    expect(game.state.value).toMatchObject({ connected: true, stage: 2, awaitingPassword: false })
    advance(1_299_000)
    expect(game.execute('sudo brew --espresso')).toMatchObject({ ok: true, event: 'unlock' })
    expect(game.state.value).toMatchObject({
      status: 'won',
      stage: 3,
      elapsed: 1299,
      elapsedMs: 1_299_000,
    })
    advance(999_000)
    game.tick()
    expect(game.state.value.elapsedMs).toBe(1_299_000)
  })

  it('requires each terminal and utility discovery before authentication and brewing', () => {
    const { game } = setup()
    game.start()
    expect(game.execute('sudo brew --espresso').error).toBe(true)
    expect(game.execute('ssh barista@coffee.local -p 4040').error).toBe(true)
    expect(lastText(game)).toContain('Decode')
    game.execute('decrypt hvsuhvvr 3')
    expect(game.execute('ssh barista@coffee.local -p 4040').error).toBe(true)
    expect(lastText(game)).toContain('red packet')
    game.inspectPacket()
    expect(game.execute('ssh barista@coffee.local -p 4040').error).toBe(true)
    expect(lastText(game)).toContain('System Monitor')
    game.setFrequency(404)
    expect(game.execute('ssh wrong@coffee.local -p 4040').error).toBe(true)
    expect(game.execute('ssh barista@coffee.local -p 22').error).toBe(true)
    expect(game.state.value.awaitingPassword).toBe(false)
    game.execute('ssh barista@coffee.local -p 4040')
    game.execute('BEAN-404')
    expect(game.execute('sudo brew --latte').error).toBe(true)
    expect(game.state.value.status).toBe('playing')
  })

  it('permits utility clues in any order without prematurely advancing terminal stages', () => {
    const { game } = setup()
    game.start()
    expect(game.setFrequency(404).event).toBe('unlock')
    expect(game.inspectPacket().event).toBe('unlock')
    expect(game.state.value).toMatchObject({ stage: 0, packetPort: 4040, passcode: 'BEAN-404' })
    game.execute('decrypt 3')
    expect(game.state.value.stage).toBe(1)
    game.execute('ssh barista@coffee.local -p 4040')
    game.execute('BEAN-404')
    game.execute('disconnect')
    expect(game.state.value).toMatchObject({ stage: 1, connected: false, decoded: true })
    expect(game.prompt.value).toBe('student@rootkit:~$')
  })

  it('keeps wrong and correct password attempts out of input logs and command history', () => {
    const { game } = setup()
    game.start()
    solveClues(game)
    game.execute('ssh barista@coffee.local -p 4040')
    const before = game.state.value.log.filter((entry) => entry.kind === 'input').length
    expect(game.execute('private-wrong-password').error).toBe(true)
    expect(game.state.value.awaitingPassword).toBe(true)
    expect(game.complete('BEAN')).toEqual({ value: 'BEAN', matches: [] })
    expect(game.historyPrevious('draft')).toBe('draft')
    game.execute('BEAN-404')
    expect(game.state.value.log.filter((entry) => entry.kind === 'input')).toHaveLength(before)
    expect(
      game.state.value.log.some((entry) => entry.text.includes('private-wrong-password')),
    ).toBe(false)
    expect(game.historyPrevious('')).toBe('ssh barista@coffee.local -p 4040')
    expect(game.historyPrevious('')).not.toContain('BEAN-404')
    expect(
      game.state.value.log
        .filter((entry) => entry.kind === 'input')
        .some((entry) => entry.text.includes('BEAN-404')),
    ).toBe(false)
  })

  it.each([
    'decrypt hvsuhvvr --shift 3',
    'decrypt hvsuhvvr 3',
    'decrypt 3',
    'decrypt hvsuhvvr --shift=3',
  ])('accepts Caesar command %s', (command) => {
    const { game } = setup()
    game.start()
    expect(game.execute(command).ok).toBe(true)
    expect(game.state.value.decoded).toBe(true)
  })

  it.each([
    'decrypt',
    'decrypt hvsuhvvr',
    'decrypt hvsuhvvr --shift',
    'decrypt hvsuhvvr --shift nope',
    'decrypt hvsuhvvr 2',
    'decrypt wrong 3',
  ])('rejects incomplete or incorrect decoding: %s', (command) => {
    const { game } = setup()
    game.start()
    expect(game.execute(command)).toMatchObject({ ok: false, error: true, event: 'error' })
    expect(game.state.value.decoded).toBe(false)
    expect(game.state.value.stage).toBe(0)
  })
})

describe('ROOTKIT local virtual terminal', () => {
  it('lists and reads useful files through relative paths, absolute paths and basename aliases', () => {
    const { game } = setup()
    game.start()
    game.execute('pwd')
    expect(lastText(game)).toBe('/home/student')
    game.execute('ls')
    expect(lastText(game)).toContain('README.txt')
    expect(lastText(game)).toContain('notes/')
    game.execute('cat /home/student/cipher.txt')
    expect(lastText(game)).toContain('hvsuhvvr')
    game.execute('cd notes')
    expect(game.prompt.value).toBe('student@rootkit:~/notes$')
    game.execute('cat ../network.log')
    expect(lastText(game)).toContain('coffee.local')
    game.execute('cat cipher.txt')
    expect(lastText(game)).toContain('hvsuhvvr')
    game.execute('cd /')
    expect(game.prompt.value).toBe('student@rootkit:~$')
    game.execute('cat clock.txt')
    expect(lastText(game)).toContain('HTTP Not Found')
    expect(Object.isFrozen(filesystem.files)).toBe(true)
  })

  it('normalizes dot paths and refuses traversal above the virtual root', () => {
    const { game } = setup()
    game.start()
    expect(game.execute('cd notes/./../notes').ok).toBe(true)
    expect(game.execute('cd ../../').error).toBe(true)
    expect(game.prompt.value).toBe('student@rootkit:~/notes$')
    expect(game.execute('cat ../../../etc/passwd').error).toBe(true)
    expect(game.execute('cat /home/other/cipher.txt').error).toBe(true)
    expect(game.execute('cat /home/student/../cipher.txt').error).toBe(true)
    game.execute('cd ~')
    expect(game.execute('cd ..').error).toBe(true)
    expect(game.execute('ls README.txt').error).toBe(true)
    expect(game.execute('cat notes').error).toBe(true)
    expect(game.execute('cat missing.txt').error).toBe(true)
  })

  it('parses quoted grep patterns and reports literal matches with line numbers', () => {
    const { game } = setup()
    game.start()
    expect(game.execute('grep "System Monitor" README.txt').ok).toBe(true)
    expect(lastText(game)).toContain('README.txt:4:')
    expect(game.execute("grep -i 'COFFEE.LOCAL' network.log").ok).toBe(true)
    expect(lastText(game)).toContain('network.log:1:')
    expect(game.execute('grep absent cipher.txt').ok).toBe(true)
    expect(lastText(game)).toBe('No matching lines.')
    expect(game.execute('grep too many words cipher.txt').error).toBe(true)
    expect(game.execute('cat "cipher.txt').error).toBe(true)
    expect(lastText(game)).toContain('Unclosed quote')
  })

  it.each([
    'help; sudo brew --espresso',
    'cat cipher.txt | grep h',
    'help && pwd',
    'cat < cipher.txt',
    'help > out',
    '$(alert(1))',
    '`help`',
    'help\npwd',
    'help\rpwd',
    'help\0pwd',
  ])('rejects shell operators without running anything: %j', (command) => {
    const { game } = setup()
    game.start()
    const before = game.state.value.errorRevision
    expect(game.execute(command)).toMatchObject({ ok: false, error: true, event: 'error' })
    expect(game.state.value.errorRevision).toBe(before + 1)
    expect(lastText(game)).toContain('unsupported')
    expect(game.state.value).toMatchObject({ decoded: false, connected: false, status: 'playing' })
  })

  it('never invokes a real shell, network, eval, or javascript while accepting unknown commands safely', () => {
    const { game } = setup()
    game.start()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const evalSpy = vi.spyOn(globalThis, 'eval')
    expect(game.execute('fetch coffee.local').error).toBe(true)
    expect(game.execute('eval alert(1)').error).toBe(true)
    expect(game.execute('rm -rf /').error).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(evalSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    evalSpy.mockRestore()
  })

  it('navigates bounded command history while restoring the unsubmitted draft', () => {
    const { game } = setup()
    game.start()
    game.execute('pwd')
    game.execute('ls')
    expect(game.historyPrevious('cat ci')).toBe('ls')
    expect(game.historyPrevious('ignored')).toBe('pwd')
    expect(game.historyPrevious('ignored')).toBe('pwd')
    expect(game.historyNext()).toBe('ls')
    expect(game.historyNext()).toBe('cat ci')
    expect(game.historyNext()).toBe('cat ci')
    for (let index = 0; index < 90; index += 1) game.execute(`unknown-${index}`)
    const visited = []
    for (let index = 0; index < 100; index += 1) visited.push(game.historyPrevious('draft'))
    expect(new Set(visited).size).toBe(80)
    expect(visited.at(-1)).toBe('unknown-10')
    expect(game.state.value.log).toHaveLength(160)
    expect(new Set(game.state.value.log.map((entry) => entry.id)).size).toBe(160)
  })

  it('returns clear metadata and does not treat blank input as an error', () => {
    const { game } = setup()
    game.start()
    const count = game.state.value.log.length
    expect(game.execute('  ')).toMatchObject({ ok: true, error: false, event: 'command' })
    expect(game.state.value.log).toHaveLength(count)
    expect(game.execute('clear')).toEqual({ ok: true, error: false, event: 'command', clear: true })
    expect(game.state.value.log).toEqual([])
    expect(game.historyPrevious('')).toBe('clear')
  })

  it('completes commands, relative and quoted paths, and useful flags without leaking passwords', () => {
    const { game } = setup()
    game.start()
    expect(game.complete('d')).toEqual({ value: 'd', matches: ['decrypt', 'disconnect'] })
    expect(game.complete('de')).toEqual({ value: 'decrypt ', matches: ['decrypt'] })
    expect(game.complete('dec')).toEqual({ value: 'decrypt ', matches: ['decrypt'] })
    expect(game.complete('cat ci')).toEqual({ value: 'cat cipher.txt ', matches: ['cipher.txt'] })
    expect(game.complete('cat "ci')).toEqual({
      value: 'cat "cipher.txt" ',
      matches: ['cipher.txt'],
    })
    expect(game.complete('cd no')).toEqual({ value: 'cd notes/', matches: ['notes/'] })
    expect(game.complete('cat notes/cl')).toEqual({
      value: 'cat notes/clock.txt ',
      matches: ['notes/clock.txt'],
    })
    expect(game.complete('cat /home/student/ci').value).toBe('cat /home/student/cipher.txt ')
    expect(game.complete('decrypt hvsuhvvr --s').value).toBe('decrypt hvsuhvvr --shift ')
    expect(game.complete('decrypt hvsuhvvr --shift ').value).toBe('decrypt hvsuhvvr --shift 3 ')
    expect(game.complete('ssh barista@coffee.local -').value).toBe('ssh barista@coffee.local -p ')
    expect(game.complete('ssh barista@coffee.local -p ').matches).toEqual([])
    game.inspectPacket()
    expect(game.complete('ssh barista@coffee.local -p ').value).toBe(
      'ssh barista@coffee.local -p 4040 ',
    )
    expect(game.complete('sudo brew --e').value).toBe('sudo brew --espresso ')
    expect(game.complete('cat ../../').matches).toEqual([])
    expect(game.complete('help;').matches).toEqual([])
    expect(game.complete('BEAN').matches).toEqual([])
  })

  it('offers only folders to ls completion while keeping file completion for cat and grep', () => {
    const { game } = setup()
    game.start()
    expect(game.complete('ls ')).toEqual({ value: 'ls notes/', matches: ['notes/'] })
    expect(game.complete('ls R')).toEqual({ value: 'ls R', matches: [] })
    expect(game.complete('ls "no').value).toBe('ls "notes/')
    expect(game.complete('cat R').value).toBe('cat README.txt ')
    expect(game.complete('grep coffee net').value).toBe('grep coffee network.log ')
    game.execute('cd notes')
    expect(game.complete('ls ').matches).toEqual([])
    expect(game.complete('cat cl').value).toBe('cat clock.txt ')
  })

  it('accepts escaped spaces and escaped quote characters without treating them as operators', () => {
    const { game } = setup()
    game.start()
    expect(game.execute('grep System\\ Monitor README.txt').ok).toBe(true)
    expect(lastText(game)).toContain('README.txt:4:')
    expect(game.execute('grep "System \\"Monitor\\"" README.txt').ok).toBe(true)
    expect(lastText(game)).toBe('No matching lines.')
    expect(game.execute("cat 'notes/clock.txt'").ok).toBe(true)
    expect(lastText(game)).toContain('HTTP Not Found')
  })

  it('rejects an oversized command without retaining its contents in input logs or history', () => {
    const { game } = setup()
    game.start()
    game.execute('pwd')
    const oversized = `private-draft-${'x'.repeat(512)}`
    expect(game.execute(oversized).error).toBe(true)
    expect(game.state.value.log.some((entry) => entry.text.includes(oversized))).toBe(false)
    expect(game.historyPrevious('draft')).toBe('pwd')
  })

  it('treats command-looking password attempts as private text instead of parsed commands', () => {
    const { game } = setup()
    game.start()
    solveClues(game)
    game.execute('ssh barista@coffee.local -p 4040')
    const inputCount = game.state.value.log.filter((entry) => entry.kind === 'input').length
    const logCount = game.state.value.log.length
    for (const secret of ['help', 'private; pwd', 'private\0attempt', 'private\nattempt']) {
      expect(game.execute(secret).error).toBe(true)
      expect(lastText(game)).toContain('Permission denied')
      expect(game.state.value.awaitingPassword).toBe(true)
      expect(
        game.state.value.log.slice(logCount).some((entry) => entry.text.includes(secret)),
      ).toBe(false)
    }
    expect(game.state.value.log.filter((entry) => entry.kind === 'input')).toHaveLength(inputCount)
    game.execute('BEAN-404')
    expect(game.historyPrevious('draft')).toBe('ssh barista@coffee.local -p 4040')
  })
})

describe('ROOTKIT clock and utility state', () => {
  it('freezes a precise finish time, excluding every help pause and all time before boot', () => {
    const { game, advance } = setup()
    advance(12_345)
    expect(game.state.value.elapsedMs).toBe(0)
    game.start()
    authenticate(game)
    advance(1250)
    game.pause()
    expect(game.state.value.elapsedMs).toBe(1250)
    advance(66_789)
    game.tick()
    expect(game.state.value.elapsedMs).toBe(1250)
    game.resume()
    advance(375)
    game.pause()
    advance(20_000)
    game.resume()
    advance(42)
    game.execute('sudo brew --espresso')
    expect(game.state.value).toMatchObject({
      status: 'won',
      elapsedMs: 1667,
      elapsed: 1,
    })
    advance(900_000)
    game.tick()
    expect(game.state.value.elapsedMs).toBe(1667)
    game.restart()
    expect(game.state.value).toMatchObject({ elapsedMs: 0, elapsed: 0 })
    advance(9)
    game.tick()
    expect(game.state.value.elapsedMs).toBe(9)
  })

  it('never refunds subsecond play after a clock rollback and keeps counting beyond five minutes', () => {
    const { game, advance } = setup()
    game.start()
    advance(1250)
    game.tick()
    advance(-500)
    game.tick()
    expect(game.state.value.elapsedMs).toBe(1250)
    advance(501)
    game.tick()
    expect(game.state.value.elapsedMs).toBe(1251)
    advance(900_000)
    game.tick()
    expect(game.state.value).toMatchObject({
      status: 'playing',
      elapsedMs: 901_251,
      elapsed: 901,
    })
    authenticate(game)
    expect(game.execute('sudo brew --espresso').ok).toBe(true)
    expect(game.state.value.elapsedMs).toBe(901_251)
  })

  it('does not refund elapsed seconds when the wall clock moves backwards', () => {
    const { game, advance } = setup()
    game.start()
    advance(30_000)
    expect(game.tick()).toBe(30)
    advance(-20_000)
    expect(game.tick()).toBe(30)
    advance(20_000)
    expect(game.tick()).toBe(30)
    advance(1_000)
    expect(game.tick()).toBe(31)
  })

  it('pauses tutorial time and resumes without charging the paused duration', () => {
    const { game, advance } = setup()
    expect(game.state.value.paused).toBe(false)
    expect(game.pause()).toBe(false)
    expect(game.resume()).toBe(false)
    game.start()
    advance(1250)
    expect(game.pause()).toBe(true)
    expect(game.state.value).toMatchObject({
      status: 'playing',
      paused: true,
      elapsed: 1,
    })
    advance(600_000)
    expect(game.tick()).toBe(1)
    expect(game.pause()).toBe(false)
    expect(game.resume()).toBe(true)
    expect(game.resume()).toBe(false)
    expect(game.state.value).toMatchObject({ paused: false, elapsed: 1 })
    advance(298_749)
    expect(game.tick()).toBe(299)
    advance(1)
    expect(game.tick()).toBe(300)
    expect(game.state.value.status).toBe('playing')
  })

  it('excludes each pause exactly once over repeated tutorial visits', () => {
    const { game, advance } = setup()
    game.start()
    advance(1000)
    game.pause()
    advance(10_000)
    game.resume()
    advance(1000)
    game.pause()
    advance(20_000)
    game.resume()
    advance(1000)
    expect(game.tick()).toBe(3)
    expect(game.state.value.elapsed).toBe(3)
  })

  it('refuses all puzzle mutations while paused without touching logs or history', () => {
    const { game } = setup()
    game.start()
    game.execute('pwd')
    game.pause()
    const before = JSON.stringify(game.state.value)
    expect(game.execute('decrypt hvsuhvvr --shift 3').ok).toBe(false)
    expect(game.execute('clear').ok).toBe(false)
    expect(game.inspectPacket().ok).toBe(false)
    expect(game.setFrequency(404).ok).toBe(false)
    expect(game.setFrequency('invalid').ok).toBe(false)
    expect(JSON.stringify(game.state.value)).toBe(before)
    game.resume()
    expect(game.historyPrevious('draft')).toBe('pwd')
    expect(game.historyNext()).toBe('draft')
  })

  it('preserves a pending hidden password while the tutorial is open', () => {
    const { game, advance } = setup()
    game.start()
    solveClues(game)
    game.execute('ssh barista@coffee.local -p 4040')
    game.pause()
    const before = JSON.stringify(game.state.value)
    advance(400_000)
    expect(game.execute('BEAN-404').ok).toBe(false)
    expect(game.execute('private-password').ok).toBe(false)
    expect(JSON.stringify(game.state.value)).toBe(before)
    expect(game.prompt.value).toBe('password:')
    game.resume()
    expect(game.execute('BEAN-404').ok).toBe(true)
    expect(game.state.value).toMatchObject({ connected: true, elapsedMs: 0 })
  })

  it('can pause and resume an ongoing mission after twenty minutes', () => {
    const { game, advance } = setup()
    game.start()
    advance(1_200_000)
    expect(game.pause()).toBe(true)
    expect(game.state.value).toMatchObject({ status: 'playing', paused: true, elapsed: 1200 })
    advance(600_000)
    expect(game.tick()).toBe(1200)
    expect(game.resume()).toBe(true)
    advance(1000)
    authenticate(game)
    expect(game.execute('sudo brew --espresso').ok).toBe(true)
    expect(game.state.value).toMatchObject({ status: 'won', elapsedMs: 1_201_000 })
  })

  it('clears pause state and its timestamp when restarting a mission', () => {
    const { game, advance } = setup()
    game.start()
    advance(60_000)
    game.pause()
    advance(900_000)
    game.restart()
    expect(game.state.value).toMatchObject({ paused: false, elapsed: 0 })
    expect(game.resume()).toBe(false)
    advance(300_000)
    expect(game.tick()).toBe(300)
    expect(game.state.value.status).toBe('playing')
  })

  it('counts hidden or throttled wall-clock time without expiring the mission', () => {
    const { game, advance } = setup()
    game.start()
    advance(299_999)
    expect(game.tick()).toBe(299)
    advance(1)
    expect(game.tick()).toBe(300)
    expect(game.state.value).toMatchObject({ status: 'playing', elapsed: 300 })
    const logs = game.state.value.log.length
    advance(1_200_000)
    expect(game.tick()).toBe(1500)
    expect(game.state.value.log).toHaveLength(logs)
    expect(game.execute('help').ok).toBe(true)
  })

  it('timestamps delayed final commands and password submission without an interval tick', () => {
    const { game, advance } = setup()
    game.start()
    authenticate(game)
    advance(1_200_000)
    expect(game.execute('sudo brew --espresso').ok).toBe(true)
    expect(game.state.value).toMatchObject({ status: 'won', elapsedMs: 1_200_000 })
    game.restart()
    solveClues(game)
    game.execute('ssh barista@coffee.local -p 4040')
    advance(1_200_000)
    expect(game.execute('BEAN-404').ok).toBe(true)
    expect(game.state.value).toMatchObject({
      status: 'playing',
      connected: true,
      awaitingPassword: false,
      elapsedMs: 1_200_000,
    })
    expect(
      game.state.value.log
        .filter((entry) => entry.kind === 'input')
        .some((entry) => entry.text.includes('BEAN-404')),
    ).toBe(false)
  })

  it('does not let start reset an active timer, and restart resets the entire mission', () => {
    const { game, advance } = setup()
    game.start()
    authenticate(game)
    game.execute('cd notes')
    advance(60_000)
    expect(game.start()).toBe(false)
    expect(game.tick()).toBe(60)
    expect(game.restart()).toBe(true)
    expect(game.state.value).toMatchObject({
      status: 'playing',
      elapsed: 0,
      stage: 0,
      decoded: false,
      connected: false,
      portFound: false,
      passcodeFound: false,
      frequency: 320,
      packetPort: null,
      passcode: null,
      awaitingPassword: false,
      errorRevision: 0,
    })
    expect(game.prompt.value).toBe('student@rootkit:~$')
    expect(game.historyPrevious('draft')).toBe('draft')
    expect(game.state.value.log).toHaveLength(3)
  })

  it('clamps and rounds finite frequency inputs, unlocking only 404 and retaining the discovery', () => {
    const { game } = setup()
    game.start()
    game.setFrequency(100)
    expect(game.state.value.frequency).toBe(200)
    game.setFrequency(900)
    expect(game.state.value.frequency).toBe(600)
    game.setFrequency('403')
    expect(game.state.value.passcodeFound).toBe(false)
    expect(game.setFrequency(403.6).event).toBe('unlock')
    expect(game.state.value).toMatchObject({
      frequency: 404,
      passcodeFound: true,
      passcode: 'BEAN-404',
    })
    const logs = game.state.value.log.length
    game.setFrequency(404)
    expect(game.state.value.log).toHaveLength(logs)
    game.setFrequency(500)
    expect(game.state.value.passcodeFound).toBe(true)
  })

  it.each([NaN, Infinity, -Infinity, '', ' ', '404MHz', null, undefined, {}, []])(
    'rejects invalid frequency %j without changing the dial',
    (value) => {
      const { game } = setup()
      game.start()
      expect(game.setFrequency(value)).toMatchObject({ ok: false, error: true, event: 'error' })
      expect(game.state.value).toMatchObject({ frequency: 320, passcodeFound: false })
    },
  )

  it('guards ready and completed utilities, with discoveries still available after twenty minutes', () => {
    const { game, advance } = setup()
    expect(game.inspectPacket().ok).toBe(false)
    expect(game.setFrequency(404).ok).toBe(false)
    game.start()
    expect(game.inspectPacket().event).toBe('unlock')
    const logs = game.state.value.log.length
    expect(game.inspectPacket().event).toBe('command')
    expect(game.state.value.log).toHaveLength(logs)
    advance(1_200_000)
    expect(game.setFrequency(404).event).toBe('unlock')
    expect(game.state.value.passcodeFound).toBe(true)
    authenticate(game)
    game.execute('sudo brew --espresso')
    expect(game.inspectPacket().ok).toBe(false)
    expect(game.setFrequency(404).ok).toBe(false)
  })
})
