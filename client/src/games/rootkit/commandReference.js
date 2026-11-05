// One catalog supplies terminal help, completion names, and both rendered references.
export const COMMAND_REFERENCE = Object.freeze([
  {
    name: 'help',
    group: 'Terminal',
    syntax: 'help',
    description: 'Show the complete command list inside the terminal.',
    examples: ['help'],
  },
  {
    name: 'ls',
    group: 'Files and folders',
    syntax: 'ls [directory]',
    description: 'List the files and folders in your current folder, or a folder you name.',
    examples: ['ls', 'ls notes'],
    note: 'Flags such as -l and -a are not supported.',
  },
  {
    name: 'pwd',
    group: 'Files and folders',
    syntax: 'pwd',
    description: 'Show your current location in the virtual file system.',
    examples: ['pwd'],
  },
  {
    name: 'cd',
    group: 'Files and folders',
    syntax: 'cd [directory]',
    description: 'Change folders. Leave out the directory to return home.',
    examples: ['cd notes', 'cd ..', 'cd ~'],
    note: '.. moves up one folder. ~ is /home/student. You cannot move above this virtual home.',
  },
  {
    name: 'cat',
    group: 'Files and folders',
    syntax: 'cat <file>',
    description: 'Read one file to uncover instructions or clues.',
    examples: ['cat README.txt', 'cat notes/clock.txt'],
  },
  {
    name: 'grep',
    group: 'Files and folders',
    syntax: 'grep [-i] <text> <file>',
    description: 'Find lines containing literal text. Put -i first to ignore upper/lower case.',
    examples: ['grep -i coffee network.log', 'grep "red packet" notes/security.txt'],
    note: 'Quote text containing spaces. This searches literal text, not regular expressions.',
  },
  {
    name: 'clear',
    group: 'Terminal',
    syntax: 'clear',
    description: 'Clear terminal output. Your command history and mission progress stay intact.',
    examples: ['clear'],
  },
  {
    name: 'decrypt',
    group: 'Coffee recovery',
    syntax: 'decrypt <cipher> --shift <number>',
    description: 'Decode the captured Caesar cipher using the shift found in the clues.',
    variants: [
      'decrypt <cipher> <number>',
      'decrypt <cipher> --shift=<number>',
      'decrypt <number>',
    ],
    note: 'Use an integer shift. The last form uses the captured cipher automatically. Find the cipher and shift in the mission.',
  },
  {
    name: 'ssh',
    group: 'Coffee recovery',
    syntax: 'ssh <user>@<host> -p <port>',
    description: 'Connect to the coffee service using the discovered user, host, and port.',
    note: 'Decode the order, inspect the unusual packet, and recover the Monitor passcode first. Keep the arguments in this order. Enter the password when prompted; typing is hidden.',
  },
  {
    name: 'sudo',
    group: 'Coffee recovery',
    syntax: 'sudo brew --espresso',
    description: 'Brew the espresso after authenticating with the coffee service.',
    examples: ['sudo brew --espresso'],
    note: 'This is the only supported sudo command. Read brew.sh with cat; the file itself cannot be executed.',
  },
  {
    name: 'exit',
    group: 'Terminal',
    syntax: 'exit',
    description: 'Disconnect the simulated SSH session and return to the local terminal.',
    examples: ['exit'],
    note: 'This does not leave the game or reset discoveries. The mission clock continues.',
  },
  {
    name: 'disconnect',
    group: 'Terminal',
    syntax: 'disconnect',
    description:
      'An alternative to exit. Return to the local terminal without resetting the mission.',
    examples: ['disconnect'],
  },
])

export const COMMAND_GROUPS = ['Files and folders', 'Coffee recovery', 'Terminal']

export function formatCommandHelp() {
  return [
    'LOCAL COMMANDS',
    ...COMMAND_REFERENCE.map((command) => `${command.syntax.padEnd(42)} ${command.description}`),
    '',
    'Replace <placeholders> with your values. [Arguments] are optional; do not type the brackets.',
    'Use the Commands button for examples, alternate forms, and keyboard shortcuts.',
    'Tab: completion. Up/Down: history. Shift+Tab: leave the command field.',
    'At password: enter the recovered password, not a command. Password attempts are never saved.',
  ].join('\n')
}
