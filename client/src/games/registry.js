import { defineAsyncComponent } from 'vue'
import GameLoading from './GameLoading.vue'
import GameLoadError from './GameLoadError.vue'
import Cover2048 from './2048/Cover2048.vue'
import RootkitCover from './rootkit/RootkitCover.vue'
import TetrisCover from './tetris/TetrisCover.vue'

// Add another entry and cover component here to extend the break-room library.
// Game code is loaded only when its card is opened.
export const games = [
  {
    id: '2048',
    title: '2048',
    genre: 'Number puzzle',
    pace: 'At your own pace',
    summary: 'Merge matching tiles and make your way to 2048.',
    description:
      'Slide, combine, and make a little room. Join matching numbers on a classic four-by-four board and see how far you can go.',
    cover: Cover2048,
    component: defineAsyncComponent({
      loader: () => import('./2048/Game2048.vue'),
      loadingComponent: GameLoading,
      errorComponent: GameLoadError,
      delay: 150,
      timeout: 15000,
    }),
  },
  {
    id: 'rootkit',
    title: 'RootKit OS',
    genre: 'Desktop escape puzzle',
    pace: 'No time limit',
    summary: 'Follow the clues. Beat the firewall. Brew the espresso.',
    description:
      'The professor needs an espresso. Explore a simulated desktop, follow the clues, and outsmart the firewall at your own pace.',
    cover: RootkitCover,
    component: defineAsyncComponent({
      loader: () => import('./rootkit/RootkitGame.vue'),
      loadingComponent: GameLoading,
      errorComponent: GameLoadError,
      delay: 150,
      timeout: 15000,
    }),
  },
  {
    id: 'tetris',
    title: 'Tetris',
    genre: 'Arcade puzzle',
    pace: 'Find your rhythm',
    summary: 'Stack blocks, clear rows and find your rhythm.',
    description:
      'Stack the falling blocks, clear full rows, and keep the circuit running. A familiar challenge with a neon pulse.',
    cover: TetrisCover,
    component: defineAsyncComponent({
      loader: () => import('./tetris/TetrisGame.vue'),
      loadingComponent: GameLoading,
      errorComponent: GameLoadError,
      delay: 150,
      timeout: 15000,
    }),
  },
]
