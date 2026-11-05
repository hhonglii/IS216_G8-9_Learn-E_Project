// Browser checks for G8 with mocked API data. The mocks live in
// helpers/miniProjectPage.js, so no database is used.
import { test, expect } from '@playwright/test'
import {
  studentId,
  professorId,
  miniProjectId,
  groupId,
  otherGroupId,
  workspace,
  project,
  prepare,
} from './helpers/miniProjectPage.js'

const savedAt = '2026-10-24T09:00:00.000Z'

// Answers Submit group the way the server does: a 400 with the given message
// (a string, or { message, details } when it names fields), or a save that
// moves the group to submitted.
async function mockSubmit(page, state, replies) {
  const bodies = []
  await page.route(`**/api/groups/${groupId}/submit`, (route) => {
    const body = route.request().postDataJSON()
    bodies.push(body)
    const reply = replies.shift()
    if (reply !== 'save') {
      const { message, details = null } = typeof reply === 'string' ? { message: reply } : reply
      return route.fulfill({
        status: 400,
        json: { error: { code: 'VALIDATION_FAILED', message, details } },
      })
    }
    const reflection = body.reflection.trim()
    state.project.myGroup = { ...state.project.myGroup, submissionStatus: 'submitted', reflection }
    return route.fulfill({
      json: {
        data: {
          id: groupId,
          submissionStatus: 'submitted',
          reflection,
          professorFeedback: state.project.myGroup.professorFeedback,
          updatedAt: savedAt,
        },
      },
    })
  })
  return bodies
}

const submitCard = (page) => page.getByRole('region', { name: 'Submit for review' })

test('a member submits, sees the server refuse, keeps the text, then submits again', async ({
  page,
}, testInfo) => {
  const state = { project: project({ myGroup: workspace(groupId, 'Team Rocket') }) }
  const { pageErrors } = await prepare(page, studentId, state)
  const bodies = await mockSubmit(page, state, ['Add Verify evidence before submitting.', 'save'])

  await page.goto(`/mini-projects/${miniProjectId}`)
  const card = submitCard(page)
  await expect(card.locator('.le-status')).toHaveText('draft')
  await expect(card.getByText('Not submitted yet.')).toBeVisible()

  const box = card.getByLabel('Reflection')
  await expect(box).toHaveAttribute('maxlength', '5000')
  await box.fill('We fixed the loop.')
  await expect(card.getByText('18 / 5000')).toBeVisible()

  await card.getByRole('button', { name: 'Submit for review' }).click()
  await expect(card.getByRole('alert')).toHaveText('Add Verify evidence before submitting.')
  await expect(box).toHaveValue('We fixed the loop.')
  await expect(card.locator('.le-status')).toHaveText('draft')
  await expect(card.getByRole('button', { name: 'Submit for review' })).toBeEnabled()

  await card.getByRole('button', { name: 'Submit for review' }).click()
  await expect(card.locator('.le-status')).toHaveText('submitted')
  await expect(card.getByText("Waiting for your professor's review.")).toBeVisible()
  await expect(card.getByText('We fixed the loop.')).toBeVisible()
  await expect(card.getByRole('textbox')).toHaveCount(0)
  await expect(card.getByRole('button')).toHaveCount(0)
  await expect(card.getByRole('alert')).toHaveCount(0)
  expect(bodies).toEqual([
    { reflection: 'We fixed the loop.' },
    { reflection: 'We fixed the loop.' },
  ])

  await page.screenshot({ path: testInfo.outputPath('member-submitted.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})

test('the checklist shows what submitting needs, and a refusal that names fields links to them (UX audit items 2 and 4)', async ({
  page,
}, testInfo) => {
  const state = {
    project: project({
      myGroup: workspace(groupId, 'Team Rocket', {
        stageEvidence: {
          Diagnose: 'Found it.',
          Repair: 'Fixed it.',
          Extend: '',
          Verify: '',
          Reflect: '',
        },
      }),
    }),
  }
  const { pageErrors } = await prepare(page, studentId, state)
  await mockSubmit(page, state, [
    {
      message: 'There is something wrong with your evidences and reflection',
      details: [
        { field: 'stageEvidence.Verify', message: 'Add Verify evidence before submitting.' },
        { field: 'reflection', message: 'Write a reflection before submitting.' },
      ],
    },
  ])

  await page.goto(`/mini-projects/${miniProjectId}`)
  const card = submitCard(page)
  const checklist = card.getByRole('region', { name: 'Before you submit' })
  await expect(checklist.getByText('2 of 4 done.')).toBeVisible()
  await expect(checklist.getByRole('listitem')).toHaveText([
    'Done: Diagnose evidence, saved',
    'Done: Repair evidence, saved',
    'To do: Verify evidence, saved',
    'To do: A reflection',
  ])
  // An unticked item is a plain link to its field, and the browser moves there.
  const verifyLink = checklist.getByRole('link', { name: 'Verify evidence, saved' })
  await expect(verifyLink).toHaveAttribute('href', '#stage-evidence-Verify')
  await verifyLink.click()
  await expect(page.locator('#stage-evidence-Verify')).toBeFocused()

  // Optional stages say so; the needed ones don't.
  const stages = page.getByRole('region', { name: 'Stage evidence' })
  await expect(stages.getByLabel('Extend evidence (optional)')).toBeVisible()
  await expect(stages.getByLabel('Verify evidence', { exact: true })).toBeVisible()

  await card.getByRole('button', { name: 'Submit for review' }).click()
  const summary = card.getByRole('alert').filter({ has: page.getByRole('heading') })
  await expect(summary).toBeInViewport()
  await expect(summary.getByRole('heading')).toHaveText("Your work wasn't submitted")
  await expect(summary.getByRole('link')).toHaveText([
    'Add Verify evidence before submitting.',
    'Write a reflection before submitting.',
  ])
  await expect(page.locator('#stage-evidence-Verify')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#reflection-input')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#stage-evidence-Diagnose')).not.toHaveAttribute('aria-invalid')

  await summary.getByRole('link', { name: 'Write a reflection before submitting.' }).click()
  await expect(page.locator('#reflection-input')).toBeFocused()
  await page.locator('#reflection-input').fill('We fixed the loop.')
  await expect(checklist.getByText('3 of 4 done.')).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('member-refused.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})

test('returned work shows the feedback first and keeps an edited reflection across a reload', async ({
  page,
}, testInfo) => {
  const state = {
    project: project({
      myGroup: workspace(groupId, 'Team Rocket', {
        submissionStatus: 'returned',
        reflection: 'Old reflection',
        professorFeedback: 'Add a test for zero.',
      }),
    }),
  }
  const { pageErrors } = await prepare(page, studentId, state)
  const bodies = await mockSubmit(page, state, ['save'])
  // Saving a stage reloads the page, which is when unsaved typing could be lost.
  await page.route(`**/api/groups/${groupId}/stages`, (route) => {
    const { stageEvidence } = route.request().postDataJSON()
    const group = state.project.myGroup
    state.project.myGroup = {
      ...group,
      stageEvidence: { ...group.stageEvidence, ...stageEvidence },
    }
    return route.fulfill({
      json: { data: { id: groupId, stageEvidence: state.project.myGroup.stageEvidence } },
    })
  })

  await page.goto(`/mini-projects/${miniProjectId}`)
  const card = submitCard(page)
  await expect(card.locator('.le-status')).toHaveText('returned')
  await expect(card.getByText(/Read the feedback, update your evidence/)).toBeVisible()
  const feedback = card.locator('.le-callout')
  await expect(feedback).toContainText('Add a test for zero.')

  const box = card.getByLabel('Reflection')
  await expect(box).toHaveValue('Old reflection')
  const feedbackBox = await feedback.boundingBox()
  const reflectionBox = await box.boundingBox()
  expect(feedbackBox.y).toBeLessThan(reflectionBox.y)

  await box.fill('New reflection')
  const stages = page.getByRole('region', { name: 'Stage evidence' })
  await stages.getByRole('textbox').first().fill('Found the off-by-one.')
  await stages.getByRole('button', { name: 'Save stage evidence' }).click()
  await expect(stages.getByRole('status')).toHaveText('Saved.')
  await expect(box).toHaveValue('New reflection')

  await card.getByRole('button', { name: 'Submit for review' }).click()
  await expect(card.locator('.le-status')).toHaveText('submitted')
  await expect(card.locator('.le-callout')).toHaveCount(0)
  expect(bodies).toEqual([{ reflection: 'New reflection' }])

  await page.screenshot({ path: testInfo.outputPath('member-returned.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})

test('approved work is read only', async ({ page }) => {
  const state = {
    project: project({
      myGroup: workspace(groupId, 'Team Rocket', {
        submissionStatus: 'approved',
        reflection: 'We fixed the loop.',
        professorFeedback: 'Well done.',
      }),
    }),
  }
  const { pageErrors } = await prepare(page, studentId, state)

  await page.goto(`/mini-projects/${miniProjectId}`)
  const card = submitCard(page)
  await expect(card.locator('.le-status')).toHaveText('approved')
  await expect(card.getByText('Your professor approved this work.')).toBeVisible()
  await expect(card.getByText('We fixed the loop.')).toBeVisible()
  await expect(card.getByRole('textbox')).toHaveCount(0)
  await expect(card.getByRole('button')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('the owning professor sees each group status and reflection, with no submit card', async ({
  page,
}) => {
  const state = {
    project: project({
      isOwningProfessor: true,
      groups: [
        { id: groupId, name: 'Team Rocket', memberIds: [studentId] },
        { id: otherGroupId, name: 'Team Aqua', memberIds: [] },
      ],
      workspaces: [
        workspace(groupId, 'Team Rocket', {
          submissionStatus: 'submitted',
          reflection: 'Ready for review.',
        }),
        workspace(otherGroupId, 'Team Aqua'),
      ],
    }),
  }
  const { pageErrors } = await prepare(page, professorId, state)

  await page.goto(`/mini-projects/${miniProjectId}`)
  const progress = page.getByRole('region', { name: 'Group progress' })
  await expect(progress.locator('.le-status')).toHaveText(['submitted', 'draft'])
  await expect(progress.getByText('Ready for review.')).toBeVisible()
  await expect(progress.getByText('Reflection:')).toHaveCount(1)
  await expect(submitCard(page)).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
