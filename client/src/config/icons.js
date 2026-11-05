// Icon drawings for AppIcon.vue (UI refresh 3). Each icon is a list of path `d`
// values on a 16 by 16 grid, drawn as strokes by the le-icon class in theme.css.
// A path like "M8 5h.01" is a dot: the round line cap turns the tiny line into a
// circle.
export const iconPaths = {
  dashboard: [
    'M2.5 2.5h4.5v4.5H2.5z',
    'M9 2.5h4.5v4.5H9z',
    'M2.5 9h4.5v4.5H2.5z',
    'M9 9h4.5v4.5H9z',
  ],
  break: [
    'M5 5h6a3.5 3.5 0 0 1 0 7c-.9 0-1.5-.5-2-1.2H7c-.5.7-1.1 1.2-2 1.2a3.5 3.5 0 0 1 0-7z',
    'M5 7.25v2.5M3.75 8.5h2.5',
    'M10.5 8h.01M11.75 9.25h.01',
  ],
  classroom: [
    'M2 3.5h4a2 2 0 0 1 2 2v8a1.5 1.5 0 0 0-1.5-1.5H2z',
    'M14 3.5h-4a2 2 0 0 0-2 2v8a1.5 1.5 0 0 1 1.5-1.5H14z',
  ],
  help: [
    'M2.5 3h11v7.5h-6L4.5 13v-2.5h-2z',
    'M6.5 5.75a1.5 1.5 0 1 1 2.1 1.4c-.4.2-.6.5-.6.9',
    'M8 9h.01',
  ],
  profile: ['M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4'],
  logout: ['M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3', 'M10.5 5l3 3-3 3', 'M13.5 8H6'],
  info: ['M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z', 'M8 7.5V11', 'M8 5h.01'],
  warning: ['M8 2.5l6 10.5H2z', 'M8 6.5v3', 'M8 11.25h.01'],
  circle: ['M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z'],
  check: ['M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z', 'M5.5 8.25 7.25 10l3.25-3.5'],
  empty: ['M2.5 9.5 4.25 3.5h7.5l1.75 6V13h-11z', 'M2.5 9.5h3.25l.75 1.5h3l.75-1.5h3.25'],
}
