// Classroom Games against the real server and an in-memory MongoDB (decision H-5).
// This is where the unique indexes and conditional saves meet a real database,
// which the mocked server tests cannot prove.
import { test, expect } from './helpers/test.js'
import { API, apiAs, register, uniqueName } from './helpers/api.js'
import { pageFor, studentIn } from './helpers/setup.js'

// Typed into the editor one question at a time, the way a professor builds a battle.
const QUESTIONS = [
  {
    code: 'print(2 ** 3)',
    prompt: 'What does this print?',
    answers: ['6', '8', '9'],
    correct: 2,
    why: '** means "to the power of".',
  },
  {
    prompt: 'Which keyword starts a loop in Python?',
    answers: ['for', 'loop'],
    correct: 1,
    why: 'Python loops start with for or while.',
  },
  {
    prompt: 'What is len("abc")?',
    answers: ['2', '3'],
    correct: 2,
    why: 'There are three characters.',
  },
]

async function writeQuestion(page, index, { code, prompt, answers, correct, why }) {
  const card = page.locator('fieldset[id^="game-question-"]').nth(index)
  if (code) await card.getByLabel('Code (optional)', { exact: true }).fill(code)
  await card.getByLabel('Question', { exact: true }).fill(prompt)
  for (const [row, text] of answers.entries())
    await card.getByRole('textbox', { name: `Answer ${row + 1}`, exact: true }).fill(text)
  await card.getByRole('radio', { name: `Answer ${correct} is correct` }).check()
  await card.getByLabel('Why? (shown after a right answer)', { exact: true }).fill(why)
}

async function emptyClassroom(request) {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: uniqueName('Games class'),
  })
  return { professor, classroom }
}

const option = (id, label) => ({ id, label })
const simpleQuestions = () =>
  [1, 2, 3].map((n) => ({
    id: `q${n}`,
    prompt: `Q${n}?`,
    options: [option(`q${n}a`, `Right ${n}`), option(`q${n}b`, `Wrong ${n}`)],
    correctOptionId: `q${n}a`,
    explanation: `Reason ${n}.`,
  }))

const nav = (page) => page.locator('.app-sidebar')
const answer = (page, name) => page.getByRole('button', { name, exact: true }).click()

test('the classroom page links to the battle and each person sees their own screen', async ({
  browser,
  request,
}) => {
  const { professor, classroom } = await emptyClassroom(request)
  const student = await studentIn(request, classroom, 'Ana Cruz')

  const studentPage = await pageFor(browser, student)
  await studentPage.goto(`/classrooms/${classroom.id}`)
  // The battle has no sidebar link (G10). The classroom page links to it once one is up.
  await expect(nav(studentPage).locator('[aria-labelledby="nav-group-classroom"] a')).toHaveText([
    'Classroom',
    'Help queue',
  ])
  await expect(studentPage.getByRole('heading', { name: classroom.name })).toBeVisible()
  await expect(studentPage.getByRole('link', { name: 'Play the Boss Battle' })).toHaveCount(0)
  await studentPage.goto(`/classrooms/${classroom.id}/games`)
  await expect(studentPage.getByRole('heading', { name: 'Classroom games' })).toBeVisible()
  await expect(studentPage.getByText('No Boss Battle right now')).toBeVisible()
  await expect(studentPage.getByLabel('Battle title', { exact: true })).toHaveCount(0)

  const professorPage = await pageFor(browser, professor)
  await professorPage.goto(`/classrooms/${classroom.id}`)
  // The Boss Battle section always shows for the professor, offering Create until a battle exists.
  await expect(professorPage.getByText('No Boss Battle yet.')).toBeVisible()
  await professorPage.getByRole('link', { name: 'Create Boss Battle' }).click()
  await expect(professorPage).toHaveURL(`/classrooms/${classroom.id}/games`)
  await expect(professorPage.getByLabel('Battle title', { exact: true })).toBeVisible()
  await expect(professorPage.getByText('No Boss Battle right now')).toHaveCount(0)
})

test('a professor builds and publishes a battle, and a student defeats the boss', async ({
  browser,
  request,
}) => {
  const { professor, classroom } = await emptyClassroom(request)
  const student = await studentIn(request, classroom, 'Ana Cruz')
  const address = `/classrooms/${classroom.id}/games`

  const prof = await pageFor(browser, professor)
  await prof.goto(address)
  await prof.getByLabel('Battle title', { exact: true }).fill('Week 3: Basics')
  await prof.getByLabel('Hearts', { exact: true }).selectOption('2')
  await prof.getByText('The Race Condition', { exact: true }).click()
  await expect(prof.locator('.game-setup-preview')).toContainText('The Race Condition')

  // Every field explains itself with an (i) button.
  await prof.getByRole('button', { name: 'About Hearts' }).click()
  await expect(prof.getByText('Each wrong answer costs one heart')).toBeVisible()
  await expect(prof.getByRole('button', { name: 'Paste questions' })).toHaveCount(0)

  for (const [index, question] of QUESTIONS.entries()) {
    await prof.getByRole('button', { name: index ? 'Add next question' : 'Add question' }).click()
    await writeQuestion(prof, index, question)
  }
  // The note under the add buttons links to the newest question's box.
  await expect(prof.getByText('Question 3 added.')).toBeVisible()
  await prof.getByRole('link', { name: 'Go to question 3' }).click()
  await expect(
    prof.locator('fieldset[id^="game-question-"]').nth(2).getByLabel('Question', { exact: true }),
  ).toBeFocused()
  await expect(prof.getByText('Everything is ready')).toBeVisible()

  // A draft is hidden from students, and it survives a reload through autosave.
  await expect(prof.getByText('All changes saved')).toBeVisible()
  await prof.reload()
  await expect(prof.getByLabel('Battle title', { exact: true })).toHaveValue('Week 3: Basics')
  await expect(prof.locator('fieldset[id^="game-question-"]')).toHaveCount(3)

  const page = await pageFor(browser, student)
  await page.goto(address)
  await expect(page.getByText('No Boss Battle right now')).toBeVisible()

  // The preview marks answers and records nothing.
  await prof.getByRole('button', { name: 'Preview the battle' }).click()
  await prof.getByRole('button', { name: 'Start battle' }).click()
  await expect(prof.getByRole('heading', { name: 'What does this print?' })).toBeVisible()
  // Back to editing is a link to the Preview button, so the keyboard returns there.
  await prof.getByRole('link', { name: 'Back to editing' }).click()
  await expect(prof.getByRole('button', { name: 'Preview the battle' })).toBeFocused()

  prof.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await prof.getByRole('button', { name: 'Publish to class' }).click()
  await expect(prof.getByText('Students can play this battle now')).toBeVisible()
  await expect(prof.getByLabel('Battle title', { exact: true })).toBeDisabled()
  await expect(prof.getByText('No students have played this version yet.')).toBeVisible()

  // Once published, the student reaches the battle from the classroom page's
  // Boss Battle section, which shows the professor's monster.
  await page.goto(`/classrooms/${classroom.id}`)
  const bossSection = page.getByRole('region', { name: 'Boss Battle' })
  await expect(bossSection.getByRole('img')).toBeVisible()
  await bossSection.getByRole('link', { name: 'Play the Boss Battle' }).click()
  await expect(page).toHaveURL(address)
  // The student makes one mistake, reloads to try to get the heart back, and wins.
  await expect(page.getByRole('heading', { name: 'Week 3: Basics' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'The Race Condition' })).toBeVisible()
  await page.getByRole('button', { name: 'Start battle' }).click()
  await expect(page.locator('pre')).toHaveText('print(2 ** 3)')
  await answer(page, '6')
  // The hidden status line repeats the result for screen readers, so look in the panel.
  const feedback = page.locator('.battle-feedback')
  await expect(feedback.getByText('This question will come back.')).toBeVisible()
  // No Why? after a wrong answer, since that would give the answer away (G8).
  await expect(feedback.getByText('** means "to the power of".')).toHaveCount(0)
  await expect(page.getByRole('img', { name: '1 of 2 hearts left' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('img', { name: '1 of 2 hearts left' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Which keyword starts a loop' })).toBeVisible()
  await answer(page, 'for')
  await expect(feedback.getByText('Python loops start with for or while.')).toBeVisible()
  // Continue is a link to the next question's heading, which takes the focus.
  await page.getByRole('link', { name: 'Continue' }).click()
  await expect(page.locator('#battle-question')).toBeFocused()
  await answer(page, '3')
  await page.getByRole('link', { name: 'Continue' }).click()
  // The missed question comes back last.
  await expect(page.getByRole('heading', { name: 'What does this print?' })).toBeVisible()
  await answer(page, '8')
  await page.getByRole('link', { name: 'See how it ended' }).click()
  await expect(page.locator('#boss-battle')).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Boss defeated!' })).toBeVisible()
  await expect(page.locator('.battle-card').getByText('with 1 of 2 hearts left')).toBeVisible()
  await expect(page.getByText('What to review')).toBeVisible()
  // The missed question's Why? waits for the review.
  await expect(page.getByText('** means "to the power of".')).toBeVisible()

  await page.reload()
  await expect(page.getByText('You have defeated this boss')).toBeVisible()

  await prof.reload()
  await expect(prof.getByText('1 student has played, and 1 defeated the boss.')).toBeVisible()
  await expect(prof.getByText('0% correct on the first try (0 of 1).')).toBeVisible()
  await expect(prof.getByText('Most common wrong answer: "6" (1).')).toBeVisible()
  // The Students table names who played, from the real class list (G11).
  await expect(prof.getByRole('row', { name: 'Ana Cruz 1 Beat the boss' })).toBeVisible()
})

test('running out of hearts ends the run, and a retry starts fresh', async ({
  browser,
  request,
}) => {
  const { professor, classroom } = await emptyClassroom(request)
  const student = await studentIn(request, classroom, 'Ben Ong')
  const game = `/classrooms/${classroom.id}/game`
  await apiAs(request, professor, 'PUT', game, {
    title: 'One heart',
    bossId: 'null-slime',
    hearts: 1,
    questions: simpleQuestions(),
  })
  await apiAs(request, professor, 'POST', `${game}/publish`, {})

  const page = await pageFor(browser, student)
  await page.goto(`/classrooms/${classroom.id}/games`)
  await page.getByRole('button', { name: 'Start battle' }).click()
  await answer(page, 'Wrong 1')
  await page.getByRole('link', { name: 'See how it ended' }).click()
  await expect(page.getByRole('heading', { name: 'You ran out of hearts' })).toBeVisible()
  await expect(page.getByText('Right 1')).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('img', { name: '1 of 1 hearts left' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Q1?' })).toBeVisible()
})

test('the database keeps one game per classroom and one run in progress', async ({ request }) => {
  const { professor, classroom } = await emptyClassroom(request)
  const student = await studentIn(request, classroom, 'Chen Wei')
  const game = `/classrooms/${classroom.id}/game`
  const put = (title) =>
    request.put(`${API}${game}`, {
      data: { title },
      headers: { authorization: `Bearer ${professor.token}` },
    })
  // Two first saves at once: one creates, and the other updates or reports a conflict.
  const saves = await Promise.all([put('A'), put('B')])
  for (const reply of saves) expect([200, 201, 409]).toContain(reply.status())
  expect(saves.filter((reply) => reply.status() === 201)).toHaveLength(1)

  await apiAs(request, professor, 'PUT', game, {
    title: 'Races',
    hearts: 3,
    questions: simpleQuestions(),
  })
  await apiAs(request, professor, 'POST', `${game}/publish`, {})

  const start = () =>
    request.post(`${API}${game}/plays`, {
      data: {},
      headers: { authorization: `Bearer ${student.token}` },
    })
  const starts = await Promise.all([start(), start(), start()])
  const runs = await Promise.all(starts.map((reply) => reply.json()))
  expect(new Set(runs.map((run) => run.data.play.id)).size).toBe(1)

  // A double click on a wrong answer costs at most one heart.
  const { id } = runs[0].data.play
  const send = () =>
    request.post(`${API}/game-plays/${id}/answers`, {
      data: { questionId: 'q1', optionId: 'q1b' },
      headers: { authorization: `Bearer ${student.token}` },
    })
  const answers = await Promise.all([send(), send()])
  expect(answers.filter((reply) => reply.status() === 200)).toHaveLength(1)
  expect(answers.filter((reply) => reply.status() === 409)).toHaveLength(1)
  const after = await apiAs(request, student, 'POST', `${game}/plays`, {})
  expect(after.play.heartsLeft).toBe(2)
})

test('an old tab resending a missed last question costs no extra heart', async ({ request }) => {
  const { professor, classroom } = await emptyClassroom(request)
  const student = await studentIn(request, classroom, 'Mei Lin')
  const game = `/classrooms/${classroom.id}/game`
  await apiAs(request, professor, 'PUT', game, {
    title: 'Old tabs',
    hearts: 3,
    questions: simpleQuestions(),
  })
  await apiAs(request, professor, 'POST', `${game}/publish`, {})
  let { play } = await apiAs(request, student, 'POST', `${game}/plays`, {})
  const send = (optionId, answerCount) =>
    request.post(`${API}/game-plays/${play.id}/answers`, {
      data: { questionId: play.currentQuestion.id, optionId, answerCount },
      headers: { authorization: `Bearer ${student.token}` },
    })
  for (const n of [1, 2]) {
    const reply = await send(`q${n}a`, play.answerCount)
    play = (await reply.json()).data.play
  }
  // The missed question comes straight back, so only the count shows the tab is old.
  expect((await send('q3b', 2)).status()).toBe(200)
  expect((await send('q3b', 2)).status()).toBe(409)
  const after = await apiAs(request, student, 'POST', `${game}/plays`, {})
  expect(after.play.heartsLeft).toBe(2)
})

test('unpublishing mid-battle sends the student to the empty screen', async ({
  browser,
  request,
}) => {
  const { professor, classroom } = await emptyClassroom(request)
  const student = await studentIn(request, classroom, 'Dev Rao')
  const game = `/classrooms/${classroom.id}/game`
  await apiAs(request, professor, 'PUT', game, {
    title: 'Soon gone',
    hearts: 3,
    questions: simpleQuestions(),
  })
  await apiAs(request, professor, 'POST', `${game}/publish`, {})

  const page = await pageFor(browser, student)
  await page.goto(`/classrooms/${classroom.id}/games`)
  await page.getByRole('button', { name: 'Start battle' }).click()
  await expect(page.getByRole('heading', { name: 'Q1?' })).toBeVisible()
  await apiAs(request, professor, 'POST', `${game}/unpublish`, {})
  await answer(page, 'Right 1')
  await expect(page.getByText('No Boss Battle right now')).toBeVisible()
  await expect(page.getByText('has been reloaded')).toBeVisible()
})

test('the editor and the battle fit a phone with no sideways scrolling', async ({
  browser,
  request,
}) => {
  const { professor, classroom } = await emptyClassroom(request)
  const student = await studentIn(request, classroom, 'Eli Goh')
  const game = `/classrooms/${classroom.id}/game`
  const longCode = `const message = "${'a very long line of code '.repeat(8)}";`
  await apiAs(request, professor, 'PUT', game, {
    title: 'Phone check',
    bossId: 'syntax-spider',
    hearts: 10,
    questions: [1, 2, 3].map((n) => ({
      id: `q${n}`,
      code: longCode,
      prompt: `Q${n} ${'wordy '.repeat(30)}`,
      options: [option(`q${n}a`, 'Yes '.repeat(40)), option(`q${n}b`, 'No')],
      correctOptionId: `q${n}a`,
      explanation: 'Because.',
    })),
  })
  const fits = (page) =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

  const prof = await pageFor(browser, professor)
  await prof.setViewportSize({ width: 320, height: 700 })
  await prof.goto(`/classrooms/${classroom.id}/games`)
  await expect(prof.getByLabel('Battle title', { exact: true })).toBeVisible()
  expect(await fits(prof)).toBe(true)

  await apiAs(request, professor, 'POST', `${game}/publish`, {})
  const page = await pageFor(browser, student)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(`/classrooms/${classroom.id}/games`)
  await expect(page.getByRole('button', { name: 'Start battle' })).toBeVisible()
  expect(await fits(page)).toBe(true)
  await page.getByRole('button', { name: 'Start battle' }).click()
  await expect(page.locator('pre')).toBeVisible()
  expect(await fits(page)).toBe(true)
})
