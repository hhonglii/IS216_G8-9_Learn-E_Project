// Product test for H3 Step 5 and decision H-16.
// A profile lists only classrooms the viewer shares, so its links open for a
// classmate and for the professor, not just for the profile's owner. From the
// classroom page a student can open the professor's profile and a classmate's.
import { test, expect } from './helpers/test.js'
import { apiAs } from './helpers/api.js'
import {
  approveLearner,
  classroomWithChallenge,
  miniProjectIn,
  pageFor,
  studentIn,
} from './helpers/setup.js'

async function anaWithEverything(request) {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  await approveLearner(request, setup, ana)
  const miniProject = await miniProjectIn(request, setup.professor, setup.classroom)
  await apiAs(request, ana, 'POST', `/mini-projects/${miniProject.id}/groups`, {
    name: 'Team Loop',
  })
  return { setup, ana, miniProject }
}

const viewers = [
  ['a classmate', (request, setup) => studentIn(request, setup.classroom, 'Ben Ong')],
  ['the professor', (request, setup) => setup.professor],
]

for (const [viewer, viewerFor] of viewers) {
  test(`${viewer} follows each link on a student's profile`, async ({ browser, request }) => {
    const { setup, ana, miniProject } = await anaWithEverything(request)
    const page = await pageFor(browser, await viewerFor(request, setup))
    const profile = `/profiles/${ana.id}`

    await page.goto(profile)
    await page.getByRole('link', { name: setup.classroom.name }).click()
    await expect(page).toHaveURL(`/classrooms/${setup.classroom.id}`)
    await expect(page.getByRole('heading', { name: setup.classroom.name })).toBeVisible()

    await page.goto(profile)
    await page.getByRole('link', { name: setup.challenge.title }).click()
    await expect(page).toHaveURL(`/challenges/${setup.challenge.id}`)
    await expect(page.getByRole('heading', { level: 1, name: setup.challenge.title })).toBeVisible()

    await page.goto(profile)
    await page.getByRole('link', { name: 'Team Loop' }).click()
    await expect(page).toHaveURL(`/mini-projects/${miniProject.id}`)
    await expect(page.getByRole('heading', { name: miniProject.title })).toBeVisible()
  })
}

test("a student opens the professor's and a classmate's profile from the classroom", async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const ben = await studentIn(request, setup.classroom, 'Ben Ong')
  const page = await pageFor(browser, ben)
  const classroom = `/classrooms/${setup.classroom.id}`

  await page.goto(classroom)
  await page.getByRole('link', { name: 'Prof Tan' }).click()
  await expect(page).toHaveURL(`/profiles/${setup.professor.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Prof Tan' })).toBeVisible()
  await expect(page.getByRole('link', { name: setup.classroom.name })).toBeVisible()
  // A professor has no points, challenges or groups of their own to show.
  await expect(page.getByRole('heading', { name: 'Completed challenges' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Project groups' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mentoring contributions' })).toHaveCount(0)

  await page.goto(classroom)
  await page.getByRole('link', { name: 'Ana Cruz' }).click()
  await expect(page).toHaveURL(`/profiles/${ana.id}`)
  await expect(page.getByRole('heading', { name: 'Completed challenges' })).toBeVisible()
})
