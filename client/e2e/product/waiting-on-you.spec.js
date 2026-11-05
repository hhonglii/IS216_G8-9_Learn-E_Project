// Product tests for H3 Step 12.
// "Waiting on you" against the real server: each kind of waiting work shows up
// on the dashboard and links to where the professor or student acts on it.
import { test, expect } from './helpers/test.js'
import { apiAs, register } from './helpers/api.js'
import {
  askForHelp,
  classroomWithChallenge,
  groupWithEvidence,
  miniProjectIn,
  pageFor,
  studentIn,
} from './helpers/setup.js'

const waiting = (page) => page.getByRole('region', { name: 'Waiting on you' })

test('a professor sees a diagnosis, a group and a help request waiting, and each link goes to its page', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const name = setup.classroom.name
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const attempt = await apiAs(request, ana, 'POST', `/challenges/${setup.challenge.id}/attempts`, {
    questionId: setup.questionId,
    value: 'a',
  })
  await apiAs(request, ana, 'PUT', `/attempts/${attempt.id}/applied`, {
    appliedDiagnosis: 'The loop stops before the last item, so it is never added.',
  })
  await askForHelp(request, setup, ana)
  const miniProject = await miniProjectIn(request, setup.professor, setup.classroom)
  const group = await groupWithEvidence(request, { miniProject }, ana, 'Team Ana')
  await apiAs(request, ana, 'PUT', `/groups/${group.id}/submit`, {
    reflection: 'We found the off-by-one first, then fixed and checked it.',
  })
  const page = await pageFor(browser, setup.professor)

  await page.goto('/')
  await expect(waiting(page).getByRole('link')).toHaveText([
    `${name}: 1 applied diagnosis to review`,
    `${name}: 1 group project submitted`,
    `${name}: 1 open help request`,
  ])

  await waiting(page)
    .getByRole('link', { name: `${name}: 1 applied diagnosis to review` })
    .click()
  await expect(page).toHaveURL(`/classrooms/${setup.classroom.id}/review`)
  await page.goto('/')
  await waiting(page)
    .getByRole('link', { name: `${name}: 1 open help request` })
    .click()
  await expect(page).toHaveURL(`/classrooms/${setup.classroom.id}/help`)
})

test('a professor and a student with nothing waiting are both told so', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const professorPage = await pageFor(browser, setup.professor)
  await professorPage.goto('/')
  await expect(waiting(professorPage)).toContainText('Nothing is waiting on you.')

  const student = await register(request, 'student', 'Ben Ong')
  const studentPage = await pageFor(browser, student)
  await studentPage.goto('/')
  await expect(studentPage.getByRole('heading', { name: 'Join classroom' })).toBeVisible()
  await expect(waiting(studentPage)).toContainText('Nothing is waiting on you.')
})

// Third-pass audit A: a student is told when returned work needs them.
test('a student sees a returned diagnosis and the link opens the challenge', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const attempt = await apiAs(request, ana, 'POST', `/challenges/${setup.challenge.id}/attempts`, {
    questionId: setup.questionId,
    value: 'a',
  })
  await apiAs(request, ana, 'PUT', `/attempts/${attempt.id}/applied`, {
    appliedDiagnosis: 'The loop stops early.',
  })
  await apiAs(request, setup.professor, 'PUT', `/attempts/${attempt.id}/review`, {
    decision: 'return',
    feedback: 'Say which item is missed.',
  })
  const page = await pageFor(browser, ana)
  await page.goto('/')
  const text = `${setup.classroom.name}: your diagnosis for "${setup.challenge.title}" was returned. Fix it and send it again.`
  await expect(waiting(page).getByRole('link')).toHaveText([text])
  await waiting(page).getByRole('link', { name: text }).click()
  await expect(page).toHaveURL(`/challenges/${setup.challenge.id}`)
})
