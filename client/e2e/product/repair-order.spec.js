// Product test for H3 Step 3.
// The repair-order question against the real server: the steps are put in order
// with the Move buttons alone, and the server marks the order it receives.
import { test, expect } from './helpers/test.js'
import { classroomWithChallenge, pageFor, studentIn } from './helpers/setup.js'

// Stored with the fix first, so the order a student sees at the start is wrong.
const repairOrder = {
  type: 'repair-order',
  prompt: 'Put the repair steps in order.',
  options: [
    { id: 'fix', label: 'Change < to <=' },
    { id: 'find', label: 'Find the loop condition' },
    { id: 'rerun', label: 'Run it again and check the total' },
  ],
  acceptedAnswer: ['find', 'fix', 'rerun'],
  explanation: 'Find the fault before changing it, then check the fix.',
}

async function openChallenge(browser, request) {
  const setup = await classroomWithChallenge(request, [repairOrder])
  const student = await studentIn(request, setup.classroom, 'Ana Cruz')
  const page = await pageFor(browser, student)
  await page.goto(`/challenges/${setup.challenge.id}`)
  return page
}

const steps = (page) => page.getByRole('group', { name: repairOrder.prompt }).getByRole('listitem')

test('an untouched repair order still submits every step', async ({ browser, request }) => {
  const page = await openChallenge(browser, request)
  await page.getByRole('button', { name: 'Submit answer' }).click()
  // Marked wrong rather than rejected: the server received all three steps.
  await expect(page.getByText('Incorrect answer. Please try again.')).toBeVisible()
})

test('a student orders the repair steps with the keyboard alone', async ({ browser, request }) => {
  const page = await openChallenge(browser, request)
  await expect(steps(page)).toHaveText([/^Change < to <=/, /^Find the loop/, /^Run it again/])

  const findStep = steps(page).filter({ hasText: 'Find the loop condition' })
  const moveUp = findStep.getByRole('button', { name: /^Move up/ })
  await moveUp.focus()
  await page.keyboard.press('Enter')
  await expect(steps(page)).toHaveText([/^Find the loop/, /^Change < to <=/, /^Run it again/])
  await expect(moveUp).toBeDisabled()

  await page.getByRole('button', { name: 'Submit answer' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Correct answer!')).toBeVisible()
})

// H5 Step 2: the button just pressed keeps focus, even when its step reaches an end,
// so the next Tab goes on from there instead of from the top of the page.
test('the Move button just pressed keeps focus, at either end too', async ({
  browser,
  request,
}) => {
  const page = await openChallenge(browser, request)
  const step = (label) => steps(page).filter({ hasText: label })

  const moveDown = step('Change < to <=').getByRole('button', { name: /^Move down/ })
  await moveDown.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(steps(page)).toHaveText([/^Find the loop/, /^Run it again/, /^Change < to <=/])
  await expect(moveDown).toBeFocused()
  await expect(moveDown).toBeDisabled()
  // Pressing it again at the bottom changes nothing and keeps focus.
  await page.keyboard.press('Enter')
  await expect(steps(page)).toHaveText([/^Find the loop/, /^Run it again/, /^Change < to <=/])
  await expect(moveDown).toBeFocused()

  const moveUp = step('Change < to <=').getByRole('button', { name: /^Move up/ })
  await moveUp.focus()
  await page.keyboard.press('Enter')
  await expect(steps(page)).toHaveText([/^Find the loop/, /^Change < to <=/, /^Run it again/])
  await expect(moveUp).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(steps(page)).toHaveText([/^Change < to <=/, /^Find the loop/, /^Run it again/])
  await expect(moveUp).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(step('Change < to <=').getByRole('button', { name: /^Move down/ })).toBeFocused()
})
