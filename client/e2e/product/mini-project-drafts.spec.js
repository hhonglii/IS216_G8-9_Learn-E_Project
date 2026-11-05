// Product tests for mini-project drafts (H-8) and the rubric students see (H-9),
// against the real server: a professor saves a draft with just a title, students
// can't see it, then the professor finishes and publishes it.
import { test, expect } from './helpers/test.js'
import { API, apiAs, register, uniqueName } from './helpers/api.js'
import { pageFor, studentIn } from './helpers/setup.js'

const stages = ['Diagnose', 'Repair', 'Extend', 'Verify', 'Reflect']
const rubric = 'Clear diagnosis, a working repair and an honest reflection.'

test('a draft stays hidden until the professor publishes it, then students see the rubric', async ({
  browser,
  request,
}) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: `Projects ${uniqueName('class')}`,
  })
  const student = await studentIn(request, classroom, 'Ana Cruz')
  const title = `Cart fixer ${uniqueName('mp')}`

  // Save a draft with only a title.
  const page = await pageFor(browser, professor)
  await page.goto(`/classrooms/${classroom.id}`)
  await page.getByRole('button', { name: 'New mini-project', exact: true }).click()
  await page.getByLabel('Mini-project title').fill(title)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(
    page.getByText("Draft saved. Students can't see it until you publish it."),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: `Edit draft: ${title}` })).toBeVisible()

  const listed = await apiAs(request, professor, 'GET', `/classrooms/${classroom.id}`)
  const draftId = listed.miniProjects.find((brief) => brief.title === title).id
  const asStudent = { headers: { authorization: `Bearer ${student.token}` } }
  expect((await request.get(`${API}/mini-projects/${draftId}`, asStudent)).status()).toBe(404)
  const studentView = await apiAs(request, student, 'GET', `/classrooms/${classroom.id}`)
  expect(studentView.miniProjects).toEqual([])

  // Publishing an incomplete draft lists everything missing at once, each
  // linked to its field, and keeps the form (UX audit item 4). The builder
  // checks first, so nothing is sent and no confirm is shown.
  await page.getByRole('button', { name: 'Publish mini-project', exact: true }).click()
  const summary = page.locator('.le-error-summary')
  await expect(summary).toHaveAttribute('role', 'alert')
  await expect(summary).toBeInViewport()
  await expect(summary.getByRole('link').first()).toHaveText('Enter a project brief.')
  expect(await summary.getByRole('link').count()).toBeGreaterThan(1)
  await summary.getByRole('link', { name: 'Enter a project brief.' }).click()
  await expect(page.getByLabel('Project brief', { exact: true })).toBeFocused()

  await page
    .getByLabel('Project brief', { exact: true })
    .fill('The cart total leaves out the last item.')
  for (const stage of stages) await page.getByLabel(stage, { exact: true }).fill(`${stage} notes.`)
  await page.getByLabel('Criterion 1', { exact: true }).fill('Totals include every item.')
  await page.getByLabel('Rubric', { exact: true }).fill(rubric)
  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await page.getByRole('button', { name: 'Publish mini-project', exact: true }).click()
  await expect(page.getByText('Mini-project published. Students can now see it.')).toBeVisible()
  await expect(page.getByRole('button', { name: `Edit draft: ${title}` })).toHaveCount(0)

  // Published briefs can't be edited.
  const edit = await request.put(`${API}/mini-projects/${draftId}`, {
    headers: { authorization: `Bearer ${professor.token}` },
    data: { title: 'Changed' },
  })
  expect(edit.status()).toBe(409)

  const studentPage = await pageFor(browser, student)
  await studentPage.goto(`/mini-projects/${draftId}`)
  await expect(studentPage.getByRole('heading', { name: 'Rubric' })).toBeVisible()
  await expect(studentPage.getByText(rubric)).toBeVisible()
})
