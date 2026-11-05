// The four hint types. value matches the HelpRequest schema enum exactly, so
// change both together. ask is what the asker reads on the form; mentor is what
// the mentor reads above the hint box (UX audit item 13).
export const hintTypes = [
  {
    value: 'Guiding question',
    ask: 'A question that points you the right way without giving the answer, like "What is i on the last pass of the loop?"',
    mentor:
      'Ask a question that leads them to the bug, like "What is i on the last pass of the loop?"',
  },
  {
    value: 'Concept reminder',
    ask: "The idea behind the bug, like how array indexes start at 0. Pick this when you're not sure which rule applies.",
    mentor: 'Remind them of the rule or idea behind the bug, without saying where the bug is.',
  },
  {
    value: 'Fault-location clue',
    ask: "Where to look: a line, a function or a part of the code. Pick this when you can't find the bug.",
    mentor: "Tell them where to look, such as a line or a function, but not what's wrong there.",
  },
  {
    value: 'Repair-direction hint',
    ask: "What kind of change fixes it, without the exact code. Pick this when you've found the bug but not the fix.",
    mentor: 'Say what kind of change fixes it, without writing the fixed code.',
  },
]
