// Browser checks for G6, G9, G12 and G13 with mocked API data.
// Every /api request is answered here, so no
// database is used. The server decides what each viewer may see (tested in
// server/tests/users-profile.test.js); these checks cover how the page shows it.
import { test, expect } from '@playwright/test'
import {
  studentId,
  professorId,
  groupId,
  otherGroupId,
  prepare,
} from './helpers/miniProjectPage.js'
import { tokenFor } from './helpers/session.js'

const classmateId = '507f1f77bcf86cd799439109'

// Fixed locale and zone, so the completed dates read the same on every machine.
test.use({ locale: 'en-US', timezoneId: 'UTC' })

const profileOf = (id, fields = {}) => ({
  id,
  displayName: 'Alice',
  role: 'student',
  classrooms: [{ id: '507f1f77bcf86cd799439106', name: 'CS101', contributionPoints: 12 }],
  helpfulCount: 0,
  milestones: [],
  nextMilestone: { label: 'First Assist', threshold: 1 },
  completedChallenges: [],
  projects: [],
  ...fields,
})

const aliceWithWork = profileOf(studentId, {
  // Newest first, the order the server sends.
  completedChallenges: [
    {
      challengeId: '507f1f77bcf86cd799439110',
      title: 'Classes',
      completedAt: '2026-10-22T12:00:00.000Z',
    },
    {
      challengeId: '507f1f77bcf86cd799439111',
      title: 'Loops',
      completedAt: '2026-10-20T12:00:00.000Z',
    },
  ],
  projects: [
    {
      groupId,
      groupName: 'Team Rocket',
      miniProjectId: '507f1f77bcf86cd799439103',
      miniProjectTitle: 'Repair the counter app',
      submissionStatus: 'submitted',
    },
    {
      groupId: otherGroupId,
      groupName: 'Team Solo',
      miniProjectId: '507f1f77bcf86cd799439112',
      miniProjectTitle: 'Shapes',
      submissionStatus: 'draft',
    },
  ],
})

// Answers Get profile for each of `profiles` by id (404 for anyone else) and
// records which target each request named and whose session token it carried, so
// a test can check the two identities stay separate. Since G16 Step 11 the top
// bar's chip takes the viewer's name from the login, not from this request.
async function mockProfile(page, ...profiles) {
  const requests = []
  await page.route('**/api/users/*/profile', (route) => {
    const target = new URL(route.request().url()).pathname.split('/').at(-2)
    const token = route.request().headers().authorization ?? ''
    requests.push({ target, caller: token.replace(`Bearer ${tokenFor('')}`, '') })
    const reply = profiles.find((profile) => profile.id === target)
    return reply
      ? route.fulfill({ json: { data: reply } })
      : route.fulfill({
          status: 404,
          json: { error: { code: 'NOT_FOUND', message: 'User not found', details: null } },
        })
  })
  return requests
}

const card = (page, name) => page.getByRole('region', { name, exact: true })

test('a student sees their completed challenges and project groups', async ({ page }, testInfo) => {
  const { pageErrors } = await prepare(page, studentId, {})
  const requests = await mockProfile(page, aliceWithWork)

  await page.goto(`/profiles/${studentId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Alice' })).toBeVisible()

  const completed = card(page, 'Completed challenges')
  const challengeRows = completed.getByRole('listitem')
  await expect(challengeRows).toHaveCount(2)
  await expect(challengeRows.nth(0)).toContainText('Classes')
  await expect(challengeRows.nth(0)).toContainText('22 Oct 2026')
  await expect(challengeRows.nth(1)).toContainText('Loops')
  await expect(challengeRows.nth(1)).toContainText('20 Oct 2026')
  await expect(completed.getByText('No completed challenges yet.')).toHaveCount(0)

  const projects = card(page, 'Project groups')
  const projectRows = projects.getByRole('listitem')
  await expect(projectRows).toHaveCount(2)
  await expect(projectRows.nth(0)).toContainText('Team Rocket')
  await expect(projectRows.nth(0)).toContainText('Repair the counter app')
  await expect(projectRows.nth(1)).toContainText('Team Solo')
  await expect(projectRows.nth(1)).toContainText('Shapes')
  await expect(projects.locator('.le-status')).toHaveText(['submitted', 'draft'])
  await expect(projects.getByText('Not in any project group yet.')).toHaveCount(0)

  // Only the page asks; the chip already has the name (G16 Step 11).
  expect(requests).toEqual([{ target: studentId, caller: studentId }])
  await page.screenshot({ path: testInfo.outputPath('own-profile.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})

test("a classmate's profile is asked for by id in the URL, with the viewer in the header", async ({
  page,
}) => {
  const { pageErrors } = await prepare(page, studentId, {})
  const bob = profileOf(classmateId, {
    displayName: 'Bob',
    completedChallenges: [
      {
        challengeId: '507f1f77bcf86cd799439113',
        title: 'Recursion',
        completedAt: '2026-10-21T12:00:00.000Z',
      },
    ],
  })
  const requests = await mockProfile(page, bob)

  await page.goto(`/profiles/${classmateId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Bob' })).toBeVisible()
  // The page shows Bob; the top bar's chip (G12) still shows the viewer.
  await expect(page.getByRole('banner').getByRole('link', { name: 'Alice' })).toHaveAttribute(
    'href',
    `/profiles/${studentId}`,
  )
  await expect(card(page, 'Completed challenges').getByRole('listitem')).toHaveText([
    /Recursion\s*21 Oct 2026/,
  ])
  await expect(card(page, 'Project groups').getByRole('listitem')).toHaveCount(0)
  await expect(page.getByText('Not in any project group yet.')).toBeVisible()

  expect(requests).toEqual([{ target: classmateId, caller: studentId }])
  expect(pageErrors).toEqual([])
})

test('a profile with nothing to show gets both empty-state lines', async ({ page }) => {
  const { pageErrors } = await prepare(page, studentId, {})
  await mockProfile(page, profileOf(classmateId, { displayName: 'Ben Ong', classrooms: [] }))

  await page.goto(`/profiles/${classmateId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ben Ong' })).toBeVisible()
  const completed = card(page, 'Completed challenges')
  await expect(completed.getByText('No completed challenges yet.')).toBeVisible()
  await expect(completed.getByRole('list')).toHaveCount(0)
  const projects = card(page, 'Project groups')
  await expect(projects.getByText('Not in any project group yet.')).toBeVisible()
  await expect(projects.getByRole('list')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

// Decision H-16: a professor earns no points and does no challenges or groups.
test("a professor's profile shows only their classrooms", async ({ page }) => {
  const { pageErrors } = await prepare(page, studentId, {})
  await mockProfile(page, profileOf(professorId, { displayName: 'Prof Tan', role: 'professor' }))

  await page.goto(`/profiles/${professorId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Prof Tan' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Classrooms'])
  await expect(page.getByRole('link', { name: 'CS101' })).toBeVisible()
  await expect(page.getByText('points')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

// G9: the header picture. The helper answers DiceBear with a stand-in picture.
const headerAvatar = (page) => page.locator('header.le-person img')

test("a classmate's picture is seeded by their id, not the viewer's", async ({ page }) => {
  const { pageErrors } = await prepare(page, studentId, {})
  await mockProfile(page, profileOf(classmateId, { displayName: 'Bob Tan' }))

  await page.goto(`/profiles/${classmateId}`)
  const picture = headerAvatar(page)
  await expect(picture).toHaveAttribute(
    'src',
    `https://api.dicebear.com/10.x/thumbs/svg?seed=${classmateId}`,
  )
  await expect(picture).toHaveAttribute('alt', '')
  await expect.poll(() => picture.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0)
  expect(pageErrors).toEqual([])
})

test('initials replace the picture when DiceBear cannot be reached', async ({ page }, testInfo) => {
  const { pageErrors } = await prepare(page, studentId, {})
  const blocked = []
  // Registered after the helper's stand-in, so it wins.
  await page.route('https://api.dicebear.com/**', (route) => {
    blocked.push(route.request().url())
    return route.abort()
  })
  await mockProfile(page, profileOf(classmateId, { displayName: 'Bob Tan' }))

  await page.goto(`/profiles/${classmateId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Bob Tan' })).toBeVisible()
  const fallback = page.locator('header.le-person .le-person-icon')
  await expect(fallback).toHaveText('BT')
  await expect(fallback).toHaveAttribute('aria-hidden', 'true')
  await expect(headerAvatar(page)).toHaveCount(0)
  const box = await fallback.boundingBox()
  // 4rem at the default 16px root size.
  expect(box.width).toBeCloseTo(64, 0)
  expect(box.height).toBeCloseTo(64, 0)
  // One try each for the page's picture and the viewer's chip, which since G16
  // Step 11 shows as soon as the login is known.
  expect(blocked.toSorted()).toEqual(
    [studentId, classmateId].map((id) => `https://api.dicebear.com/10.x/thumbs/svg?seed=${id}`),
  )

  await page.screenshot({ path: testInfo.outputPath('avatar-fallback.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})

// G13: the milestone ring. The page's sentence and dash value are covered by
// milestone-ring.spec.js; these check what only the CSS decides.
const ring = (page) => page.locator('.le-ring')
const ringStyles = (page) =>
  ring(page).evaluate((svg) => {
    const style = (selector) => getComputedStyle(svg.querySelector(selector))
    const track = style('.le-ring-track')
    const fill = style('.le-ring-fill')
    return {
      trackFill: track.fill,
      trackStroke: track.stroke,
      fillFill: fill.fill,
      fillStroke: fill.stroke,
      dash: fill.strokeDasharray,
      animation: fill.animationName,
    }
  })

test('the ring draws 3 of 5 in the section accent on a visible track', async ({
  page,
}, testInfo) => {
  const { pageErrors } = await prepare(page, studentId, {})
  await mockProfile(
    page,
    profileOf(studentId, {
      helpfulCount: 3,
      milestones: ['First Assist'],
      nextMilestone: { label: 'Helpful Five', threshold: 5 },
    }),
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/profiles/${studentId}`)
  const contributions = card(page, 'Mentoring contributions')
  await expect(contributions.getByText('3 of 5 helpful hints toward Helpful Five')).toBeVisible()

  const box = await ring(page).boundingBox()
  expect(box.width).toBe(48)
  expect(box.height).toBe(48)
  // Wait for the draw-in to finish on the template's value.
  await expect.poll(async () => (await ringStyles(page)).dash).toBe('60px, 100px')
  const styles = await ringStyles(page)
  // Outlines only: without fill: none both circles would be solid discs.
  expect(styles.trackFill).toBe('none')
  expect(styles.fillFill).toBe('none')
  // The ring is violet on a quarter-violet track.
  expect(styles.fillStroke).toBe('rgb(194, 115, 255)')
  // 25% #c273ff into #2a233f, #50376f; the fill is 3.40:1 on it.
  expect(styles.trackStroke).toBe('color(srgb 0.313725 0.215686 0.435294)')
  expect(styles.animation).toBe('le-ring-draw')
  await contributions.screenshot({ path: testInfo.outputPath('ring-1280.png') })
  expect(pageErrors).toEqual([])
})

test('at 375px an empty ring keeps its size beside a wrapping sentence', async ({
  page,
}, testInfo) => {
  const { pageErrors } = await prepare(page, studentId, {})
  await mockProfile(page, profileOf(studentId))
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`/profiles/${studentId}`)
  const contributions = card(page, 'Mentoring contributions')
  const sentence = contributions.getByText('0 of 1 helpful hints toward First Assist')
  await expect(sentence).toBeVisible()

  const ringBox = await ring(page).boundingBox()
  const sentenceBox = await sentence.boundingBox()
  expect(ringBox.width).toBe(48)
  // Side by side, not stacked.
  expect(sentenceBox.x).toBeGreaterThan(ringBox.x + ringBox.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await contributions.screenshot({ path: testInfo.outputPath('ring-375.png') })
  expect(pageErrors).toEqual([])
})
