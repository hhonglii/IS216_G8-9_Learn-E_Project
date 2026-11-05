// Playwright supplies browser testing.
// Two projects (decision H-3): `shell` runs against a server with no database, and
// `product` against a second server on a throwaway in-memory MongoDB (decision H-5).
// Each project has its own app too, because Vite fixes the API address at start-up.
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import gamesConfig from './playwright.games.config.js'

export default defineConfig({
  testDir: './e2e',
  // The game specs run against the production build: pnpm exec playwright test -c playwright.games.config.js
  testIgnore: gamesConfig.testMatch,
  timeout: 30000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'shell',
      testIgnore: [...gamesConfig.testMatch, /[\\/]product[\\/]/],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
    {
      name: 'product',
      testDir: './e2e/product',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --dir ../server start',
      url: 'http://localhost:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        PORT: '8000',
        CLIENT_ORIGIN: 'http://localhost:5173',
        MONGODB_URI: '',
        GITHUB_TOKEN: '',
      },
    },
    {
      command: 'pnpm dev --host localhost --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: { VITE_API_BASE_URL: 'http://localhost:8000/api' },
    },
    {
      command: 'node e2e/product/start-server.js',
      url: 'http://localhost:8001/api/health',
      reuseExistingServer: !process.env.CI,
      // The first run downloads MongoDB before the server can start.
      timeout: 180000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: { PORT: '8001', CLIENT_ORIGIN: 'http://localhost:5174' },
    },
    {
      command: 'pnpm dev --host localhost --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: { VITE_API_BASE_URL: 'http://localhost:8001/api' },
    },
  ],
})
