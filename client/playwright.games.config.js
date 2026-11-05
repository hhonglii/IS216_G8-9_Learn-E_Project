// Test the production bundle so development overlays cannot affect focus/storage checks.
// Tests stub shell health; highscore scenarios mock HTTP separately from live database QA.
import process from 'node:process'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    '2048.spec.js',
    'rootkit*.spec.js',
    'tetris.spec.js',
    'games-library.spec.js',
    'game-highscores.spec.js',
    // G12: blocked storage. Vue DevTools in development blanks the page then.
    'blocked-storage.spec.js',
  ],
  timeout: 45000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  workers: 1,
  outputDir: './test-results/games-browser',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    viewport: { width: 1440, height: 1100 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Build first; using Vite directly avoids nested npm shells during Windows teardown.
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
