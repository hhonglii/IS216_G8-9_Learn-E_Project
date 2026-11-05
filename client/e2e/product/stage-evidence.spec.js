// Product tests for H3 Step 4.
// One Save button sends every stage with unsaved typing in one request, and the
// real server merges it, so a teammate's stage saved in the meantime survives.
import { test, expect } from './helpers/test.js'
import { apiAs } from './helpers/api.js'
import { classroomWithMiniProject, pageFor, studentIn } from './helpers/setup.js'

async function twoMembers(browser, request) {
  const setup = await classroomWithMiniProject(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const ben = await studentIn(request, setup.classroom, 'Ben Ong')
  const group = await apiAs(request, ana, 'POST', `/mini-projects/${setup.miniProject.id}/groups`, {
    name: 'Team Loop',
  })
  await apiAs(request, ben, 'PUT', `/groups/${group.id}/join`)
  const page = await pageFor(browser, ana)
  await page.goto(`/mini-projects/${setup.miniProject.id}`)
  const stages = page.getByRole('region', { name: 'Stage evidence' })
  await expect(stages.getByLabel('Diagnose evidence')).toBeVisible()
  return { ben, group, page, stages }
}

test('one Save sends only the edited stages and keeps a stage a teammate saved', async ({
  browser,
  request,
}) => {
  const { ben, group, page, stages } = await twoMembers(browser, request)
  const save = stages.getByRole('button', { name: 'Save stage evidence' })
  await expect(save).toBeDisabled()

  // Ben saves Repair after Ana's page loaded, so her page still shows it empty.
  await apiAs(request, ben, 'PUT', `/groups/${group.id}/stages`, {
    stageEvidence: { Repair: 'Changed < to <= in the loop.' },
  })

  await stages.getByLabel('Diagnose evidence').fill('The loop stops one item early.')
  await stages.getByLabel('Verify evidence').fill('A three-item cart now totals correctly.')
  await expect(stages.getByText('Unsaved changes')).toHaveCount(2)
  const sent = page.waitForRequest((r) => r.url().endsWith(`/groups/${group.id}/stages`))
  await save.click()
  expect((await sent).postDataJSON()).toEqual({
    stageEvidence: {
      Diagnose: 'The loop stops one item early.',
      Verify: 'A three-item cart now totals correctly.',
    },
  })
  await expect(stages.getByRole('status')).toHaveText('Saved.')
  await expect(stages.getByText('Unsaved changes')).toHaveCount(0)
  await expect(save).toBeDisabled()

  await page.reload()
  await expect(stages.getByLabel('Diagnose evidence')).toHaveValue('The loop stops one item early.')
  await expect(stages.getByLabel('Repair evidence')).toHaveValue('Changed < to <= in the loop.')
  await expect(stages.getByLabel('Verify evidence')).toHaveValue(
    'A three-item cart now totals correctly.',
  )
})

test('a failed save keeps the typing and lets the member try again', async ({
  browser,
  request,
}) => {
  const { page, stages } = await twoMembers(browser, request)
  const diagnose = stages.getByLabel('Diagnose evidence')
  await diagnose.fill('The loop stops one item early.')

  await page.route('**/api/groups/*/stages', (route) => route.abort(), { times: 1 })
  await stages.getByRole('button', { name: 'Save stage evidence' }).click()
  await expect(stages.getByRole('alert')).toBeVisible()
  await expect(diagnose).toHaveValue('The loop stops one item early.')
  await expect(stages.getByText('Unsaved changes')).toHaveCount(1)
  await expect(stages.getByRole('status')).toHaveCount(0)

  await stages.getByRole('button', { name: 'Save stage evidence' }).click()
  await expect(stages.getByRole('status')).toHaveText('Saved.')
  await page.reload()
  await expect(diagnose).toHaveValue('The loop stops one item early.')
})
