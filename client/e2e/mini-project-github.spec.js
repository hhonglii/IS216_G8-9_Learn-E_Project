// Browser checks for F6 and F7 with mocked API data. The mocks live in
// helpers/miniProjectPage.js, so no database or real GitHub quota is used.
import { test, expect } from '@playwright/test'
import {
  studentId,
  professorId,
  miniProjectId,
  groupId,
  otherGroupId,
  starterRepoUrl,
  workspace,
  project,
  prepare,
} from './helpers/miniProjectPage.js'

const repositoryUrl = 'https://github.com/octo/demo'

const snapshot = {
  repository: {
    name: 'demo',
    description: 'Saved description',
    language: 'JavaScript',
    defaultBranch: 'main',
    updatedAt: '2026-10-22T08:00:00Z',
  },
  commits: [
    {
      sha: 'abc123',
      message: 'Fix the loop',
      author: 'Alice',
      date: '2026-10-22T08:00:00Z',
      url: 'https://github.com/octo/demo/commit/abc123',
    },
  ],
  contributors: [{ login: 'alice', commits: 12, url: 'https://github.com/alice' }],
}
// A snapshot saved before F7 has no contributors key at all.
const { contributors: _dropped, ...snapshotBeforeF7 } = snapshot
const savedAt = '2026-10-22T09:00:00.000Z'

test('a member attaches a repository, refreshes, and keeps the data when a refresh fails', async ({
  page,
}, testInfo) => {
  const state = { project: project({ myGroup: workspace(groupId, 'Team Rocket') }) }
  const { githubRequests, pageErrors } = await prepare(page, studentId, state)

  let attachBody
  await page.route(`**/api/groups/${groupId}/repository`, (route) => {
    attachBody = route.request().postDataJSON()
    state.project.myGroup = { ...state.project.myGroup, repositoryUrl }
    return route.fulfill({ json: { data: { id: groupId, repositoryUrl, updatedAt: savedAt } } })
  })
  let refreshReply = 'success'
  let releaseRefresh
  await page.route(`**/api/groups/${groupId}/github/refresh`, async (route) => {
    if (refreshReply === 'success') {
      state.project.myGroup = {
        ...state.project.myGroup,
        github: snapshot,
        lastRefreshedAt: savedAt,
      }
      return route.fulfill({
        json: { data: { repositoryUrl, ...snapshot, lastRefreshedAt: savedAt } },
      })
    }
    // Hold the failing reply until the test has seen the "Refreshing" state.
    await new Promise((resolve) => (releaseRefresh = resolve))
    return route.fulfill({
      status: 429,
      json: {
        error: {
          code: 'GITHUB_RATE_LIMITED',
          message: 'GitHub is busy. Try again later.',
          details: null,
        },
      },
    })
  })

  await page.goto(`/mini-projects/${miniProjectId}`)
  await expect(page.getByRole('link', { name: starterRepoUrl })).toHaveAttribute(
    'href',
    starterRepoUrl,
  )

  const card = page.getByRole('region', { name: 'Repository', exact: true })
  await expect(card.getByRole('button', { name: 'Attach' })).toBeDisabled()
  await expect(card.getByRole('region', { name: 'GitHub repository evidence' })).toHaveCount(0)

  await card.getByLabel('GitHub repository link', { exact: true }).fill(`${repositoryUrl}.git`)
  await card.getByRole('button', { name: 'Attach' }).click()
  await expect(card.getByRole('link', { name: repositoryUrl })).toHaveAttribute(
    'href',
    repositoryUrl,
  )
  expect(attachBody).toEqual({ repositoryUrl: `${repositoryUrl}.git` })
  await expect(card.getByText('Last successful refresh: Never')).toBeVisible()
  await expect(card.getByText('Not retrieved yet')).toBeVisible()

  await card.getByRole('button', { name: 'Refresh GitHub data' }).click()
  await expect(card.getByText('Saved description')).toBeVisible()
  await expect(card.getByRole('heading', { name: 'Fix the loop' })).toBeVisible()
  await expect(card.locator('time')).toHaveAttribute('datetime', savedAt)
  await expect(card.getByRole('link', { name: 'alice' })).toHaveAttribute(
    'href',
    'https://github.com/alice',
  )
  await expect(card.getByText(/12 commits/)).toBeVisible()
  await expect(card.getByRole('link', { name: /View on GitHub\s*: Fix the loop/ })).toHaveAttribute(
    'href',
    snapshot.commits[0].url,
  )

  refreshReply = 'rate-limited'
  await card.getByRole('button', { name: 'Refresh GitHub data' }).click()
  await expect(card.getByRole('button', { name: 'Refreshing' })).toBeDisabled()
  await expect(card.getByText('Saved description')).toBeVisible()
  releaseRefresh()
  await expect(card.getByRole('alert')).toContainText('Try again later')
  await expect(card.getByText('Saved description')).toBeVisible()
  await expect(card.getByRole('heading', { name: 'Fix the loop' })).toBeVisible()
  await expect(card.locator('time')).toHaveAttribute('datetime', savedAt)
  await expect(card.getByRole('link', { name: 'alice' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Refresh GitHub data' })).toBeEnabled()

  await page.screenshot({ path: testInfo.outputPath('member-refresh-failed.png'), fullPage: true })
  expect(githubRequests).toEqual([])
  expect(pageErrors).toEqual([])
})

test('a rejected link shows the server message and keeps what was typed', async ({ page }) => {
  const state = { project: project({ myGroup: workspace(groupId, 'Team Rocket') }) }
  const { pageErrors } = await prepare(page, studentId, state)
  await page.route(`**/api/groups/${groupId}/repository`, (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: {
          code: 'INVALID_GITHUB_REPOSITORY_URL',
          message: 'Enter a public GitHub repository link.',
          details: null,
        },
      },
    }),
  )

  await page.goto(`/mini-projects/${miniProjectId}`)
  const card = page.getByRole('region', { name: 'Repository', exact: true })
  const input = card.getByLabel('GitHub repository link', { exact: true })
  await input.fill('https://gitlab.com/octo/demo')
  await card.getByRole('button', { name: 'Attach' }).click()
  await expect(card.getByText('Enter a public GitHub repository link.')).toBeVisible()
  await expect(input).toHaveValue('https://gitlab.com/octo/demo')
  await expect(card.getByRole('button', { name: 'Attach' })).toBeEnabled()
  expect(pageErrors).toEqual([])
})

test('the owning professor sees each group and refreshes only the one clicked', async ({
  page,
}, testInfo) => {
  const state = {
    project: project({
      isOwningProfessor: true,
      groups: [
        { id: groupId, name: 'Team Rocket', memberIds: [studentId] },
        { id: otherGroupId, name: 'Team Aqua', memberIds: [] },
      ],
      workspaces: [
        workspace(groupId, 'Team Rocket', {
          repositoryUrl,
          github: snapshotBeforeF7,
          lastRefreshedAt: savedAt,
        }),
        workspace(otherGroupId, 'Team Aqua'),
      ],
    }),
  }
  const { githubRequests, pageErrors } = await prepare(page, professorId, state)
  const refreshed = []
  await page.route('**/api/groups/*/github/refresh', (route) => {
    refreshed.push(route.request().url())
    return route.fulfill({
      json: { data: { repositoryUrl, ...snapshot, lastRefreshedAt: savedAt } },
    })
  })

  await page.goto(`/mini-projects/${miniProjectId}`)
  const progress = page.getByRole('region', { name: 'Group progress' })
  await expect(progress.getByText('Saved description')).toBeVisible()
  await expect(progress.getByText('No repository attached yet.')).toBeVisible()
  await expect(progress.getByText('Not retrieved yet')).toBeVisible()
  await expect(progress.getByRole('button', { name: 'Refresh GitHub data' })).toHaveCount(1)
  await expect(page.getByLabel('GitHub repository link', { exact: true })).toHaveCount(0)

  await progress.getByRole('button', { name: 'Refresh GitHub data' }).click()
  await expect.poll(() => refreshed.length).toBe(1)
  expect(refreshed[0]).toContain(`/groups/${groupId}/github/refresh`)

  await page.screenshot({ path: testInfo.outputPath('professor-workspaces.png'), fullPage: true })
  expect(githubRequests).toEqual([])
  expect(pageErrors).toEqual([])
})
