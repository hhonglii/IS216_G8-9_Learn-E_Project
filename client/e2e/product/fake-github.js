// Test setup for H2.
// Loaded into the product test server with `node --import` (see start-server.js),
// before any server code runs. It swaps the global fetch so GitHub answers come
// from the fixed data below, and any other request off this machine fails, so
// the journeys never depend on, or send anything to, a live service. Product
// code is untouched: githubService.js still makes its normal fetch calls.
import process from 'node:process'

const realFetch = globalThis.fetch

// One public repository the journeys attach (helpers/setup.js names it too).
// Every other repository is a 404, except `private-notes`, which is private.
const FAKE_REPOSITORY = 'https://github.com/learn-e-e2e/loop-fixer'
const repositories = {
  'learn-e-e2e/loop-fixer': {
    repo: {
      name: 'loop-fixer',
      description: 'Fixes the loop that skips the last cart item.',
      language: 'JavaScript',
      default_branch: 'main',
      updated_at: '2026-10-30T09:00:00Z',
      private: false,
    },
    commits: [
      {
        sha: 'a1b2c3d',
        html_url: `${FAKE_REPOSITORY}/commit/a1b2c3d`,
        commit: {
          message: 'Fix the loop bound\n\nUse <= so the last item is added.',
          author: { name: 'Ana Cruz', date: '2026-10-30T08:00:00Z' },
        },
      },
    ],
    contributors: [
      { login: 'ana-cruz', contributions: 3, html_url: 'https://github.com/ana-cruz' },
    ],
  },
  'learn-e-e2e/private-notes': { repo: { name: 'private-notes', private: true } },
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function answerGitHub(url) {
  const match = /^\/repos\/([^/]+\/[^/]+)(\/commits|\/contributors)?$/.exec(url.pathname)
  const found = match && repositories[match[1].toLowerCase()]
  if (!found) return json({ message: 'Not Found' }, 404)
  if (match[2] === '/commits') return json(found.commits ?? [])
  if (match[2] === '/contributors') return json(found.contributors ?? [])
  return json(found.repo)
}

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname === 'api.github.com') return answerGitHub(url)
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return realFetch(input, init)
  throw new Error(`Product tests block live requests: ${url.origin}`)
}

process.stderr.write('[fake-github] GitHub answers come from e2e/product/fake-github.js\n')
