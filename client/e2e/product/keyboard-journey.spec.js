// Product tests for H5 Step 2.
// The H4 journey with the keyboard only, against the real server. Nothing is
// clicked: every control is reached with Tab or Shift+Tab, buttons are pressed
// with Enter or Space, and text and select choices are typed. Each Tab stop
// must show a focus ring, and every input on each page must have a label.
// Earlier records come from the API, as in journeys.spec.js, so each test
// drives one part of the journey.
import { test, expect } from './helpers/test.js'
import { uniqueName } from './helpers/api.js'
import {
  FAKE_REPOSITORY,
  approveLearner,
  classroomWithChallenge,
  classroomWithMiniProject,
  pageFor,
  studentIn,
} from './helpers/setup.js'
import { PROFESSOR_CODE } from './professor-code.js'

test.setTimeout(90000)

// Presses Tab (Shift+Tab with back) until target has focus, failing at a stop
// that has no outline or box-shadow, or after 200 stops. Focus leaving the
// page for the browser's own toolbar lands on body, which is skipped.
async function tabTo(page, target, { back = false } = {}) {
  await expect(target).toBeVisible()
  for (let stop = 0; stop < 200; stop++) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const style = getComputedStyle(el)
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
      const shadow = style.boxShadow !== 'none'
      return { ring: outline || shadow, html: el.outerHTML.slice(0, 120) }
    })
    if (focused) expect(focused.ring, `focus ring on ${focused.html}`).toBe(true)
    if (await target.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error('Tab never reached the target')
}

const press = async (page, target, key = 'Enter', options) => {
  await tabTo(page, target, options)
  await page.keyboard.press(key)
}

const typeInto = async (page, target, text, options) => {
  await tabTo(page, target, options)
  await page.keyboard.type(text)
}

async function everyInputLabelled(page) {
  const unlabelled = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea')]
      .filter((el) => el.type !== 'hidden' && el.labels.length === 0)
      .map((el) => el.outerHTML.slice(0, 80)),
  )
  expect(unlabelled).toEqual([])
}

const itemWith = (page, text) => page.getByRole('listitem').filter({ hasText: text })

test('a professor signs up, makes a classroom and publishes a challenge by keyboard', async ({
  page,
}) => {
  const username = uniqueName('kbprof')
  const name = `Loops ${uniqueName('class')}`
  const title = `Off by one ${uniqueName('ch')}`

  await page.goto('/login')
  await everyInputLabelled(page)
  await typeInto(page, page.locator('#create-username'), username)
  await typeInto(page, page.getByLabel('Display name'), 'Prof Tan')
  await typeInto(page, page.getByLabel('Role'), 'Professor')
  await typeInto(page, page.getByLabel('Professor sign-up code'), PROFESSOR_CODE)
  await typeInto(page, page.locator('#create-password'), `pw-${username}-secret`)
  await press(page, page.getByRole('button', { name: 'Create account' }))
  await expect(page).toHaveURL('/')

  await everyInputLabelled(page)
  await typeInto(page, page.getByLabel('Classroom name'), name)
  await press(page, page.getByRole('button', { name: 'Create classroom' }))
  await expect(page.getByText(`Created ${name}.`)).toBeVisible()
  const card = page.getByRole('article').filter({ hasText: name })
  await press(page, card.getByRole('button', { name: 'Open classroom' }))
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()

  await press(page, page.getByRole('button', { name: 'New challenge', exact: true }))
  const editor = page.getByRole('region', { name: 'New draft', exact: true })
  await typeInto(page, editor.getByLabel('Challenge title', { exact: true }), title)
  await typeInto(page, editor.getByLabel('Language', { exact: true }), 'JavaScript')
  await typeInto(page, editor.getByLabel('Learning objective', { exact: true }), 'Trace a loop')
  await typeInto(page, editor.getByLabel('Challenge prompt', { exact: true }), 'Add 1 to 3.')
  await typeInto(page, editor.getByLabel('Code snippet (optional)'), 'for (let i = 1; i < 3; i++)')
  await typeInto(page, editor.getByLabel('Official explanation', { exact: true }), 'i < 3 skips 3.')
  await press(page, editor.getByRole('button', { name: 'Add question', exact: true }))
  await typeInto(
    page,
    editor.getByLabel('Question prompt', { exact: true }),
    'What does this print?',
    { back: true },
  )
  await typeInto(page, editor.getByLabel('Option 1', { exact: true }), '3')
  await typeInto(page, editor.getByLabel('Option 2', { exact: true }), '6')
  await typeInto(page, editor.getByLabel('Accepted option'), '3')
  await typeInto(page, editor.getByLabel('Question explanation', { exact: true }), '1 + 2 is 3.')
  await typeInto(
    page,
    editor.getByLabel('Applied-case prompt', { exact: true }),
    'A cart misses one item.',
  )
  await typeInto(page, editor.getByLabel('Hint 1', { exact: true }), 'Read the condition.')
  await typeInto(page, editor.getByLabel('Hint 2', { exact: true }), 'Which i never runs?')
  await everyInputLabelled(page)
  await press(page, editor.getByRole('button', { name: 'Save draft', exact: true }))

  // The product server has no Gemini key, so asking for hints must say so
  // without losing the typed ones.
  const draft = page.getByRole('region', { name: 'Edit draft', exact: true })
  await expect(draft.getByText('Draft saved.')).toBeVisible()
  const suggestions = draft.getByRole('region', { name: 'Hint suggestions' })
  await press(page, suggestions.getByRole('button', { name: 'Suggest hints' }), 'Enter', {
    back: true,
  })
  await expect(suggestions.getByRole('alert')).toBeVisible()
  await expect(draft.getByLabel('Hint 2', { exact: true })).toHaveValue('Which i never runs?')

  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await press(page, draft.getByRole('button', { name: 'Publish challenge', exact: true }))
  const published = page.getByRole('region', { name: 'Published challenge', exact: true })
  await expect(published.getByText('Published challenges are locked for editing.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: `View challenge: ${title}` })).toBeVisible()
})

test('a student answers and is approved as a mentor by keyboard', async ({ browser, request }) => {
  const setup = await classroomWithChallenge(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')

  const page = await pageFor(browser, ana)
  await page.goto(`/challenges/${setup.challenge.id}`)
  await everyInputLabelled(page)
  await typeInto(page, page.getByLabel('Predicted output'), '3')
  await press(page, page.getByRole('button', { name: 'Submit answer' }))
  await expect(page.getByText('Correct answer!')).toBeVisible()
  await typeInto(
    page,
    page.getByLabel('Diagnosis and proposed repair'),
    'The loop stops at 2 because of i < 3, so the last item is never added.',
  )
  await press(page, page.getByRole('button', { name: 'Submit diagnosis' }))
  await expect(page.getByText('Your diagnosis has been submitted for review.')).toBeVisible()

  const professorPage = await pageFor(browser, setup.professor)
  await professorPage.goto(`/classrooms/${setup.classroom.id}/review`)
  await press(
    professorPage,
    itemWith(professorPage, 'Ana Cruz').getByRole('button', { name: 'Review' }),
  )
  await everyInputLabelled(professorPage)
  await typeInto(professorPage, professorPage.getByLabel('Professor feedback'), 'Well traced.')
  await press(professorPage, professorPage.getByRole('button', { name: 'Approve diagnosis' }))
  await expect(professorPage.getByText(/^Approved .+'s diagnosis for ".+"\.$/)).toBeVisible()
})

test('a learner asks, a mentor hints and the learner marks it helpful by keyboard', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const mentor = await studentIn(request, setup.classroom, 'Ana Cruz')
  const asker = await studentIn(request, setup.classroom, 'Ben Ong')
  await approveLearner(request, setup, mentor)
  const helpQueue = `/classrooms/${setup.classroom.id}/help`
  const hint = 'Which value of i is the last one the loop runs with?'

  const askerPage = await pageFor(browser, asker)
  await askerPage.goto(helpQueue)
  // Question help (decision H-14): the challenge, its question and a hint type.
  // With no hint chosen yet, Tab stops on the first one and Space picks it.
  await typeInto(askerPage, askerPage.getByLabel('Which challenge do you need help with?'), 'Off')
  await typeInto(askerPage, askerPage.getByLabel('Which question?'), 'Question 1')
  await press(askerPage, askerPage.getByRole('radio', { name: /^Guiding question/ }), 'Space')
  await expect(askerPage.getByRole('radio', { name: /^Guiding question/ })).toBeChecked()
  await everyInputLabelled(askerPage)
  await press(askerPage, askerPage.getByRole('button', { name: 'Submit help request' }))
  const askerCard = itemWith(askerPage, 'Question 1')
  await expect(askerCard).toBeVisible()

  const mentorPage = await pageFor(browser, mentor)
  await mentorPage.goto(helpQueue)
  const mentorCard = itemWith(mentorPage, 'Question 1')
  await press(mentorPage, mentorCard.getByRole('button', { name: 'Claim request' }))
  await expect(mentorCard.getByText('You claimed this. Write your hint below.')).toBeVisible()
  await press(mentorPage, mentorCard.getByRole('button', { name: 'Open request' }), 'Space', {
    back: true,
  })
  await typeInto(mentorPage, mentorPage.getByLabel(/Your hint/), hint)
  await everyInputLabelled(mentorPage)
  await press(mentorPage, mentorPage.getByRole('button', { name: 'Send hint' }))
  await expect(
    mentorCard.getByText('You sent a hint. Waiting for the asker to say if it helped.'),
  ).toBeVisible()

  await askerPage.reload()
  await press(askerPage, askerCard.getByRole('button', { name: 'Open request' }))
  await expect(askerCard.getByText(hint)).toBeVisible()
  await press(askerPage, askerCard.getByRole('button', { name: 'Helpful' }))
  await expect(askerCard.getByText('Resolved', { exact: true })).toBeVisible()
})

test('a group records evidence, attaches GitHub and is approved by keyboard', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithMiniProject(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')

  const page = await pageFor(browser, ana)
  await page.goto(`/mini-projects/${setup.miniProject.id}`)
  await typeInto(page, page.getByLabel('New group name'), 'Team Loop')
  await press(page, page.getByRole('button', { name: 'Create group' }))
  await expect(page.getByText('Your group: Team Loop')).toBeVisible()

  await typeInto(page, page.getByLabel('Diagnose evidence'), 'The loop stops one item early.')
  await typeInto(page, page.getByLabel('Repair evidence'), 'Changed < to <= in the loop.')
  await typeInto(page, page.getByLabel('Verify evidence'), 'A three-item cart totals right.')
  await press(page, page.getByRole('button', { name: 'Save stage evidence' }))
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()

  await typeInto(page, page.getByLabel('GitHub repository link', { exact: true }), FAKE_REPOSITORY)
  await press(page, page.getByRole('button', { name: 'Attach', exact: true }))
  const evidence = page.getByRole('region', { name: 'GitHub repository evidence' })
  await press(page, evidence.getByRole('button', { name: 'Refresh GitHub data' }), 'Space')
  await expect(evidence.getByRole('heading', { name: 'loop-fixer' })).toBeVisible()

  const submit = page.getByRole('region', { name: 'Submit for review' })
  await typeInto(page, submit.getByLabel('Reflection'), 'We traced the loop and fixed its bound.')
  await everyInputLabelled(page)
  await press(page, submit.getByRole('button', { name: 'Submit for review' }))
  await expect(submit.getByText("Waiting for your professor's review.")).toBeVisible()

  const professorPage = await pageFor(browser, setup.professor)
  await professorPage.goto(`/classrooms/${setup.classroom.id}/review`)
  await press(
    professorPage,
    itemWith(professorPage, 'Team Loop').getByRole('button', { name: 'Review' }),
  )
  await press(professorPage, professorPage.getByRole('button', { name: 'Approve group project' }))
  await expect(professorPage.getByText(/^Approved .+'s project\.$/)).toBeVisible()
})
