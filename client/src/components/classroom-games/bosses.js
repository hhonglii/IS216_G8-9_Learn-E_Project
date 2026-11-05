// The monsters a professor can choose. They only change how a battle looks; every
// monster plays by the same rules. The database stores just the id, which must
// also be listed in BOSS_IDS in server/src/utils/classroomGameDraft.js.
import nullSlime from './assets/null-slime.svg'
import infiniteWyrm from './assets/infinite-wyrm.svg'
import offByOneGolem from './assets/off-by-one-golem.svg'
import memoryKraken from './assets/memory-kraken.svg'
import raceGhost from './assets/race-ghost.svg'
import syntaxSpider from './assets/syntax-spider.svg'

export const bosses = [
  { id: 'null-slime', name: 'The Null Slime', image: nullSlime, color: '#8f6bff' },
  { id: 'infinite-wyrm', name: 'The Infinite Wyrm', image: infiniteWyrm, color: '#25d0bb' },
  { id: 'off-by-one-golem', name: 'The Off-By-One Golem', image: offByOneGolem, color: '#d3a566' },
  { id: 'memory-kraken', name: 'The Memory Kraken', image: memoryKraken, color: '#ff6487' },
  { id: 'race-ghost', name: 'The Race Condition', image: raceGhost, color: '#a9c6f2' },
  { id: 'syntax-spider', name: 'The Syntax Spider', image: syntaxSpider, color: '#00b8d9' },
]

// A monster retired later must not break a saved game, so fall back to the first.
export const findBoss = (id) => bosses.find((boss) => boss.id === id) ?? bosses[0]
