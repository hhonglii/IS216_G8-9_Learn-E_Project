// Product tests for H5 Step 3.
// The server going away mid-journey. Each test loads a page while the server
// is up, then makes every API call fail as a stopped server would (connection
// refused). The next save must announce a plain error, keep the typed text,
// and work when pressed again once the server is back.
import { test, expect } from './helpers/test.js'
import { API, apiAs, logInAs, register } from './helpers/api.js'
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

const stopServer = (page) => page.route(`${API}/**`, (route) => route.abort('connectionrefused'))
const startServer = (page) => page.unroute(`${API}/**`)
const unreachable = 'Could not reach the server.'

// Fills field and presses button with the server down, checks the error and
// the kept text, then presses it again with the server back.
async function saveThroughOutage(page, { field, text, button, error, saved }) {
  await field.fill(text)
  await stopServer(page)
  await button.click()
  await expect(page.getByRole('alert').filter({ hasText: error }).first()).toBeVisible()
  await expect(field).toHaveValue(text)
  await startServer(page)
  await button.click()
  await expect(saved).toBeVisible()
}

const itemWith = (page, text) => page.getByRole('listitem').filter({ hasText: text })

test('logging in and creating a classroom through an outage', async ({ page, request }) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const username = page.getByLabel('Username', { exact: true }).first()
  const password = page.getByLabel('Password', { exact: true }).first()
  await page.goto('/login')
  await username.fill(professor.username)
  await password.fill(professor.password)
  await stopServer(page)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert').filter({ hasText: unreachable })).toBeVisible()
  // The username stays; the password is cleared after any failed log in.
  await expect(username).toHaveValue(professor.username)
  await startServer(page)
  await password.fill(professor.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL('/')

  await saveThroughOutage(page, {
    field: page.getByLabel('Classroom name'),
    text: 'Loops after the outage',
    button: page.getByRole('button', { name: 'Create classroom' }),
    error: unreachable,
    saved: page.getByText('Created Loops after the outage.'),
  })
})

test('a student joins a classroom through an outage', async ({ page, request }) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', { name: 'Arrays' })
  const student = await register(request, 'student', 'Sam Lee')
  await logInAs(page, student)
  await page.goto('/')
  await saveThroughOutage(page, {
    field: page.getByLabel('Classroom join code'),
    text: classroom.joinCode,
    button: page.getByRole('button', { name: 'Join classroom' }),
    error: unreachable,
    saved: page.getByText(`Joined ${classroom.name}`),
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: classroom.name })).toBeVisible()
})

test('a challenge draft is saved through an outage', async ({ page, request }) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', { name: 'Loops' })
  await logInAs(page, professor)
  await page.goto(`/classrooms/${classroom.id}`)
  await page.getByRole('button', { name: 'New challenge', exact: true }).click()
  const editor = page.getByRole('region', { name: 'New draft', exact: true })
  await editor.getByLabel('Language', { exact: true }).fill('JavaScript')
  await editor.getByLabel('Learning objective', { exact: true }).fill('Trace a loop')
  await saveThroughOutage(page, {
    field: editor.getByLabel('Challenge title', { exact: true }),
    text: 'Saved after the outage',
    button: editor.getByRole('button', { name: 'Save draft', exact: true }),
    error: 'Could not reach the server to confirm the save.',
    saved: page.getByText('Draft saved.'),
  })
  await expect(page.getByLabel('Learning objective', { exact: true })).toHaveValue('Trace a loop')
})

test('an answer and a diagnosis are sent through an outage', async ({ browser, request }) => {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const page = await pageFor(browser, ana)
  await page.goto(`/challenges/${setup.challenge.id}`)

  await page.getByLabel('Predicted output').selectOption({ label: '3' })
  await stopServer(page)
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByRole('alert').filter({ hasText: unreachable })).toBeVisible()
  await expect(page.getByLabel('Predicted output')).toHaveValue('a')
  await startServer(page)
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByText('Correct answer!')).toBeVisible()

  await saveThroughOutage(page, {
    field: page.getByLabel('Diagnosis and proposed repair'),
    text: 'The loop stops at 2 because of i < 3, so the last item is never added.',
    button: page.getByRole('button', { name: 'Submit diagnosis' }),
    error: unreachable,
    saved: page.getByText('Your diagnosis has been submitted for review.'),
  })
})

test('a help request and a hint are sent through an outage', async ({ browser, request }) => {
  const setup = await classroomWithChallenge(request)
  const mentor = await studentIn(request, setup.classroom, 'Ana Cruz')
  const asker = await studentIn(request, setup.classroom, 'Ben Ong')
  await approveLearner(request, setup, mentor)
  const helpQueue = `/classrooms/${setup.classroom.id}/help`

  // General class help (decision H-14) is the kind with text to keep through an outage.
  const askerPage = await pageFor(browser, asker)
  await askerPage.goto(helpQueue)
  await askerPage.getByRole('radio', { name: /^Something else in this class/ }).check()
  await askerPage.getByLabel(/Code snippet/).fill('for (let i = 1; i < 3; i++) total += i')
  await askerPage.getByLabel(/Expected behavior/).fill('The total should be 6.')
  await askerPage.getByRole('radio', { name: /^Guiding question/ }).check()
  await saveThroughOutage(askerPage, {
    field: askerPage.getByLabel(/Actual behavior/),
    text: 'It prints 3 after the outage.',
    button: askerPage.getByRole('button', { name: 'Submit help request' }),
    error: unreachable,
    saved: itemWith(askerPage, 'It prints 3 after the outage.'),
  })

  const mentorPage = await pageFor(browser, mentor)
  await mentorPage.goto(helpQueue)
  const card = itemWith(mentorPage, 'It prints 3 after the outage.')
  await card.getByRole('button', { name: 'Claim request' }).click()
  await card.getByRole('button', { name: 'Open request' }).click()
  await saveThroughOutage(mentorPage, {
    field: mentorPage.getByLabel(/Your hint/),
    text: 'Which value of i is the last one the loop runs with?',
    button: mentorPage.getByRole('button', { name: 'Send hint' }),
    error: unreachable,
    saved: card.getByText('You sent a hint. Waiting for the asker to say if it helped.'),
  })
  await mentorPage.reload()
  await expect(
    card.getByText('You sent a hint. Waiting for the asker to say if it helped.'),
  ).toBeVisible()
})

test('stage evidence, the repository link and the reflection are saved through an outage', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithMiniProject(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  await groupWithEvidence(request, setup, ana, 'Team Loop')
  const page = await pageFor(browser, ana)
  await page.goto(`/mini-projects/${setup.miniProject.id}`)

  await saveThroughOutage(page, {
    field: page.getByLabel('Extend evidence'),
    text: 'Added a test for an empty cart.',
    button: page.getByRole('button', { name: 'Save stage evidence' }),
    error: unreachable,
    saved: page.getByText('Saved.', { exact: true }),
  })
  await saveThroughOutage(page, {
    field: page.getByLabel('GitHub repository link', { exact: true }),
    text: FAKE_REPOSITORY,
    button: page.getByRole('button', { name: 'Attach', exact: true }),
    error: unreachable,
    saved: page.getByRole('link', { name: FAKE_REPOSITORY }),
  })
  const submit = page.getByRole('region', { name: 'Submit for review' })
  await saveThroughOutage(page, {
    field: submit.getByLabel('Reflection'),
    text: 'We traced the loop and fixed its bound.',
    button: submit.getByRole('button', { name: 'Submit for review' }),
    error: unreachable,
    saved: submit.getByText("Waiting for your professor's review."),
  })
  await page.reload()
  await expect(page.getByLabel('Extend evidence')).toHaveValue('Added a test for an empty cart.')
  await expect(page.getByRole('link', { name: FAKE_REPOSITORY })).toBeVisible()
})

test("a professor's review and a new profile name are saved through an outage", async ({
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
    appliedDiagnosis: 'The loop stops before the last item, so it is never added.',
  })
  const page = await pageFor(browser, setup.professor)
  await page.goto(`/classrooms/${setup.classroom.id}/review`)
  await itemWith(page, 'Ana Cruz').getByRole('button', { name: 'Review' }).click()
  await saveThroughOutage(page, {
    field: page.getByLabel('Professor feedback'),
    text: 'Well traced.',
    button: page.getByRole('button', { name: 'Approve diagnosis' }),
    error: unreachable,
    saved: page.getByText(/^Approved .+'s diagnosis for ".+"\.$/),
  })

  await page.goto(`/profiles/${setup.professor.id}`)
  await saveThroughOutage(page, {
    field: page.getByLabel('Display name'),
    text: 'Professor Tan',
    button: page.getByRole('button', { name: 'Save name' }),
    error: unreachable,
    saved: page.getByText('Name saved.'),
  })
  await page.reload()
  await expect(page.getByLabel('Display name')).toHaveValue('Professor Tan')
})

// Moving between pages inside the app while the server is down: each page
// announces that it could not load, and its retry works once the server is back.
test('each page announces a failed load and retries after an outage', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  await askForHelp(request, setup, ana)
  const nav = (page) => page.getByRole('navigation', { name: 'Primary navigation' })
  const page = await pageFor(browser, setup.professor)
  await page.goto(`/classrooms/${setup.classroom.id}`)
  const reviewLink = page.getByRole('link', { name: 'Professor review' })
  await expect(reviewLink).toBeVisible()

  for (const [open, error, retry, loaded] of [
    [
      () => nav(page).getByRole('link', { name: 'Help queue' }).click(),
      unreachable,
      'Try again',
      () => itemWith(page, 'Ana Cruz'),
    ],
    [
      () => nav(page).getByRole('link', { name: 'Classroom', exact: true }).click(),
      'Could not reach the server to load this classroom.',
      'Try again',
      () => reviewLink,
    ],
    [
      () => reviewLink.click(),
      unreachable,
      'Retry',
      () => page.getByRole('heading', { name: 'Applied diagnoses', exact: true }),
    ],
    [
      () => nav(page).getByRole('link', { name: 'Your profile' }).click(),
      unreachable,
      'Try again',
      () => page.getByLabel('Display name'),
    ],
  ]) {
    await stopServer(page)
    await open()
    await expect(page.getByRole('alert').filter({ hasText: error })).toBeVisible()
    await startServer(page)
    await page.getByRole('button', { name: retry, exact: true }).click()
    await expect(loaded()).toBeVisible()
  }

  // The dashboard has no retry button, so reloading the page is the retry.
  await stopServer(page)
  await nav(page).getByRole('link', { name: 'Dashboard' }).click()
  // Both the classroom list and Waiting on you say so.
  await expect(page.getByRole('alert').filter({ hasText: unreachable }).first()).toBeVisible()
  await startServer(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: setup.classroom.name })).toBeVisible()
})
