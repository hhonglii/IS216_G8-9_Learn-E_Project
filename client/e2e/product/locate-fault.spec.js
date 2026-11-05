// Product tests for locate-fault choices and the "View code snippet" link,
// against the real server: a professor adds line and category choices to a draft
// and publishes it, then a student answers with the two dropdowns.
import { test, expect } from './helpers/test.js'
import { apiAs, register, uniqueName } from './helpers/api.js'
import { pageFor, studentIn } from './helpers/setup.js'

const prompt = 'Which line contains the fault, and what kind of error is it?'
const codeSnippet = [
  'def average(scores):',
  '    total = 0',
  '    for i in range(1, len(scores)):',
  '        total += scores[i]',
  '    return total / len(scores)',
].join('\n')

// A draft whose only block is a locate-fault question with no choices yet.
async function draftWithEmptyLocateBlock(request) {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: `Faults ${uniqueName('class')}`,
  })
  const title = `Average ${uniqueName('ch')}`
  const draft = await apiAs(request, professor, 'POST', `/classrooms/${classroom.id}/challenges`, {
    title,
    language: 'Python',
    objective: 'Spot an off-by-one error in a range.',
    prompt: 'average([4, 8, 6]) should be 6.0. Read the code, then answer.',
    codeSnippet,
    explanation: 'range(1, len(scores)) skips index 0.',
    questions: [{ type: 'locate-fault', prompt, explanation: 'Line 3 starts the range at 1.' }],
    appliedCase: { prompt: 'Where else could this mistake hide?' },
    progressiveHints: ['List every value of i.', 'Which index never appears?'],
  })
  return { professor, classroom, title, challengeId: draft.id }
}

test('a professor gives a locate-fault question line and category choices', async ({
  browser,
  request,
}) => {
  const setup = await draftWithEmptyLocateBlock(request)
  const page = await pageFor(browser, setup.professor)
  await page.goto(`/classrooms/${setup.classroom.id}`)
  await page.getByRole('button', { name: `Open draft: ${setup.title}`, exact: true }).click()
  const editor = page.getByRole('region', { name: 'Edit draft', exact: true })
  const block = editor.locator('[data-block-id]').first()

  await block.getByLabel('Line choice 1', { exact: true }).fill('line 3')
  await block.getByLabel('Line choice 2', { exact: true }).fill('line 4')
  await block.getByLabel('Error category 1', { exact: true }).fill('off-by-one')
  await block.getByLabel('Error category 2', { exact: true }).fill('wrong operator')
  await block.getByLabel('Accepted line', { exact: true }).selectOption({ label: 'line 3' })
  await block
    .getByLabel('Accepted error category', { exact: true })
    .selectOption({ label: 'off-by-one' })
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await editor.getByRole('button', { name: 'Publish challenge', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Published challenge', exact: true }),
  ).toContainText('Challenge published.')

  const stored = await apiAs(request, setup.professor, 'GET', `/challenges/${setup.challengeId}`)
  expect(stored.questions[0].options).toEqual([
    { id: 'line-1', label: 'line 3' },
    { id: 'line-2', label: 'line 4' },
    { id: 'category-1', label: 'off-by-one' },
    { id: 'category-2', label: 'wrong operator' },
  ])
  expect(stored.questions[0].acceptedAnswer).toEqual({
    location: 'line-1',
    category: 'category-1',
  })
})

test('a student picks a line and a category, and both must be right', async ({
  browser,
  request,
}) => {
  const setup = await draftWithEmptyLocateBlock(request)
  await apiAs(request, setup.professor, 'PUT', `/challenges/${setup.challengeId}`, {
    questions: [
      {
        type: 'locate-fault',
        prompt,
        explanation: 'Line 3 starts the range at 1.',
        options: [
          { id: 'line-1', label: 'line 3' },
          { id: 'line-2', label: 'line 4' },
          { id: 'category-1', label: 'off-by-one' },
          { id: 'category-2', label: 'wrong operator' },
        ],
        acceptedAnswer: { location: 'line-1', category: 'category-1' },
      },
    ],
  })
  await apiAs(request, setup.professor, 'POST', `/challenges/${setup.challengeId}/publish`)
  const student = await studentIn(request, setup.classroom, 'Ana Cruz')
  const page = await pageFor(browser, student)
  await page.goto(`/challenges/${setup.challengeId}`)

  const question = page.getByRole('group', { name: prompt })
  await expect(question.getByLabel('Line or region').locator('option')).toHaveText([
    'Select a line',
    'line 3',
    'line 4',
  ])
  await question.getByLabel('Line or region').selectOption({ label: 'line 3' })
  await question.getByLabel('Error category').selectOption({ label: 'wrong operator' })
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByText('Incorrect answer. Please try again.')).toBeVisible()

  await question.getByLabel('Error category').selectOption({ label: 'off-by-one' })
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByText('Correct answer!')).toBeVisible()
})

test('the question jumps back to the one copy of the code', async ({ browser, request }) => {
  const setup = await draftWithEmptyLocateBlock(request)
  await apiAs(request, setup.professor, 'PUT', `/challenges/${setup.challengeId}`, {
    questions: [
      {
        type: 'locate-fault',
        prompt,
        explanation: 'Line 3 starts the range at 1.',
        options: [
          { id: 'line-1', label: 'line 3' },
          { id: 'line-2', label: 'line 4' },
          { id: 'category-1', label: 'off-by-one' },
          { id: 'category-2', label: 'wrong operator' },
        ],
        acceptedAnswer: { location: 'line-1', category: 'category-1' },
      },
    ],
  })
  await apiAs(request, setup.professor, 'POST', `/challenges/${setup.challengeId}/publish`)
  const student = await studentIn(request, setup.classroom, 'Ana Cruz')
  const page = await pageFor(browser, student)
  // Short enough that the snippet scrolls out of view while answering.
  await page.setViewportSize({ width: 1280, height: 500 })
  await page.goto(`/challenges/${setup.challengeId}`)

  await expect(page.locator('pre')).toHaveCount(1)
  const code = page.getByRole('region', { name: 'Code snippet' })
  const jump = page.getByRole('link', { name: 'View code snippet for question 1' })
  await jump.scrollIntoViewIfNeeded()
  await expect(code).not.toBeInViewport()
  await jump.focus()
  await page.keyboard.press('Enter')
  await expect(code).toBeInViewport()
  await expect(code).toBeFocused()
})
