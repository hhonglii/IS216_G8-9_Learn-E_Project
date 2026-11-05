// Browser checks for G7 and G14 with mocked API data. Every /api request is
// answered here, so no database is used.
import { test, expect } from '@playwright/test'
import {
  studentId,
  professorId,
  miniProjectId,
  groupId,
  workspace,
  project,
  prepare,
} from './helpers/miniProjectPage.js'
import { expectSentBy } from './helpers/session.js'

const classroomId = '507f1f77bcf86cd799439106'
const attemptId = '507f1f77bcf86cd799439107'
const reviewUrl = `/classrooms/${classroomId}/review`

const evidence = {
  Diagnose: 'Off by one in the loop.',
  Repair: 'Changed <= to <.',
  Extend: '',
  Verify: 'Added a test for zero.',
  Reflect: '',
}

const pendingAttempt = {
  id: attemptId,
  studentId,
  studentName: 'Alice',
  challengeId: '507f1f77bcf86cd799439108',
  challengeTitle: 'Loops',
  appliedDiagnosis: 'The loop runs once too often.',
  reviewStatus: 'pending',
  submittedAt: '2026-10-24T08:00:00.000Z',
}

const pendingGroup = (fields = {}) => ({
  id: groupId,
  name: 'Team Rocket',
  miniProjectId,
  miniProjectTitle: 'Repair the counter app',
  members: [
    { id: studentId, displayName: 'Alice' },
    { id: '507f1f77bcf86cd799439109', displayName: 'Bob' },
  ],
  stageEvidence: evidence,
  reflection: 'We fixed the loop.',
  submittedAt: '2026-10-24T09:00:00.000Z',
  ...fields,
})

const emptySummary = {
  startedAttempts: 0,
  completedAttempts: 0,
  pendingAttemptReviews: 0,
  pendingGroupReviews: 0,
  wrongOptions: [],
  openHelpRequests: 0,
  timesMarkedUnresolved: 0,
  mostRequestedHintType: [],
  groupsByStatus: { draft: 0, submitted: 0, approved: 0, returned: 0 },
}

const insightsReply = (fields) => ({
  data: {
    classroomId,
    pendingAppliedAttempts: [],
    pendingGroups: [],
    summary: emptySummary,
    ...fields,
  },
})

// Answers Get insights from `reply()`, which tests may change between loads,
// and returns how many times the page loaded it.
async function mockInsights(page, userId, reply) {
  const loads = []
  await page.route(`**/api/classrooms/${classroomId}/insights`, (route) => {
    expectSentBy(route, userId)
    loads.push(route.request().url())
    return route.fulfill({ json: reply() })
  })
  return loads
}

const groupQueue = (page) =>
  page.locator('section', {
    has: page.getByRole('heading', { name: 'Group projects', exact: true }),
  })
const groupCard = (page) =>
  page.locator('section', {
    has: page.getByRole('heading', { name: 'Review group project', exact: true }),
  })
const attemptCard = (page) =>
  page.locator('section', {
    has: page.getByRole('heading', { name: 'Review student diagnosis', exact: true }),
  })
const valueOf = (summary, label) =>
  summary.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]')

test('the professor returns a group, the student resubmits, and the professor approves it', async ({
  browser,
}) => {
  // One stored group shared by both people's pages, saved by the mocks the way
  // the server would save it.
  const group = {
    submissionStatus: 'submitted',
    reflection: 'We fixed the loop.',
    professorFeedback: '',
  }
  const stored = () => workspace(groupId, 'Team Rocket', { stageEvidence: evidence, ...group })

  const professorPage = await (await browser.newContext()).newPage()
  const professor = await prepare(professorPage, professorId, {
    get project() {
      return project({
        isOwningProfessor: true,
        groups: [{ id: groupId, name: 'Team Rocket', memberIds: [studentId] }],
        workspaces: [stored()],
      })
    },
  })
  const loads = await mockInsights(professorPage, professorId, () =>
    insightsReply({
      pendingGroups:
        group.submissionStatus === 'submitted'
          ? [pendingGroup({ reflection: group.reflection })]
          : [],
    }),
  )
  const reviews = []
  await professorPage.route(`**/api/groups/${groupId}/review`, (route) => {
    expect(route.request().method()).toBe('PUT')
    expectSentBy(route, professorId)
    const body = route.request().postDataJSON()
    reviews.push(body)
    group.submissionStatus = body.decision === 'approve' ? 'approved' : 'returned'
    group.professorFeedback = body.feedback
    return route.fulfill({
      json: {
        data: {
          id: groupId,
          submissionStatus: group.submissionStatus,
          professorFeedback: group.professorFeedback,
          updatedAt: '2026-10-24T10:00:00.000Z',
        },
      },
    })
  })

  const studentPage = await (await browser.newContext()).newPage()
  const student = await prepare(studentPage, studentId, {
    get project() {
      return project({ myGroup: stored() })
    },
  })
  await studentPage.route(`**/api/groups/${groupId}/submit`, (route) => {
    group.submissionStatus = 'submitted'
    group.reflection = route.request().postDataJSON().reflection.trim()
    return route.fulfill({
      json: { data: { id: groupId, submissionStatus: 'submitted', reflection: group.reflection } },
    })
  })

  // 1. Return it. Feedback is required first (G-5).
  await professorPage.goto(reviewUrl)
  await expect(
    groupQueue(professorPage).getByText('1 group project waiting for review'),
  ).toBeVisible()
  await groupQueue(professorPage).getByRole('button', { name: 'Review' }).click()
  const card = groupCard(professorPage)
  await expect(card.getByText('Alice, Bob')).toBeVisible()
  await expect(card.getByText('Changed <= to <.')).toBeVisible()
  await expect(card.getByText('We fixed the loop.')).toBeVisible()
  await card.getByLabel('Return for corrections').check()
  await expect(card.getByRole('button', { name: 'Return group project' })).toBeDisabled()
  await card.getByLabel(/Professor feedback/).fill('  Add a test for an empty cart.  ')
  await card.getByRole('button', { name: 'Return group project' }).click()
  await expect(
    professorPage.getByText(/^Returned .+'s project with your feedback\.$/),
  ).toBeVisible()
  await expect(groupQueue(professorPage).getByText('No group projects to review.')).toBeVisible()
  await expect(groupCard(professorPage)).toHaveCount(0)
  expect(reviews).toEqual([{ decision: 'return', feedback: 'Add a test for an empty cart.' }])

  // 2. The student sees the feedback on the mini-project page and resubmits.
  await studentPage.goto(`/mini-projects/${miniProjectId}`)
  const submit = studentPage.getByRole('region', { name: 'Submit for review' })
  await expect(submit.locator('.le-status')).toHaveText('returned')
  await expect(submit.locator('.le-callout')).toContainText('Add a test for an empty cart.')
  await submit.getByLabel('Reflection').fill('We added the empty cart test.')
  await submit.getByRole('button', { name: 'Submit for review' }).click()
  await expect(submit.locator('.le-status')).toHaveText('submitted')

  // 3. Approve it; the professor's mini-project page shows the saved status.
  await professorPage.getByRole('button', { name: 'Refresh' }).click()
  await groupQueue(professorPage).getByRole('button', { name: 'Review' }).click()
  await expect(groupCard(professorPage).getByText('We added the empty cart test.')).toBeVisible()
  await groupCard(professorPage).getByRole('button', { name: 'Approve group project' }).click()
  await expect(professorPage.getByText(/^Approved .+'s project\.$/)).toBeVisible()
  expect(reviews.at(-1)).toEqual({ decision: 'approve', feedback: '' })

  await professorPage.goto(`/mini-projects/${miniProjectId}`)
  const progress = professorPage.getByRole('region', { name: 'Group progress' })
  await expect(progress.locator('.le-status')).toHaveText('approved')

  // Opened, refetched after the return, refreshed, refetched after the approval.
  expect(loads).toHaveLength(4)
  expect(professor.pageErrors).toEqual([])
  expect(student.pageErrors).toEqual([])
})

test('a refused review keeps the group selected and the feedback typed', async ({ page }) => {
  const { pageErrors } = await prepare(page, professorId, { project: project({}) })
  const loads = await mockInsights(page, professorId, () =>
    insightsReply({ pendingGroups: [pendingGroup()] }),
  )
  await page.route(`**/api/groups/${groupId}/review`, (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: {
          code: 'GROUP_NOT_SUBMITTED',
          message: 'This group is no longer waiting for review.',
          details: null,
        },
      },
    }),
  )

  await page.goto(reviewUrl)
  await groupQueue(page).getByRole('button', { name: 'Review' }).click()
  const card = groupCard(page)
  await card.getByLabel('Return for corrections').check()
  await card.getByLabel(/Professor feedback/).fill('Add a test.')
  await card.getByRole('button', { name: 'Return group project' }).click()

  await expect(card.getByText('This group is no longer waiting for review.')).toBeVisible()
  await expect(card.getByLabel(/Professor feedback/)).toHaveValue('Add a test.')
  await expect(card.getByLabel('Return for corrections')).toBeChecked()
  await expect(card.getByRole('button', { name: 'Return group project' })).toBeEnabled()
  await expect(page.getByText(/^Returned .+'s project with your feedback\.$/)).toHaveCount(0)
  expect(loads).toHaveLength(1)
  expect(pageErrors).toEqual([])
})

test('the attempt and group review forms do not share inputs', async ({ page }) => {
  const { pageErrors } = await prepare(page, professorId, { project: project({}) })
  await mockInsights(page, professorId, () =>
    insightsReply({ pendingAppliedAttempts: [pendingAttempt], pendingGroups: [pendingGroup()] }),
  )

  await page.goto(reviewUrl)
  await page
    .locator('section', {
      has: page.getByRole('heading', { name: 'Applied diagnoses', exact: true }),
    })
    .getByRole('button', { name: 'Review' })
    .click()
  await groupQueue(page).getByRole('button', { name: 'Review' }).click()
  await expect(attemptCard(page)).toBeVisible()
  await expect(groupCard(page)).toBeVisible()

  await groupCard(page).getByText('Return for corrections').click()
  await groupCard(page).getByText('Professor feedback').click()
  await page.keyboard.type('Group only')

  await expect(groupCard(page).getByLabel('Return for corrections')).toBeChecked()
  await expect(groupCard(page).getByLabel(/Professor feedback/)).toHaveValue('Group only')
  await expect(attemptCard(page).getByLabel('Approve diagnosis')).toBeChecked()
  await expect(attemptCard(page).getByLabel(/Professor feedback/)).toHaveValue('')
  expect(pageErrors).toEqual([])
})

test('the classroom summary shows each number with its G5 label', async ({ page }, testInfo) => {
  const { pageErrors } = await prepare(page, professorId, { project: project({}) })
  await mockInsights(page, professorId, () =>
    insightsReply({
      pendingAppliedAttempts: [pendingAttempt],
      pendingGroups: [pendingGroup()],
      summary: {
        startedAttempts: 3,
        completedAttempts: 1,
        pendingAttemptReviews: 1,
        pendingGroupReviews: 1,
        wrongOptions: [
          {
            challengeTitle: 'Loops',
            questionPrompt: 'What does this print?',
            options: [
              { optionId: 'b', label: '4', count: 3 },
              { optionId: 'c', label: '6', count: 1 },
            ],
          },
        ],
        openHelpRequests: 2,
        timesMarkedUnresolved: 3,
        mostRequestedHintType: ['Guiding question', 'Worked example'],
        groupsByStatus: { draft: 1, submitted: 1, approved: 0, returned: 2 },
      },
    }),
  )

  await page.goto(reviewUrl)
  const summary = page.getByRole('region', { name: 'Classroom summary' })
  const expected = {
    'Challenge attempts started': '3',
    'Challenge attempts completed (approved)': '1',
    'Diagnoses waiting for review': '1',
    'Group projects waiting for review': '1',
    'Help requests waiting for a mentor': '2',
    "Times a mentor's answer was marked unresolved": '3',
    'Most requested kind of hint': 'Guiding question, Worked example',
    'Groups by submission status': 'Draft 1 · Submitted 1 · Approved 0 · Returned 2',
  }
  await expect(summary.locator('dt')).toHaveText(Object.keys(expected))
  for (const [label, value] of Object.entries(expected)) {
    await expect(valueOf(summary, label)).toHaveText(value)
  }
  await expect(summary.getByText('No attempts yet')).toHaveCount(0)
  await expect(summary.getByText('Times this option was chosen, including retries')).toBeVisible()
  await expect(summary.getByRole('heading', { name: 'Loops: What does this print?' })).toBeVisible()
  // G14: each option as a bar, with its count as text beside it.
  await expect(summary.locator('.le-bar-label')).toHaveText(['4', '6'])
  await expect(summary.locator('.le-bar-count')).toHaveText(['3 times', '1 times'])
  // The queues still read from the same response.
  await expect(page.getByRole('heading', { name: 'Challenge: Loops' })).toBeVisible()
  await expect(groupQueue(page).getByText('Team Rocket')).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('review-summary.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})

test('an empty classroom shows real zeros and the zero-data sentence', async ({ page }) => {
  const { pageErrors } = await prepare(page, professorId, { project: project({}) })
  await mockInsights(page, professorId, () => insightsReply({}))

  await page.goto(reviewUrl)
  const summary = page.getByRole('region', { name: 'Classroom summary' })
  await expect(
    summary.getByText('No attempts yet. Numbers appear once students start a challenge.'),
  ).toBeVisible()
  await expect(valueOf(summary, 'Challenge attempts started')).toHaveText('0')
  await expect(valueOf(summary, "Times a mentor's answer was marked unresolved")).toHaveText('0')
  await expect(valueOf(summary, 'Most requested kind of hint')).toHaveText('None yet')
  await expect(valueOf(summary, 'Groups by submission status')).toHaveText(
    'Draft 0 · Submitted 0 · Approved 0 · Returned 0',
  )
  await expect(summary.getByText('No wrong options chosen yet.')).toBeVisible()
  await expect(summary).not.toContainText('NaN')
  await expect(summary).not.toContainText('undefined')
  await expect(groupQueue(page).getByText('No group projects to review.')).toBeVisible()
  expect(pageErrors).toEqual([])
})

// G14: the tiles and bars. What they say is covered by summary-tiles.spec.js;
// these check what only the CSS decides.
const busySummary = {
  ...emptySummary,
  startedAttempts: 3,
  completedAttempts: 1,
  wrongOptions: [
    {
      challengeTitle: 'Loops',
      questionPrompt: 'What does this print?',
      options: [
        { optionId: 'b', label: '4', count: 3 },
        { optionId: 'c', label: '6', count: 1 },
      ],
    },
    {
      challengeTitle: 'Strings',
      questionPrompt: 'Output?',
      options: [
        // One unbroken word, the hardest kind of label to fit on a phone.
        {
          optionId: 'a',
          label: 'TypeError:Cannot_read_properties_of_undefined_reading_length_at_main',
          count: 12,
        },
        { optionId: 'd', label: 'undefined', count: 5 },
      ],
    },
  ],
}

async function openBusySummary(page, width) {
  const { pageErrors } = await prepare(page, professorId, { project: project({}) })
  await mockInsights(page, professorId, () => insightsReply({ summary: busySummary }))
  await page.setViewportSize({ width, height: 900 })
  await page.goto(reviewUrl)
  const summary = page.getByRole('region', { name: 'Classroom summary' })
  await expect(summary.locator('.le-bar')).toHaveCount(4)
  return { pageErrors, summary }
}

// How many tiles share the first tile's row.
const tilesPerRow = (summary) =>
  summary.locator('.le-tiles > .le-tile').evaluateAll((tiles) => {
    const top = tiles[0].getBoundingClientRect().top
    return tiles.filter((tile) => tile.getBoundingClientRect().top === top).length
  })
// Each bar's drawn width as a percentage of its track.
const barPercents = (summary) =>
  summary
    .locator('.le-bar')
    .evaluateAll((bars) =>
      bars.map((bar) =>
        Math.round(
          (bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width) *
            100,
        ),
      ),
    )

test('at 1280px the tiles make two rows of three and each bar sits on one line', async ({
  page,
}, testInfo) => {
  const { pageErrors, summary } = await openBusySummary(page, 1280)
  expect(await tilesPerRow(summary)).toBe(3)
  const tile = summary.locator('.le-tiles > .le-tile').first()
  // Review is a progress page: amber text on the amber tint (7.93:1).
  await expect(tile).toHaveCSS('background-color', 'rgb(50, 45, 28)')
  await expect(tile.locator('dt')).toHaveCSS('color', 'rgb(255, 184, 0)')
  await expect(tile.locator('dd')).toHaveCSS('font-size', '32px')

  expect(await barPercents(summary)).toEqual([100, 33, 100, 42])
  const bar = summary.locator('.le-bar').first()
  await expect(bar).toHaveCSS('background-color', 'rgb(255, 184, 0)')
  // The bar fills its 0.75rem track's height, not just its width.
  expect((await bar.boundingBox()).height).toBe(12)
  await expect(summary.locator('.le-bar-track').first()).toHaveCSS(
    'background-color',
    'rgb(50, 45, 28)',
  )
  // Label, bar and count share a line from 576px.
  const row = summary.locator('.le-bar-row').first()
  const [label, track, count] = await Promise.all(
    ['.le-bar-label', '.le-bar-track', '.le-bar-count'].map((part) =>
      row.locator(part).boundingBox(),
    ),
  )
  expect(track.x).toBeGreaterThan(label.x + label.width)
  expect(count.x).toBeGreaterThan(track.x + track.width)
  expect(Math.abs(track.y + track.height / 2 - (count.y + count.height / 2))).toBeLessThan(4)
  // The bar keeps most of the row.
  expect(track.width).toBeGreaterThan(label.width)
  // The tile styles are scoped: a .le-tile elsewhere (the dashboard's create
  // and join cards) keeps its own look.
  const otherTile = await page.evaluate(() => {
    const card = document.createElement('section')
    card.className = 'card le-tile'
    document.querySelector('main').append(card)
    const style = getComputedStyle(card)
    return { display: style.display, background: style.backgroundColor }
  })
  expect(otherTile).toEqual({ display: 'flex', background: 'rgb(17, 22, 32)' })
  await summary.screenshot({ path: testInfo.outputPath('summary-1280.png') })
  expect(pageErrors).toEqual([])
})

test('at 768px, beside the sidebar, the bar still gets more room than its label', async ({
  page,
}) => {
  const { pageErrors, summary } = await openBusySummary(page, 768)
  expect(await tilesPerRow(summary)).toBe(2)
  const row = summary.locator('.le-bar-row').first()
  const label = await row.locator('.le-bar-label').boundingBox()
  const track = await row.locator('.le-bar-track').boundingBox()
  expect(track.x).toBeGreaterThan(label.x + label.width)
  expect(track.width).toBeGreaterThan(label.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect(pageErrors).toEqual([])
})

test('at 375px the tiles pair up, labels sit above their bars, and nothing scrolls sideways', async ({
  page,
}, testInfo) => {
  const { pageErrors, summary } = await openBusySummary(page, 375)
  expect(await tilesPerRow(summary)).toBe(2)
  expect(await barPercents(summary)).toEqual([100, 33, 100, 42])

  const longRow = summary.locator('.le-bar-row').nth(2)
  const label = await longRow.locator('.le-bar-label').boundingBox()
  const track = await longRow.locator('.le-bar-track').boundingBox()
  expect(track.y).toBeGreaterThanOrEqual(label.y + label.height)
  // The unbroken label wraps inside the card instead of pushing the page wider.
  expect(label.height).toBeGreaterThan(30)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await summary.screenshot({ path: testInfo.outputPath('summary-375.png') })
  expect(pageErrors).toEqual([])
})

test('at 320px the tiles stack and nothing scrolls sideways', async ({ page }) => {
  const { pageErrors, summary } = await openBusySummary(page, 320)
  expect(await tilesPerRow(summary)).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect(pageErrors).toEqual([])
})
