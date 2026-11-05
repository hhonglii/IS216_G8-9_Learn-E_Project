// Product test for deleting drafts (H-11, heuristic 3: user control and
// freedom), against the real server. Cancelling the confirm keeps the draft,
// accepting removes it, and published work offers no delete at all.
import { test, expect } from './helpers/test.js'
import { API, apiAs, uniqueName } from './helpers/api.js'
import { classroomWithChallenge, pageFor } from './helpers/setup.js'

test('a professor deletes a challenge draft and a mini-project draft, but not published work', async ({
  browser,
  request,
}) => {
  const { professor, classroom, challenge } = await classroomWithChallenge(request)
  const challengeTitle = `Unused draft ${uniqueName('ch')}`
  const projectTitle = `Unused brief ${uniqueName('mp')}`
  const draft = await apiAs(request, professor, 'POST', `/classrooms/${classroom.id}/challenges`, {
    title: challengeTitle,
    language: 'JavaScript',
    objective: 'Trace a loop.',
  })
  const brief = await apiAs(
    request,
    professor,
    'POST',
    `/classrooms/${classroom.id}/mini-projects`,
    {
      title: projectTitle,
    },
  )
  const asProfessor = { headers: { authorization: `Bearer ${professor.token}` } }

  const page = await pageFor(browser, professor)
  await page.goto(`/classrooms/${classroom.id}`)
  const deleteChallenge = page.getByRole('button', { name: `Delete draft: ${challengeTitle}` })
  await expect(deleteChallenge).toBeVisible()
  await expect(page.getByRole('button', { name: `Delete draft: ${challenge.title}` })).toHaveCount(
    0,
  )

  // Cancelling keeps the draft on the page and on the server.
  page.once('dialog', (dialog) => dialog.dismiss())
  await deleteChallenge.click()
  await expect(deleteChallenge).toBeVisible()
  expect((await request.get(`${API}/challenges/${draft.id}`, asProfessor)).status()).toBe(200)

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toBe(`Delete the draft "${challengeTitle}"? This can't be undone.`)
    return dialog.accept()
  })
  await deleteChallenge.click()
  await expect(page.getByText(`Deleted the draft "${challengeTitle}".`)).toBeVisible()
  await expect(deleteChallenge).toHaveCount(0)
  expect((await request.get(`${API}/challenges/${draft.id}`, asProfessor)).status()).toBe(404)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: `Delete draft: ${projectTitle}` }).click()
  await expect(page.getByText(`Deleted the draft "${projectTitle}".`)).toBeVisible()
  await expect(page.getByRole('button', { name: `Edit draft: ${projectTitle}` })).toHaveCount(0)
  expect((await request.get(`${API}/mini-projects/${brief.id}`, asProfessor)).status()).toBe(404)

  // The server refuses to delete published work even if asked directly.
  const removePublished = await request.delete(`${API}/challenges/${challenge.id}`, asProfessor)
  expect(removePublished.status()).toBe(409)
})
