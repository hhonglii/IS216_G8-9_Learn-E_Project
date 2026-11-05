// Product tests for H5 Step 1.
// No page scrolls sideways at a phone or tablet width, with long names and a
// code line far wider than the screen. Long code scrolls inside its own box.
import { test, expect } from './helpers/test.js'
import { apiAs, register } from './helpers/api.js'
import {
  FAKE_REPOSITORY,
  askForHelp,
  groupWithEvidence,
  miniProjectIn,
  pageFor,
  studentIn,
} from './helpers/setup.js'

const longLine = `const total = items.filter((item) => item.inStock).map((item) => item.price * item.quantity).reduce((sum, value) => sum + value, 0) // ${'x'.repeat(80)}`

test('pages fit a phone and a tablet without sideways scrolling', async ({ browser, request }) => {
  const professor = await register(request, 'professor', 'Professor Annabelle Tan-Wijaya')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: 'Introduction to debugging loops, arrays and off-by-one errors',
  })
  const draft = await apiAs(request, professor, 'POST', `/classrooms/${classroom.id}/challenges`, {
    title: 'A challenge with a really quite long title to test wrapping on a phone',
    language: 'JavaScript',
    objective: 'Trace a loop that stops one step early.',
    prompt: 'The loop should add every number from 1 to 3.',
    codeSnippet: `let total = 0\n${longLine}\nfor (let i = 1; i < 3; i++) total += i`,
    explanation: 'The condition i < 3 skips 3.',
    questions: [
      {
        type: 'predict-output',
        prompt: 'What does this print?',
        options: [
          { id: 'a', label: '3' },
          { id: 'b', label: '6' },
        ],
        acceptedAnswer: 'a',
        explanation: '1 + 2 is 3.',
      },
      {
        type: 'repair-order',
        prompt: 'Put the repair steps in order.',
        options: [
          { id: 'r2', label: 'Change < to <=' },
          { id: 'r1', label: 'Reproduce the wrong total with a three-item cart first' },
        ],
        acceptedAnswer: ['r1', 'r2'],
        explanation: 'Reproduce, then fix.',
      },
    ],
    appliedCase: { prompt: 'A cart total leaves out the last item. Explain why.' },
    progressiveHints: ['Read the loop condition.', 'Which value of i never runs?'],
  })
  const challenge = await apiAs(request, professor, 'POST', `/challenges/${draft.id}/publish`)
  const student = await studentIn(request, classroom, 'Maximilian Oyelaran-Featherstonehaugh')
  await askForHelp(request, { challenge }, student)
  const miniProject = await miniProjectIn(request, professor, classroom)
  const group = await groupWithEvidence(request, { miniProject }, student, 'Team with a long name')
  await apiAs(request, student, 'PUT', `/groups/${group.id}/repository`, {
    repositoryUrl: FAKE_REPOSITORY,
  })

  const studentPage = await pageFor(browser, student)
  const professorPage = await pageFor(browser, professor)
  const visits = [
    [studentPage, '/'],
    [studentPage, `/classrooms/${classroom.id}`],
    [studentPage, `/challenges/${challenge.id}`],
    [studentPage, `/classrooms/${classroom.id}/help`],
    [studentPage, `/mini-projects/${miniProject.id}`],
    [studentPage, `/profiles/${student.id}`],
    [professorPage, `/classrooms/${classroom.id}`],
    [professorPage, `/classrooms/${classroom.id}/review`],
  ]
  for (const width of [375, 768]) {
    for (const [page, path] of visits) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      await expect(page.locator('main h1, main h2').first()).toBeVisible()
      const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        screen: document.documentElement.clientWidth,
      }))
      expect(widths.page, `${path} at ${width}px`).toBeLessThanOrEqual(widths.screen)
    }
  }
})
