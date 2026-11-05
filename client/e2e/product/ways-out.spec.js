// Product tests for the ways back out (second-pass UX audit A2 to A6, heuristic
// 3: user control and freedom), against the real server and database. The unit
// tests fake Mongo, so these are what show $pull, $size and the classroom
// cascade really behave.
import { test, expect } from './helpers/test.js'
import { API, apiAs } from './helpers/api.js'
import {
  classroomWithChallenge,
  classroomWithMiniProject,
  studentIn,
  approveLearner,
  askForHelp,
  pageFor,
} from './helpers/setup.js'

const itemWith = (page, text) => page.getByRole('listitem').filter({ hasText: text })
const as = (person) => ({ headers: { authorization: `Bearer ${person.token}` } })

test('an asker withdraws an open request and a mentor gives a claimed one back', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithChallenge(request)
  const mentor = await studentIn(request, setup.classroom, 'Ana Cruz')
  const asker = await studentIn(request, setup.classroom, 'Ben Ong')
  const second = await studentIn(request, setup.classroom, 'Cai Lin')
  await approveLearner(request, setup, mentor)
  const unwanted = await askForHelp(request, setup, asker)
  await askForHelp(request, setup, second)
  const helpQueue = `/classrooms/${setup.classroom.id}/help`

  const askerPage = await pageFor(browser, asker)
  await askerPage.goto(helpQueue)
  askerPage.once('dialog', (dialog) => dialog.accept())
  await itemWith(askerPage, 'Ben Ong').getByRole('button', { name: 'Withdraw request' }).click()
  await expect(askerPage.getByRole('status')).toHaveText(
    `Withdrew your help request about question 1 of "${setup.challenge.title}".`,
  )
  await expect(itemWith(askerPage, 'Ben Ong')).toHaveCount(0)
  const queue = await apiAs(
    request,
    setup.professor,
    'GET',
    `/classrooms/${setup.classroom.id}/help-requests`,
  )
  expect(queue.map((item) => item.id)).not.toContain(unwanted.id)

  const mentorPage = await pageFor(browser, mentor)
  await mentorPage.goto(helpQueue)
  const card = itemWith(mentorPage, 'Cai Lin')
  await card.getByRole('button', { name: 'Claim request' }).click()
  await expect(card.getByText('You claimed this. Write your hint below.')).toBeVisible()
  await card.getByRole('button', { name: 'Open request' }).click()
  await card.getByRole('button', { name: 'Give back to the queue' }).click()
  await expect(card.getByText('Waiting for a mentor to pick it up')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Claim request' })).toBeVisible()
})

test('students leave a group and a classroom, then the professor deletes the classroom', async ({
  browser,
  request,
}) => {
  const setup = await classroomWithMiniProject(request)
  const ana = await studentIn(request, setup.classroom, 'Ana Cruz')
  const ben = await studentIn(request, setup.classroom, 'Ben Ong')
  const group = await apiAs(request, ana, 'POST', `/mini-projects/${setup.miniProject.id}/groups`, {
    name: 'Team Kite',
  })
  await apiAs(request, ben, 'PUT', `/groups/${group.id}/join`)
  const loaded = await apiAs(request, ana, 'GET', `/mini-projects/${setup.miniProject.id}`)
  await apiAs(request, ana, 'PUT', `/groups/${group.id}/tasks`, {
    tasks: [{ title: 'Trace the loop', ownerId: ana.id, status: 'todo' }],
    updatedAt: loaded.myGroup.updatedAt,
  })
  const workspace = async () =>
    (
      await apiAs(request, setup.professor, 'GET', `/mini-projects/${setup.miniProject.id}`)
    ).workspaces.find((item) => item.id === group.id)

  // Ana leaves; her task stays with the group, without an owner.
  const anaPage = await pageFor(browser, ana)
  await anaPage.goto(`/mini-projects/${setup.miniProject.id}`)
  anaPage.once('dialog', (dialog) => {
    expect(dialog.message()).toBe(
      'Leave "Team Kite"? Your tasks stay with the group without an owner.',
    )
    return dialog.accept()
  })
  await anaPage.getByRole('button', { name: 'Leave group' }).click()
  await expect(anaPage.getByText('You left "Team Kite".')).toBeVisible()
  await expect(anaPage.getByLabel('New group name')).toBeVisible()
  const afterAna = await workspace()
  expect(afterAna.members.map((member) => member.id)).toEqual([ben.id])
  expect(afterAna.tasks).toMatchObject([{ title: 'Trace the loop', ownerId: null }])

  // Ben is the last member, so the group goes with him.
  const benPage = await pageFor(browser, ben)
  await benPage.goto(`/mini-projects/${setup.miniProject.id}`)
  benPage.once('dialog', (dialog) => dialog.accept())
  await benPage.getByRole('button', { name: 'Leave group' }).click()
  await expect(benPage.getByText('You left "Team Kite".')).toBeVisible()
  expect(await workspace()).toBeUndefined()

  // Ana, now in no group, leaves the classroom and lands on the dashboard.
  await anaPage.goto(`/classrooms/${setup.classroom.id}`)
  anaPage.once('dialog', (dialog) => dialog.accept())
  await anaPage.getByRole('button', { name: 'Leave classroom' }).click()
  await expect(anaPage).toHaveURL(/\/$/)
  await expect(anaPage.getByText(setup.classroom.name)).toHaveCount(0)
  expect((await request.get(`${API}/classrooms/${setup.classroom.id}`, as(ana))).status()).toBe(403)

  // The professor deletes the classroom; it and its mini-project are gone.
  const professorPage = await pageFor(browser, setup.professor)
  await professorPage.goto(`/classrooms/${setup.classroom.id}`)
  professorPage.once('dialog', (dialog) => {
    expect(dialog.message()).toContain(`Delete "${setup.classroom.name}" and everything in it?`)
    return dialog.accept()
  })
  await professorPage.getByRole('button', { name: 'Delete classroom' }).click()
  await expect(professorPage).toHaveURL(/\/$/)
  const asProfessor = as(setup.professor)
  expect((await request.get(`${API}/classrooms/${setup.classroom.id}`, asProfessor)).status()).toBe(
    404,
  )
  expect(
    (await request.get(`${API}/mini-projects/${setup.miniProject.id}`, asProfessor)).status(),
  ).toBe(404)
})
