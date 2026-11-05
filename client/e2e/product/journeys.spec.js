// Product journeys for H2.
// Each journey runs against the real server and an in-memory MongoDB (decision H-5).
// Setup goes through the API; the part of the feature being checked goes through
// the browser, and a reload or a fresh page proves the result was saved. GitHub
// answers come from ../fake-github.js, and avatars are blocked (helpers/test.js).
import { test, expect } from './helpers/test.js'
import { API } from './helpers/api.js'
import {
  FAKE_REPOSITORY,
  approveLearner,
  askForHelp,
  classroomWithChallenge,
  classroomWithMiniProject,
  groupWithEvidence,
  pageFor,
  studentIn,
} from './helpers/setup.js'

// Phase B publication is covered by classroom-challenges.spec.js.

const itemWith = (page, text) => page.getByRole('listitem').filter({ hasText: text })

test('approved learner becomes eligible mentor', async ({ browser, request }) => {
  const setup = await classroomWithChallenge(request)
  const learner = await studentIn(request, setup.classroom, 'Ana Cruz')
  const asker = await studentIn(request, setup.classroom, 'Ben Ong')
  await askForHelp(request, setup, asker)
  const helpQueue = `/classrooms/${setup.classroom.id}/help`

  const page = await pageFor(browser, learner)
  await page.goto(helpQueue)
  const card = itemWith(page, 'Ben Ong')
  // Not a mentor yet: no dead button, just the reason (UX audit item 6).
  const notYet = 'Finish this challenge and get your diagnosis approved to help here.'
  await expect(card.getByRole('button', { name: 'Claim request' })).toHaveCount(0)
  await expect(card.getByText(notYet)).toBeVisible()
  // DiceBear is blocked, so the requester's avatar falls back to initials.
  await expect(card.getByText('BO', { exact: true })).toBeVisible()

  await page.goto(`/challenges/${setup.challenge.id}`)
  await page.getByLabel('Predicted output').selectOption({ label: '3' })
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByText('Correct answer!')).toBeVisible()
  await page
    .getByLabel('Diagnosis and proposed repair')
    .fill('The loop stops at 2 because of i < 3, so the last item is never added.')
  await page.getByRole('button', { name: 'Submit diagnosis' }).click()
  await expect(page.getByText('Your diagnosis has been submitted for review.')).toBeVisible()

  // A submitted diagnosis is not enough: only the professor's approval counts.
  await page.goto(helpQueue)
  await expect(card.getByText(notYet)).toBeVisible()

  const professorPage = await pageFor(browser, setup.professor)
  await professorPage.goto(`/classrooms/${setup.classroom.id}/review`)
  await itemWith(professorPage, 'Ana Cruz').getByRole('button', { name: 'Review' }).click()
  await professorPage.getByRole('button', { name: 'Approve diagnosis' }).click()
  await expect(professorPage.getByText(/^Approved .+'s diagnosis for ".+"\.$/)).toBeVisible()

  await page.reload()
  await expect(card.getByRole('button', { name: 'Claim request' })).toBeEnabled()
  await expect(card.getByText(notYet)).toHaveCount(0)
})

test('mentor resolves a help request once', async ({ browser, request }) => {
  const setup = await classroomWithChallenge(request)
  const mentor = await studentIn(request, setup.classroom, 'Ana Cruz')
  const asker = await studentIn(request, setup.classroom, 'Ben Ong')
  await approveLearner(request, setup, mentor)
  const helpRequest = await askForHelp(request, setup, asker)
  const helpQueue = `/classrooms/${setup.classroom.id}/help`
  const hint = 'Which value of i is the last one the loop runs with?'

  const mentorPage = await pageFor(browser, mentor)
  await mentorPage.goto(helpQueue)
  const mentorCard = itemWith(mentorPage, 'Ben Ong')
  await mentorCard.getByRole('button', { name: 'Claim request' }).click()
  await expect(mentorCard.getByText('You claimed this. Write your hint below.')).toBeVisible()
  await mentorCard.getByRole('button', { name: 'Open request' }).click()
  await mentorPage.getByLabel(/Your hint/).fill(hint)
  await mentorPage.getByRole('button', { name: 'Send hint' }).click()
  await expect(
    mentorCard.getByText('You sent a hint. Waiting for the asker to say if it helped.'),
  ).toBeVisible()

  const askerPage = await pageFor(browser, asker)
  await askerPage.goto(helpQueue)
  const askerCard = itemWith(askerPage, 'Ben Ong')
  await askerCard.getByRole('button', { name: 'Open request' }).click()
  await expect(askerCard.getByText(hint)).toBeVisible()
  await askerCard.getByRole('button', { name: 'Helpful' }).click()
  await expect(askerCard.getByText('Resolved', { exact: true })).toBeVisible()

  await askerPage.reload()
  await askerCard.getByRole('button', { name: 'Open request' }).click()
  await expect(askerCard.getByText(hint)).toBeVisible()
  await expect(askerCard.getByRole('button', { name: 'Helpful' })).toHaveCount(0)

  // Saying "helpful" again must not pay twice, and the request cannot be reopened.
  const resolve = (resolution) =>
    request.put(`${API}/help-requests/${helpRequest.id}/resolve`, {
      data: { resolution },
      headers: { authorization: `Bearer ${asker.token}` },
    })
  expect((await resolve('helpful')).status()).toBe(200)
  expect((await resolve('unresolved')).status()).toBe(409)

  await mentorPage.goto(`/profiles/${mentor.id}`)
  const contributions = mentorPage.getByRole('region', { name: 'Mentoring contributions' })
  await expect(contributions.getByText('1', { exact: true })).toBeVisible()
  await expect(
    itemWith(mentorPage, setup.classroom.name).getByText('5 points', { exact: true }),
  ).toBeVisible()
})

test('students form a group and attach GitHub evidence', async ({ browser, request }) => {
  const setup = await classroomWithMiniProject(request, { maxGroupSize: 2 })
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const ben = await studentIn(request, setup.classroom, 'Ben Ong')
  const cy = await studentIn(request, setup.classroom, 'Cy Lim')
  const projectPage = `/mini-projects/${setup.miniProject.id}`
  const teamLoop = (page) => itemWith(page, 'Team Loop')

  const anaPage = await pageFor(browser, ana)
  await anaPage.goto(projectPage)
  await anaPage.getByLabel('New group name').fill('Team Loop')
  await anaPage.getByRole('button', { name: 'Create group' }).click()
  await expect(anaPage.getByText('Your group: Team Loop')).toBeVisible()

  const benPage = await pageFor(browser, ben)
  await benPage.goto(projectPage)
  await expect(teamLoop(benPage)).toContainText('1 member')
  await teamLoop(benPage).getByRole('button', { name: 'Join group' }).click()
  await expect(benPage.getByText('Your group: Team Loop')).toBeVisible()

  // The group now holds its maximum of two, so a third student is turned away.
  const cyPage = await pageFor(browser, cy)
  await cyPage.goto(projectPage)
  await expect(teamLoop(cyPage)).toContainText('2 members')
  await teamLoop(cyPage).getByRole('button', { name: 'Join group' }).click()
  await expect(
    cyPage.getByText('This group is full. Join another group or create your own.'),
  ).toBeVisible()
  await cyPage.reload()
  await expect(cyPage.getByLabel('New group name')).toBeVisible()
  await expect(cyPage.getByText('Your group:')).toHaveCount(0)

  await anaPage.getByLabel('GitHub repository link', { exact: true }).fill(FAKE_REPOSITORY)
  await anaPage.getByRole('button', { name: 'Attach', exact: true }).click()
  await expect(anaPage.getByRole('link', { name: FAKE_REPOSITORY })).toBeVisible()
  const anaEvidence = anaPage.getByRole('region', { name: 'GitHub repository evidence' })
  await expect(anaEvidence.getByText('Last successful refresh: Never')).toBeVisible()
  await anaEvidence.getByRole('button', { name: 'Refresh GitHub data' }).click()
  await expect(anaEvidence.getByRole('heading', { name: 'loop-fixer' })).toBeVisible()
  await expect(anaEvidence.getByRole('heading', { name: 'Fix the loop bound' })).toBeVisible()
  await expect(anaEvidence.getByRole('link', { name: 'ana-cruz' })).toBeVisible()

  // The snapshot was saved: a groupmate's fresh load shows it without refreshing GitHub.
  await benPage.reload()
  const benEvidence = benPage.getByRole('region', { name: 'GitHub repository evidence' })
  await expect(benEvidence.getByRole('heading', { name: 'loop-fixer' })).toBeVisible()
  await expect(benEvidence.getByText('3 commits')).toBeVisible()
  await expect(benEvidence.getByText('Last successful refresh: Never')).toHaveCount(0)
})

test('professor reviews a submitted mini-project', async ({ browser, request }) => {
  const setup = await classroomWithMiniProject(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  await groupWithEvidence(request, setup, ana, 'Team Loop')
  const feedback = 'Add a test for an empty cart.'

  const anaPage = await pageFor(browser, ana)
  await anaPage.goto(`/mini-projects/${setup.miniProject.id}`)
  const submit = anaPage.getByRole('region', { name: 'Submit for review' })
  await submit.getByLabel('Reflection').fill('We traced the loop and fixed its bound.')
  await submit.getByRole('button', { name: 'Submit for review' }).click()
  await expect(submit.getByText("Waiting for your professor's review.")).toBeVisible()

  const professorPage = await pageFor(browser, setup.professor)
  await professorPage.goto(`/classrooms/${setup.classroom.id}/review`)
  const pending = itemWith(professorPage, 'Team Loop')
  await pending.getByRole('button', { name: 'Review' }).click()
  await expect(professorPage.getByText('We traced the loop and fixed its bound.')).toBeVisible()
  await professorPage.getByLabel('Return for corrections').check()
  await professorPage.getByLabel('Professor feedback').fill(feedback)
  await professorPage.getByRole('button', { name: 'Return group project' }).click()
  await expect(
    professorPage.getByText(/^Returned .+'s project with your feedback\.$/),
  ).toBeVisible()
  await expect(pending).toHaveCount(0)

  await anaPage.reload()
  await expect(
    submit.getByText('Read the feedback, update your evidence', { exact: false }),
  ).toBeVisible()
  await expect(submit.getByText(feedback)).toBeVisible()
  await submit.getByLabel('Reflection').fill('We fixed the bound and tested an empty cart.')
  await submit.getByRole('button', { name: 'Submit for review' }).click()
  await expect(submit.getByText("Waiting for your professor's review.")).toBeVisible()

  await professorPage.reload()
  await pending.getByRole('button', { name: 'Review' }).click()
  await expect(
    professorPage.getByText('We fixed the bound and tested an empty cart.'),
  ).toBeVisible()
  await professorPage.getByRole('button', { name: 'Approve group project' }).click()
  await expect(professorPage.getByText(/^Approved .+'s project\.$/)).toBeVisible()

  await anaPage.reload()
  await expect(submit.getByText('Your professor approved this work.')).toBeVisible()
  await expect(submit.getByRole('button', { name: 'Submit for review' })).toHaveCount(0)
})
