// Classroom cover registry (decision G-10). The create form offers these as
// its cover picker, and the server keeps a copy of the ids to check coverId
// against (server/src/config/covers.js; a server test keeps the two lists the
// same). A classroom with no coverId, or one not listed here, shows
// defaultCover. The SVGs in
// client/public/covers/ were drawn for Learn-E, and redrawn dark on 2026-10-29
// for the dark game theme;
// ids keep their old colour words (blue-loop is now cyan) so stored ids stay
// valid. label is each picker option's accessible name.
export const covers = [
  { id: 'default', file: '/covers/default.svg', label: 'Dark grid', accent: '#00F0FF' },
  {
    id: 'blue-brackets',
    file: '/covers/blue-brackets.svg',
    label: 'Cyan, code brackets',
    accent: '#00F0FF',
  },
  { id: 'blue-loop', file: '/covers/blue-loop.svg', label: 'Cyan, loop arrow', accent: '#00F0FF' },
  {
    id: 'blue-nodes',
    file: '/covers/blue-nodes.svg',
    label: 'Cyan, connected nodes',
    accent: '#00F0FF',
  },
  {
    id: 'teal-brackets',
    file: '/covers/teal-brackets.svg',
    label: 'Teal, code brackets',
    accent: '#00F5D4',
  },
  { id: 'teal-loop', file: '/covers/teal-loop.svg', label: 'Teal, loop arrow', accent: '#00F5D4' },
  {
    id: 'teal-nodes',
    file: '/covers/teal-nodes.svg',
    label: 'Teal, connected nodes',
    accent: '#00F5D4',
  },
  {
    id: 'coral-brackets',
    file: '/covers/coral-brackets.svg',
    label: 'Pink, code brackets',
    accent: '#FF6487',
  },
  {
    id: 'coral-loop',
    file: '/covers/coral-loop.svg',
    label: 'Pink, loop arrow',
    accent: '#FF6487',
  },
  {
    id: 'coral-nodes',
    file: '/covers/coral-nodes.svg',
    label: 'Pink, connected nodes',
    accent: '#FF6487',
  },
  {
    id: 'amber-brackets',
    file: '/covers/amber-brackets.svg',
    label: 'Amber, code brackets',
    accent: '#FFB800',
  },
  {
    id: 'amber-loop',
    file: '/covers/amber-loop.svg',
    label: 'Amber, loop arrow',
    accent: '#FFB800',
  },
  {
    id: 'amber-nodes',
    file: '/covers/amber-nodes.svg',
    label: 'Amber, connected nodes',
    accent: '#FFB800',
  },
]

export const defaultCover = covers[0]

// The cover to show for a stored coverId.
export const coverFor = (coverId) => covers.find((cover) => cover.id === coverId) ?? defaultCover
