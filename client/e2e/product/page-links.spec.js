// Product tests for H3 Steps 6 to 11.
// The links and labels those steps added, followed against the real server: the
// hint link chooses its challenge, a professor can open a published challenge,
// the review shows the right answer, and a mini-project page carries its name.
import { test, expect } from './helpers/test.js'
import { apiAs } from './helpers/api.js'
import {
  classroomWithChallenge,
  classroomWithMiniProject,
  pageFor,
  studentIn,
} from './helpers/setup.js'

const nav = (page) => page.getByRole('navigation', { name: 'Primary navigation' })

test('a wrong answer offers a hint link that opens the help queue on that challenge', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const page = await pageFor(browser, ana)

  await page.goto(`/challenges/${setup.challenge.id}`)
  await page.getByLabel('Predicted output').selectOption({ label: '6' })
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await page.getByRole('link', { name: 'Ask a classmate for a hint' }).click()

  await expect(page).toHaveURL(
    new RegExp(
      `/classrooms/${setup.classroom.id}/help\\?challenge=${setup.challenge.id}&question=`,
    ),
  )
  const pick = page.getByLabel('Which challenge do you need help with?')
  await expect(pick).toHaveValue(setup.challenge.id)
  await expect(pick.locator('option:checked')).toHaveText(setup.challenge.title)
  // The question answered wrongly comes too (fifth pass W3), so the form is open at once.
  await expect(page.getByLabel('Which question?').locator('option:checked')).toHaveText(
    /^Question 1:/,
  )
  const submit = page.getByRole('button', { name: 'Submit help request' })
  await expect(submit).toBeVisible()

  // An id from somewhere else is ignored rather than chosen.
  await page.goto(`/classrooms/${setup.classroom.id}/help?challenge=not-in-this-classroom`)
  await expect(pick.locator('option')).toHaveCount(2)
  await expect(pick).toHaveValue('')
  // The form opens only once a listed challenge is chosen.
  await expect(submit).toHaveCount(0)
})

test('the professor opens a published challenge from the classroom page', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const page = await pageFor(browser, setup.professor)

  await page.goto(`/classrooms/${setup.classroom.id}`)
  await page.getByRole('link', { name: `View challenge: ${setup.challenge.title}` }).click()
  await expect(page).toHaveURL(`/challenges/${setup.challenge.id}`)
  await expect(page.getByRole('heading', { level: 1, name: setup.challenge.title })).toBeVisible()
})

test('the classroom summary names the right answer beside the wrong ones', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  await apiAs(request, ana, 'POST', `/challenges/${setup.challenge.id}/attempts`, {
    questionId: setup.questionId,
    value: 'b',
  })
  const page = await pageFor(browser, setup.professor)

  await page.goto(`/classrooms/${setup.classroom.id}/review`)
  const summary = page.getByRole('region', { name: 'Classroom summary' })
  await expect(summary.getByText('Right answer: 3')).toBeVisible()
  await expect(summary.getByRole('listitem')).toHaveText([/^6/])
})

test('a mini-project page is titled with its name and sends the professor to review', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithMiniProject(request)
  const page = await pageFor(browser, setup.professor)

  await page.goto(`/mini-projects/${setup.miniProject.id}`)
  await expect(page.getByRole('heading', { level: 1, name: setup.miniProject.title })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Brief' })).toBeVisible()
  await page.getByRole('link', { name: 'Review and approve submitted groups' }).click()
  await expect(page).toHaveURL(`/classrooms/${setup.classroom.id}/review`)
})

// H3 Step 11 (decision G-11, revised 2026-11-02): the challenge and mini-project
// pages tell the shell their classroom once they have loaded.
test('the challenge and mini-project pages show their classroom links in the sidebar', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const project = await classroomWithMiniProject(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  await apiAs(request, ana, 'POST', '/classrooms/join', { joinCode: project.classroom.joinCode })
  const page = await pageFor(browser, ana)

  await page.goto(`/challenges/${setup.challenge.id}`)
  await expect(nav(page).getByRole('link', { name: 'Help queue' })).toHaveAttribute(
    'href',
    `/classrooms/${setup.classroom.id}/help`,
  )
  await nav(page).getByRole('link', { name: 'Classroom', exact: true }).click()
  await expect(page).toHaveURL(`/classrooms/${setup.classroom.id}`)

  // A mini-project in another classroom replaces the links rather than keeping the old ones.
  await page.goto(`/mini-projects/${project.miniProject.id}`)
  await expect(nav(page).getByRole('link', { name: 'Classroom', exact: true })).toHaveAttribute(
    'href',
    `/classrooms/${project.classroom.id}`,
  )

  await nav(page).getByRole('link', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL('/')
  await expect(nav(page).getByRole('link', { name: 'Classroom', exact: true })).toHaveCount(0)
})
