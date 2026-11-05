// Browser checks with mocked API data.
import { test, expect } from '@playwright/test'
import { expectSentBy, failEveryLoad, logInAs, user } from './helpers/session.js'

const ownerId = '507f1f77bcf86cd799439001'
const studentId = '507f1f77bcf86cd799439002'
const classroomId = '507f1f77bcf86cd799439003'
const draftId = '507f1f77bcf86cd799439004'
const publishedId = '507f1f77bcf86cd799439005'

// Since G16 the person logs in first, and any request a test does not answer
// fails with 500: the real server with no database would answer 401 and end the
// session. The catch-all is registered before each test body, so every route a
// test adds, before or after prepare(), takes priority over it.
test.beforeEach(async ({ page }) => {
  await failEveryLoad(page)
})

async function prepare(page, userId, challenges) {
  await logInAs(
    page,
    user(
      userId,
      userId === ownerId ? 'Professor Lee' : 'Alice',
      userId === ownerId ? 'professor' : 'student',
    ),
  )
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        data: { service: 'learn-e-server', status: 'ok', database: 'connected' },
      },
    }),
  )
  await page.route(`**/api/classrooms/${classroomId}`, (route) => {
    expectSentBy(route, userId)
    return route.fulfill({
      json: {
        data: {
          id: classroomId,
          name: 'JavaScript debugging',
          description: 'Practise loops and repairs',
          professorId: ownerId,
          ...(userId === ownerId ? { joinCode: 'ABC234' } : {}),
          challenges,
          miniProjects: [],
        },
      },
    })
  })
}

test('owner sees draft/published summaries and opens a saved draft', async ({ page }, testInfo) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await prepare(page, ownerId, [
    { id: draftId, title: 'Loop boundary draft', status: 'draft' },
    { id: publishedId, title: 'Repair the counter', status: 'published' },
  ])
  await page.route(`**/api/challenges/${draftId}`, (route) => {
    expectSentBy(route, ownerId)
    return route.fulfill({
      json: {
        data: {
          id: draftId,
          classroomId,
          title: 'Loop boundary draft',
          status: 'draft',
          objective: 'Find the off-by-one error',
          prompt: 'Which iteration is missing?',
          codeSnippet: 'for (let i = 0; i < 3; i++) {\n  console.log(i);\n}',
          questions: [
            {
              id: '507f1f77bcf86cd799439021',
              type: 'predict-output',
              prompt: 'Which output?',
              options: [],
              acceptedAnswer: '',
              explanation: '',
            },
          ],
        },
      },
    })
  })
  await page.goto(`/classrooms/${classroomId}`)
  const list = page.getByRole('region', { name: 'Challenges', exact: true })
  await expect(list).toContainText('Loop boundary draft')
  await expect(list).toContainText('Repair the counter')
  await expect(list.getByRole('button', { name: /^Open draft:/ })).toHaveCount(1)
  await list.getByRole('button', { name: 'Open draft: Loop boundary draft', exact: true }).click()
  const draft = page.getByRole('region', { name: 'Edit draft', exact: true })
  await expect(draft.getByLabel('Challenge prompt', { exact: true })).toHaveValue(
    'Which iteration is missing?',
  )
  // The editor opens below the list; the link takes the professor there.
  await page.getByRole('link', { name: 'Go to the editor', exact: true }).click()
  await expect(draft).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('owner-challenge-list.png'), fullPage: true })
  await draft.getByRole('button', { name: 'Close draft', exact: true }).click()
  await expect(draft).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('student sees a published link and no draft controls on a narrow screen', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, studentId, [{ id: publishedId, title: 'Repair the counter' }])
  await page.goto(`/classrooms/${classroomId}`)
  const list = page.getByRole('region', { name: 'Challenges', exact: true })
  await expect(list.getByRole('link', { name: 'Repair the counter', exact: true })).toHaveAttribute(
    'href',
    `/challenges/${publishedId}`,
  )
  await expect(list.getByRole('button', { name: /^Open draft:/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Edit draft', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: testInfo.outputPath('student-challenge-list-mobile.png'),
    fullPage: true,
  })
  await list.getByRole('link', { name: 'Repair the counter', exact: true }).click()
  await expect(page).toHaveURL(`/challenges/${publishedId}`)
})

test('owner fixes publication problems, saves changes and publishes a locked challenge', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, ownerId, [{ id: draftId, title: 'Publication draft', status: 'draft' }])
  let saved = {
    id: draftId,
    classroomId,
    title: 'Publication draft',
    status: 'draft',
    questions: [],
  }
  let publishCalls = 0
  let updatePayload
  await page.route(`**/api/challenges/${draftId}`, (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON()
      updatePayload = payload
      saved = {
        ...saved,
        ...payload,
        questions: payload.questions.map((block, index) => ({
          ...block,
          id: '507f1f77bcf86cd799439021',
          order: index,
        })),
      }
    }
    return route.fulfill({ json: { data: saved } })
  })
  await page.route(`**/api/challenges/${draftId}/publish`, (route) => {
    publishCalls++
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({})
    expectSentBy(route, ownerId)
    if (publishCalls === 1)
      return route.fulfill({
        status: 400,
        json: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Challenge is incomplete or invalid for publication.',
            details: [
              { field: 'language', message: 'Non-empty text is required to publish.' },
              {
                field: 'questions',
                message: 'At least one structured block is required to publish.',
              },
            ],
          },
        },
      })
    expect(saved.language).toBe('JavaScript')
    expect(saved.questions[0].options).toHaveLength(2)
    expect(saved.progressiveHints).toHaveLength(2)
    saved = { ...saved, status: 'published' }
    return route.fulfill({ json: { data: saved } })
  })
  await page.goto(`/classrooms/${classroomId}`)
  await page.getByRole('button', { name: 'Open draft: Publication draft', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Edit draft', exact: true })
  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await editor.getByRole('button', { name: 'Publish challenge', exact: true }).click()
  await expect(
    editor.getByRole('list', { name: 'Publication problems', exact: true }),
  ).toContainText('Language')
  await editor.getByLabel('Language', { exact: true }).fill('JavaScript')
  await editor.getByLabel('Learning objective', { exact: true }).fill('Predict loop output')
  await editor.getByLabel('Challenge prompt', { exact: true }).fill('Inspect the loop')
  await editor.getByLabel('Official explanation', { exact: true }).fill('There are two iterations')
  await editor.getByLabel('Applied-case prompt', { exact: true }).fill('Trace a related loop')
  await editor.getByRole('button', { name: 'Add question', exact: true }).click()
  const block = page.locator('[data-block-id]')
  await block.getByLabel('Question prompt', { exact: true }).fill('Predict the output')
  // Lists that need two items start with two rows.
  await block.getByLabel('Option 1', { exact: true }).fill('0, then 1')
  await block.getByLabel('Option 2', { exact: true }).fill('0, then 1, then 2')
  await block.getByLabel('Accepted option', { exact: true }).selectOption('option-1')
  await block
    .getByLabel('Question explanation', { exact: true })
    .fill('The loop stops before index 2')
  await editor.getByLabel('Hint 1', { exact: true }).fill('Trace the loop')
  await editor.getByLabel('Hint 2', { exact: true }).fill('Check the boundary')
  await expect(
    editor.getByRole('button', { name: 'Publish challenge', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(editor).toContainText('Draft saved.')
  expect(updatePayload).not.toHaveProperty('status')
  expect(updatePayload.questions[0]).not.toHaveProperty('id')
  await expect(editor.getByRole('list', { name: 'Publication problems', exact: true })).toHaveCount(
    0,
  )
  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await editor.getByRole('button', { name: 'Publish challenge', exact: true }).click()
  const published = page.getByRole('region', { name: 'Published challenge', exact: true })
  await expect(published).toContainText('Challenge published.')
  await expect(
    published.getByRole('button', { name: 'Close challenge', exact: true }),
  ).toBeVisible()
  await expect(published.getByLabel('Challenge title', { exact: true })).toBeDisabled()
  await expect(published.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Open draft: Publication draft', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Challenges', exact: true })).toContainText(
    'Published',
  )
  expect(publishCalls).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: testInfo.outputPath('published-challenge-mobile.png'),
    fullPage: true,
  })
})

test('owner builds three formats, creates and reloads a draft, and keeps a failed update', async ({
  page,
}, testInfo) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, ownerId, [])
  let saved
  await page.route(`**/api/classrooms/${classroomId}/challenges`, (route) => {
    const payload = route.request().postDataJSON()
    expectSentBy(route, ownerId)
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('classroomId')
    expect(
      payload.questions.every(
        (block) => !Object.hasOwn(block, 'id') && !Object.hasOwn(block, 'order'),
      ),
    ).toBe(true)
    expect(payload.questions.map((block) => block.type)).toEqual([
      'repair-order',
      'predict-output',
      'locate-fault',
    ])
    expect(payload.questions.map((block) => block.acceptedAnswer)).toEqual([
      ['s2', 's1'],
      'option-1',
      { location: 'line-2', category: 'category-1' },
    ])
    saved = {
      ...payload,
      id: draftId,
      classroomId,
      status: 'draft',
      questions: payload.questions.map((block, index) => ({
        ...block,
        id: `507f1f77bcf86cd79943902${index + 1}`,
        order: index,
      })),
    }
    return route.fulfill({ status: 201, json: { data: saved } })
  })
  await page.route(`**/api/challenges/${draftId}`, (route) => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({
        status: 400,
        json: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Draft update failed.',
            details: null,
          },
        },
      })
    }
    return route.fulfill({ json: { data: saved } })
  })
  await page.goto(`/classrooms/${classroomId}`)
  await page.getByRole('button', { name: 'New challenge', exact: true }).click()
  const editor = page.getByRole('region', { name: 'New draft', exact: true })
  await editor.getByLabel('Challenge title', { exact: true }).fill('Three-format draft')
  await editor.getByLabel('Language', { exact: true }).fill('JavaScript')
  await editor.getByLabel('Learning objective', { exact: true }).fill('Trace, locate and repair')
  await editor.getByLabel('Challenge prompt', { exact: true }).fill('Inspect the loop')
  await editor
    .getByLabel('Code snippet (optional)', { exact: true })
    .fill('for (let i = 0; i < 2; i++) console.log(i);')
  await editor
    .getByLabel('Official explanation', { exact: true })
    .fill('The loop misses the final item.')
  await editor
    .getByLabel('Applied-case prompt', { exact: true })
    .fill('Apply the same diagnosis to an array')
  await editor.getByLabel('Hint 1', { exact: true }).fill('Trace the boundary')
  await editor.getByLabel('Hint 2', { exact: true }).fill('Check the final index')
  await editor.getByRole('button', { name: 'Add question', exact: true }).click()
  const predict = page.locator('[data-block-id]').nth(0)
  await predict.getByLabel('Question prompt', { exact: true }).fill('Predict the output')
  await predict.getByLabel('Option 1', { exact: true }).fill('0, then 1')
  await predict.getByLabel('Accepted option', { exact: true }).selectOption('option-1')
  await predict.getByLabel('Question explanation', { exact: true }).fill('Two iterations')
  await editor.getByLabel('New question type', { exact: true }).selectOption('locate-fault')
  await editor.getByRole('button', { name: 'Add question', exact: true }).click()
  const locate = page.locator('[data-block-id]').nth(1)
  await locate.getByLabel('Question prompt', { exact: true }).fill('Locate the fault')
  await locate.getByLabel('Line choice 1', { exact: true }).fill('line 1')
  await locate.getByLabel('Line choice 2', { exact: true }).fill('line 2')
  await locate.getByLabel('Error category 1', { exact: true }).fill('boundary')
  await locate.getByLabel('Error category 2', { exact: true }).fill('syntax')
  await locate.getByLabel('Accepted line', { exact: true }).selectOption('line-2')
  await locate.getByLabel('Accepted error category', { exact: true }).selectOption('category-1')
  await locate.getByLabel('Question explanation', { exact: true }).fill('Wrong upper bound')
  await editor.getByLabel('New question type', { exact: true }).selectOption('repair-order')
  await editor.getByRole('button', { name: 'Add question', exact: true }).click()
  const repairKey = await page.locator('[data-block-id]').nth(2).getAttribute('data-block-id')
  const repair = page.locator(`[data-block-id="${repairKey}"]`)
  await repair.getByLabel('Question prompt', { exact: true }).fill('Order the repairs')
  await repair.getByLabel('Step 1', { exact: true }).fill('Verify')
  await repair.getByLabel('Step 2', { exact: true }).fill('Fix the boundary')
  await repair.getByLabel('Add a step to correct order', { exact: true }).selectOption('s2')
  await repair.getByLabel('Add a step to correct order', { exact: true }).selectOption('s1')
  await repair.getByLabel('Question explanation', { exact: true }).fill('Fix, then verify')
  await repair.getByRole('button', { name: 'Move question 3 up', exact: true }).click()
  await repair.getByRole('button', { name: 'Move question 2 up', exact: true }).click()
  await expect(
    page.locator('[data-block-id]').nth(0).getByLabel('Question prompt', { exact: true }),
  ).toHaveValue('Order the repairs')
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click()
  const savedEditor = page.getByRole('region', { name: 'Edit draft', exact: true })
  await expect(savedEditor).toContainText('Draft saved.')
  await expect(page.locator('[data-block-id]').nth(0)).toHaveAttribute(
    'data-block-id',
    '507f1f77bcf86cd799439021',
  )
  await savedEditor.getByRole('button', { name: 'Close draft', exact: true }).click()
  await page.getByRole('button', { name: 'Open draft: Three-format draft', exact: true }).click()
  await expect(
    page.locator('[data-block-id]').nth(0).getByLabel('Question prompt', { exact: true }),
  ).toHaveValue('Order the repairs')
  await savedEditor.getByLabel('Challenge title', { exact: true }).fill('Unsaved title')
  await savedEditor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(savedEditor.getByRole('alert')).toContainText(
    'Check the draft content, then click Save changes again',
  )
  await expect(savedEditor.getByLabel('Challenge title', { exact: true })).toHaveValue(
    'Unsaved title',
  )
  await expect(savedEditor.getByTestId('last-saved-title')).toContainText('Three-format draft')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: testInfo.outputPath('challenge-editor-mobile.png'),
    fullPage: true,
  })
  expect(pageErrors).toEqual([])
})

async function prepareHintDraft(page) {
  await prepare(page, ownerId, [{ id: draftId, title: 'Hint draft', status: 'draft' }])
  let saved = {
    id: draftId,
    classroomId,
    title: 'Hint draft',
    status: 'draft',
    language: 'JavaScript',
    objective: 'Trace a loop',
    prompt: 'Inspect the boundary',
    codeSnippet: 'for (let i = 0; i < 2; i++) console.log(i);',
    questions: [],
    progressiveHints: ['Existing hint'],
  }
  const updates = []
  await page.route(`**/api/challenges/${draftId}`, (route) => {
    expectSentBy(route, ownerId)
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON()
      updates.push(payload)
      saved = { ...saved, ...payload }
    }
    return route.fulfill({ json: { data: saved } })
  })
  await page.goto(`/classrooms/${classroomId}`)
  await page.getByRole('button', { name: 'Open draft: Hint draft', exact: true }).click()
  return {
    editor: page.getByRole('region', { name: 'Edit draft', exact: true }),
    panel: page.getByRole('region', { name: 'Hint suggestions', exact: true }),
    updates,
  }
}

test('owner edits and copies suggestions, saves explicitly and reloads chosen hints', async ({
  page,
}, testInfo) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(`**/api/challenges/${draftId}/hint-drafts`, (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({})
    expectSentBy(route, ownerId)
    return route.fulfill({
      json: { data: { hints: ['Trace each iteration', 'Inspect the upper bound'] } },
    })
  })
  const { editor, panel, updates } = await prepareHintDraft(page)
  await expect(panel).toContainText('last saved draft text is sent to Google Gemini')
  await editor.getByLabel('Hint 1', { exact: true }).fill('My typed hint')
  await panel.getByRole('button', { name: 'Suggest hints', exact: true }).click()
  await expect(panel.getByLabel('Hint suggestion 1', { exact: true })).toHaveValue(
    'Trace each iteration',
  )
  await expect(editor.getByLabel('Hint 1', { exact: true })).toHaveValue('My typed hint')
  expect(updates).toHaveLength(0)
  await panel.getByLabel('Hint suggestion 1', { exact: true }).fill('Trace from the first index')
  await panel.getByRole('button', { name: 'Use suggestion 1', exact: true }).click()
  await expect(editor.getByLabel('Hint 2', { exact: true })).toHaveValue(
    'Trace from the first index',
  )
  await expect(editor.getByLabel('Hint 3', { exact: true })).toHaveCount(0)
  expect(updates).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: testInfo.outputPath('hint-suggestions-mobile.png'),
    fullPage: true,
  })
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(editor).toContainText('Draft saved.')
  expect(updates).toHaveLength(1)
  expect(updates[0].progressiveHints).toEqual(['My typed hint', 'Trace from the first index'])
  expect(updates[0]).not.toHaveProperty('suggestedHints')
  await expect(panel.getByLabel('Hint suggestion 1', { exact: true })).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Open draft: Hint draft', exact: true }).click()
  await expect(editor.getByLabel('Hint 1', { exact: true })).toHaveValue('My typed hint')
  await expect(editor.getByLabel('Hint 2', { exact: true })).toHaveValue(
    'Trace from the first index',
  )
  await expect(panel.getByLabel('Hint suggestion 1', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('unconfigured suggestions preserve typing and leave the builder usable for retry', async ({
  page,
}, testInfo) => {
  let calls = 0
  await page.route(`**/api/challenges/${draftId}/hint-drafts`, (route) => {
    calls++
    if (calls === 1)
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'HINT_DRAFTS_UNAVAILABLE',
            message: 'Hint suggestions are not set up.',
            details: null,
          },
        },
      })
    return route.fulfill({ json: { data: { hints: ['Trace the loop', 'Check its boundary'] } } })
  })
  const { editor, panel, updates } = await prepareHintDraft(page)
  await editor.getByLabel('Hint 1', { exact: true }).fill('Keep my typed hint')
  await editor.getByLabel('Challenge prompt', { exact: true }).fill('Keep my typed prompt')
  await panel.getByRole('button', { name: 'Suggest hints', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText('Hint suggestions are not set up.')
  await expect(editor.getByLabel('Hint 1', { exact: true })).toHaveValue('Keep my typed hint')
  await expect(editor.getByLabel('Challenge prompt', { exact: true })).toHaveValue(
    'Keep my typed prompt',
  )
  await expect(editor.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled()
  await expect(editor.getByRole('button', { name: 'Add question', exact: true })).toBeEnabled()
  expect(updates).toHaveLength(0)
  await page.screenshot({
    path: testInfo.outputPath('hint-suggestions-unconfigured.png'),
    fullPage: true,
  })
  await panel.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(panel.getByLabel('Hint suggestion 1', { exact: true })).toHaveValue('Trace the loop')
  await expect(panel.getByRole('alert')).toHaveCount(0)
  expect(calls).toBe(2)
  await expect(editor.getByLabel('Hint 1', { exact: true })).toHaveValue('Keep my typed hint')
})

test('publication errors name the visible fields and can be corrected on a narrow screen', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, ownerId, [{ id: draftId, title: 'Clear errors draft', status: 'draft' }])
  let saved = {
    id: draftId,
    classroomId,
    title: 'Clear errors draft',
    status: 'draft',
    language: 'JavaScript',
    objective: 'Trace the loop',
    prompt: 'Inspect its boundary',
    explanation: '',
    appliedCase: { prompt: 'Check a related loop' },
    progressiveHints: ['Trace each iteration', ''],
    questions: [
      {
        id: '507f1f77bcf86cd799439021',
        type: 'predict-output',
        prompt: 'Predict output',
        options: [
          { id: 'a', label: '0, 1' },
          { id: 'b', label: '0, 1, 2' },
        ],
        acceptedAnswer: 'a',
        explanation: '',
      },
      {
        id: '507f1f77bcf86cd799439022',
        type: 'locate-fault',
        prompt: 'Locate the boundary error',
        options: [
          { id: 'line-1', label: 'line 1' },
          { id: 'line-2', label: 'line 2' },
          { id: 'category-1', label: 'boundary' },
          { id: 'category-2', label: 'syntax' },
        ],
        acceptedAnswer: { location: '', category: '' },
        explanation: 'The final index is skipped.',
      },
      {
        id: '507f1f77bcf86cd799439023',
        type: 'repair-order',
        prompt: 'Order the repair',
        options: [
          { id: 's1', label: 'Fix the boundary' },
          { id: 's2', label: 'Verify all iterations' },
        ],
        acceptedAnswer: [],
        explanation: 'Fix, then verify.',
      },
    ],
  }
  await page.route(`**/api/challenges/${draftId}`, (route) => {
    if (route.request().method() === 'PUT') saved = { ...saved, ...route.request().postDataJSON() }
    return route.fulfill({ json: { data: saved } })
  })
  let publishes = 0
  await page.route(`**/api/challenges/${draftId}/publish`, (route) => {
    publishes++
    if (publishes === 1)
      return route.fulfill({
        status: 400,
        json: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Challenge is incomplete or invalid for publication.',
            details: [
              {
                field: 'questions.0.explanation',
                message: 'Non-empty text is required to publish.',
              },
              { field: 'explanation', message: 'Non-empty text is required to publish.' },
              {
                field: 'questions.1.acceptedAnswer.location',
                message: 'Non-empty text is required to publish.',
              },
              {
                field: 'questions.1.acceptedAnswer.category',
                message: 'Non-empty text is required to publish.',
              },
              {
                field: 'questions.2.acceptedAnswer',
                message: 'Correct repair order must include every step exactly once.',
              },
              { field: 'progressiveHints.1', message: 'Non-empty text is required to publish.' },
            ],
          },
        },
      })
    expect(saved.explanation).toBe('The loop stops before its upper bound.')
    expect(saved.questions[0].explanation).toBe('The loop prints two values.')
    expect(saved.questions[1].acceptedAnswer).toEqual({
      location: 'line-2',
      category: 'category-1',
    })
    expect(saved.questions[2].acceptedAnswer).toEqual(['s1', 's2'])
    expect(saved.progressiveHints[1]).toBe('Inspect the final index')
    saved = { ...saved, status: 'published' }
    return route.fulfill({ json: { data: saved } })
  })
  await page.goto(`/classrooms/${classroomId}`)
  await page.getByRole('button', { name: 'Open draft: Clear errors draft', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Edit draft', exact: true })
  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await editor.getByRole('button', { name: 'Publish challenge', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('Before publishing, fix the items below')
  const problems = editor.getByRole('list', { name: 'Publication problems', exact: true })
  await expect(problems).toContainText('Question 1: Add a Question explanation')
  await expect(problems).toContainText('Add an Official explanation')
  await expect(problems).toContainText('Question 2: Choose the right line in Accepted line')
  await expect(problems).toContainText(
    'Question 2: Choose the right category in Accepted error category',
  )
  await expect(problems).toContainText('Question 3: In Correct repair order')
  await expect(problems).toContainText('Hint 2: Enter some hint text')
  await expect(problems).not.toContainText(
    /questions\.|acceptedAnswer|progressiveHints|Non-empty text/,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: testInfo.outputPath('phase-b-friendly-errors-mobile.png'),
    fullPage: true,
  })
  await editor
    .getByLabel('Official explanation', { exact: true })
    .fill('The loop stops before its upper bound.')
  const blocks = page.locator('[data-block-id]')
  await blocks
    .nth(0)
    .getByLabel('Question explanation', { exact: true })
    .fill('The loop prints two values.')
  await blocks.nth(1).getByLabel('Accepted line', { exact: true }).selectOption('line-2')
  await blocks
    .nth(1)
    .getByLabel('Accepted error category', { exact: true })
    .selectOption('category-1')
  await blocks.nth(2).getByLabel('Add a step to correct order', { exact: true }).selectOption('s1')
  await blocks.nth(2).getByLabel('Add a step to correct order', { exact: true }).selectOption('s2')
  await editor.getByLabel('Hint 2', { exact: true }).fill('Inspect the final index')
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(problems).toHaveCount(0)
  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await editor.getByRole('button', { name: 'Publish challenge', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Published challenge', exact: true }),
  ).toContainText('Challenge published.')
  expect(publishes).toBe(2)
})

test('hint suggestions can finish after the ordinary ten-second request limit', async ({
  page,
}) => {
  await page.clock.install()
  let receiveRequest
  const pendingRequest = new Promise((resolve) => {
    receiveRequest = resolve
  })
  await page.route(`**/api/challenges/${draftId}/hint-drafts`, (route) => receiveRequest(route))
  const { editor, panel, updates } = await prepareHintDraft(page)
  await editor.getByLabel('Hint 1', { exact: true }).fill('Keep my hint while waiting')
  await panel.getByRole('button', { name: 'Suggest hints', exact: true }).click()
  const request = await pendingRequest
  await expect(panel).toContainText('Suggesting hints...')
  await page.clock.fastForward(11000)
  await request.fulfill({ json: { data: { hints: ['Trace the loop', 'Check its boundary'] } } })
  await expect(panel.getByLabel('Hint suggestion 1', { exact: true })).toHaveValue('Trace the loop')
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(editor.getByLabel('Hint 1', { exact: true })).toHaveValue(
    'Keep my hint while waiting',
  )
  await expect(editor.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled()
  expect(updates).toHaveLength(0)
})
