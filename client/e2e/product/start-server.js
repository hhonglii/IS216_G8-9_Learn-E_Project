// Test setup for H1 (decision H-5).
// Starts a throwaway in-memory MongoDB, then the Learn-E server pointed at it, for
// the `product` Playwright project. PORT and CLIENT_ORIGIN come from the config.
// Every setting the server reads is set here, so nothing from server/.env (the
// team's Atlas database, GitHub token or Gemini key) reaches these tests.
// fake-github.js is preloaded so GitHub answers are fixed and nothing goes online (H2).
import { spawn } from 'node:child_process'
import process from 'node:process'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { PROFESSOR_CODE } from './professor-code.js'

// The first run downloads MongoDB (about 100 MB) into ~/.cache/mongodb-binaries.
const mongo = await MongoMemoryServer.create()

const fakeGitHub = new URL('./fake-github.js', import.meta.url).href
const server = spawn(process.execPath, ['--import', fakeGitHub, 'src/server.js'], {
  cwd: new URL('../../../server/', import.meta.url),
  stdio: 'inherit',
  env: {
    ...process.env,
    MONGODB_URI: mongo.getUri('learn-e-e2e'),
    GITHUB_TOKEN: '',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    PROFESSOR_SIGNUP_CODE: PROFESSOR_CODE,
  },
})

let stopping = false
async function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  server.kill('SIGTERM')
  await mongo.stop()
  process.exit(exitCode)
}

process.on('SIGTERM', () => stop())
process.on('SIGINT', () => stop())
// If the server dies on its own, take the database down too and report it.
server.on('exit', (code) => stop(code ?? 1))
