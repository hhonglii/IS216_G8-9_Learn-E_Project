// Browser checks with mocked Gemini responses.
import { test, expect } from '@playwright/test'
import { expectSentBy, failEveryLoad, logInAs, user } from './helpers/session.js'

const professorId = '507f1f77bcf86cd799439001'
const classroomId = '507f1f77bcf86cd799439003'

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`creates consecutive unsaved content from current form values on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    // Since G16 the professor logs in first; unanswered requests fail with 500.
    await failEveryLoad(page)
    await logInAs(page, user(professorId, 'Professor Lee', 'professor'))
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/api/health', (route) =>
      route.fulfill({
        json: { data: { service: 'learn-e-server', status: 'ok', database: 'connected' } },
      }),
    )
    await page.route(`**/api/classrooms/${classroomId}`, (route) =>
      route.fulfill({
        json: {
          data: {
            id: classroomId,
            name: 'JavaScript debugging',
            description: 'Practise loops and repairs',
            professorId,
            joinCode: 'ABC234',
            challenges: [],
            miniProjects: [],
          },
        },
      }),
    )
    await page.route(`**/api/classrooms/${classroomId}/leaderboard`, (route) =>
      route.fulfill({ json: { data: [] } }),
    )
    const savedRequests = []
    await page.route(`**/api/classrooms/${classroomId}/challenges`, (route) => {
      savedRequests.push(route.request().method())
      return route.fulfill({ status: 500, json: { error: { message: 'Unexpected save' } } })
    })
    const generationRequests = []
    let failExplanation = true
    let failAppliedCase = true
    await page.route(`**/api/classrooms/${classroomId}/challenge-content-drafts`, (route) => {
      const request = route.request()
      expectSentBy(route, professorId)
      const payload = request.postDataJSON()
      generationRequests.push(payload)
      if (payload.field === 'explanation' && failExplanation) {
        failExplanation = false
        return route.fulfill({
          status: 502,
          json: {
            error: { code: 'CONTENT_DRAFTS_FAILED', message: 'Do not expose provider details' },
          },
        })
      }
      if (payload.field === 'appliedCasePrompt' && failAppliedCase) {
        failAppliedCase = false
        return route.fulfill({
          status: 502,
          json: {
            error: { code: 'CONTENT_DRAFTS_FAILED', message: 'Do not expose provider details' },
          },
        })
      }
      const content = {
        prompt: 'Predict the final value of count.',
        codeSnippet: 'let count = 0;\ncount += 2;',
        explanation: 'The final value is three because the increment adds three.',
        appliedCasePrompt: 'Apply the counter to track passengers arriving at a station.',
      }[payload.field]
      return route.fulfill({ json: { data: { field: payload.field, content } } })
    })

    await page.goto(`/classrooms/${classroomId}`)
    await page.getByRole('button', { name: 'New challenge', exact: true }).click()
    const editor = page.locator('#challenge-authoring')
    await editor.getByRole('button', { name: 'Create challenge prompt', exact: true }).click()
    await expect(editor).toContainText('Challenge title above is required')
    await expect(editor).toContainText('Language above is required')
    await expect(editor).toContainText('Learning objective above is required')
    // The summary beside the button links up to each missing field.
    const missing = editor.locator('.le-error-summary')
    await expect(missing).toBeInViewport()
    await missing.getByRole('link', { name: /^Challenge title above is required/ }).click()
    await expect(page.locator('#draft-title')).toBeFocused()
    expect(generationRequests).toHaveLength(0)
    await expect
      .poll(async () => {
        const titleBounds = await page.locator('#draft-title').boundingBox()
        const headerBounds = await page.locator('header.app-bar').boundingBox()
        return titleBounds.y - (headerBounds.y + headerBounds.height)
      })
      .toBeGreaterThanOrEqual(0)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: testInfo.outputPath(`required-fields-${viewport.name}.png`),
      fullPage: true,
    })

    await page.locator('#draft-title').fill('Loop boundary')
    await page.locator('#draft-language').fill('JavaScript')
    await page.locator('#draft-objective').fill('Reason about a counter')
    await editor.getByRole('button', { name: 'Create code', exact: true }).click()
    await expect(editor).toContainText('Challenge prompt above is required before creating code.')
    await expect(editor.locator('.le-error-summary a[href="#draft-prompt"]')).toBeVisible()
    expect(generationRequests).toHaveLength(0)
    await editor.getByRole('button', { name: 'Create challenge prompt', exact: true }).click()
    await expect(page.locator('#draft-prompt')).toHaveValue('Predict the final value of count.')
    expect(generationRequests[0]).toEqual({
      field: 'prompt',
      draft: {
        title: 'Loop boundary',
        language: 'JavaScript',
        objective: 'Reason about a counter',
      },
    })

    await page.locator('#draft-prompt').fill('What does this updated counter print?')
    await editor.getByRole('button', { name: 'Create code', exact: true }).click()
    await expect(page.locator('#draft-codeSnippet')).toHaveValue('let count = 0;\ncount += 2;')
    expect(generationRequests[1].draft.prompt).toBe('What does this updated counter print?')
    expect(generationRequests[1].draft).not.toHaveProperty('codeSnippet')

    await page.locator('#draft-codeSnippet').fill('let count = 0;\ncount += 3;')
    await page.locator('#draft-explanation').fill('Keep this explanation if generation fails.')
    await editor.getByRole('button', { name: 'Create explanation', exact: true }).click()
    await expect(editor.getByRole('alert')).toContainText('Could not')
    await expect(page.locator('#draft-explanation')).toHaveValue(
      'Keep this explanation if generation fails.',
    )
    await expect(editor).not.toContainText('Do not expose provider details')
    await editor.getByRole('button', { name: 'Create explanation', exact: true }).click()
    await expect(page.locator('#draft-explanation')).toHaveValue(
      'The final value is three because the increment adds three.',
    )
    expect(generationRequests[3].draft.codeSnippet).toBe('let count = 0;\ncount += 3;')
    expect(generationRequests[3].draft).not.toHaveProperty('explanation')

    await page.locator('#draft-codeSnippet').fill('   ')
    await editor.getByRole('button', { name: 'Create applied-case prompt', exact: true }).click()
    await expect(editor).toContainText(
      'Code snippet above is required before creating the applied-case prompt.',
    )
    await expect(editor.locator('.le-error-summary a[href="#draft-codeSnippet"]')).toBeVisible()
    expect(generationRequests).toHaveLength(4)
    await page.locator('#draft-codeSnippet').fill('let count = 0;\ncount += 4;')
    await page.locator('#draft-applied-case').fill('Keep this case if generation fails.')
    await editor.getByRole('button', { name: 'Create applied-case prompt', exact: true }).click()
    await expect(editor.getByRole('alert')).toContainText('Could not')
    await expect(page.locator('#draft-applied-case')).toHaveValue(
      'Keep this case if generation fails.',
    )
    await editor.getByRole('button', { name: 'Create applied-case prompt', exact: true }).click()
    await expect(page.locator('#draft-applied-case')).toHaveValue(
      'Apply the counter to track passengers arriving at a station.',
    )
    expect(generationRequests[5]).toEqual({
      field: 'appliedCasePrompt',
      draft: {
        title: 'Loop boundary',
        language: 'JavaScript',
        objective: 'Reason about a counter',
        prompt: 'What does this updated counter print?',
        codeSnippet: 'let count = 0;\ncount += 4;',
      },
    })
    await expect(page.locator('#draft-prompt')).toHaveValue('What does this updated counter print?')
    await expect(page.locator('#draft-explanation')).toHaveValue(
      'The final value is three because the increment adds three.',
    )
    await expect(editor).toContainText('This draft has not been saved yet.')
    await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
    expect(savedRequests).toHaveLength(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: testInfo.outputPath(`generated-draft-${viewport.name}.png`),
      fullPage: true,
    })
    expect(pageErrors).toEqual([])
  })
}
