// Product browser tests for H1.
// These run against the real server and an in-memory MongoDB (decision H-5): nothing
// is mocked, and each reload proves the record was saved, not just shown.
import { test, expect } from './helpers/test.js'
import { API, apiAs, logInAs, register, uniqueName } from './helpers/api.js'
import { PROFESSOR_CODE } from './professor-code.js'
import { pageFor } from './helpers/setup.js'

const nav = (page) => page.getByRole('navigation', { name: 'Primary navigation' })

test('an account made on the login page is saved, survives a reload and can log in again', async ({
  page,
}) => {
  const username = uniqueName('new')
  const password = `pw-${username}-secret`

  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).last().fill(username)
  await page.getByLabel('Display name').fill('Dana Lim')
  await page.getByLabel('Role').selectOption('student')
  await page.getByLabel('Password', { exact: true }).last().fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByText('Dana Lim')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Dana Lim')).toBeVisible()

  await nav(page).getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Username', { exact: true }).first().fill(username)
  await page.getByLabel('Password', { exact: true }).first().fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Dana Lim')).toBeVisible()
})

// H3 Step 6 (option B): the server, not the form, decides who becomes a professor.
test('a professor account needs the sign-up code the server was started with', async ({
  page,
  request,
}) => {
  const username = uniqueName('newprof')
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).last().fill(username)
  await page.getByLabel('Display name').fill('Prof Lee')
  await page.getByLabel('Role').selectOption('professor')
  const code = page.getByLabel('Professor sign-up code')
  await code.fill('a-guess')
  await page.getByLabel('Password', { exact: true }).last().fill(`pw-${username}-secret`)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Professor accounts need the professor sign-up code.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  // Leaving out the form does not help: the API refuses a professor without the code.
  const direct = await request.post(`${API}/auth/register`, {
    data: { username, displayName: 'Prof Lee', role: 'professor', password: 'long enough' },
  })
  expect(direct.status()).toBe(400)

  await code.fill(PROFESSOR_CODE)
  await page.getByLabel('Password', { exact: true }).last().fill(`pw-${username}-secret`)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'New classroom' })).toBeVisible()
})

test("a professor's new classroom is saved and still listed after a reload", async ({
  page,
  request,
}) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const name = `Loops ${uniqueName('class')}`
  await logInAs(page, professor)

  await page.goto('/')
  await page.getByLabel('Classroom name').fill(name)
  await page.getByRole('button', { name: 'Create classroom' }).click()
  await expect(page.getByText(`Created ${name}.`)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name })).toBeVisible()
})

test('a student joins a classroom with its code and keeps it after a reload', async ({
  page,
  request,
}) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: `Arrays ${uniqueName('class')}`,
  })
  const student = await register(request, 'student', 'Sam Lee')
  await logInAs(page, student)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: classroom.name })).toHaveCount(0)
  await page.getByLabel('Classroom join code').fill(classroom.joinCode)
  await page.getByRole('button', { name: 'Join classroom' }).click()
  await expect(page.getByText(`Joined ${classroom.name}`)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: classroom.name })).toBeVisible()
})

// UX audit 26: the Copy button puts the real code on the clipboard, and a
// student can join with exactly what was copied.
test('a professor copies the join code and a student joins with what was copied', async ({
  browser,
  page,
  request,
}) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: `Strings ${uniqueName('class')}`,
  })
  const professorPage = await pageFor(browser, professor)
  await professorPage.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await professorPage.goto(`/classrooms/${classroom.id}`)
  await professorPage.getByRole('button', { name: 'Copy join code' }).click()
  await expect(professorPage.getByRole('button', { name: 'Copied join code' })).toBeVisible()
  const copied = await professorPage.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(classroom.joinCode)

  const student = await register(request, 'student', 'Sam Lee')
  await logInAs(page, student)
  await page.goto('/')
  await page.getByLabel('Classroom join code').fill(copied)
  await page.getByRole('button', { name: 'Join classroom' }).click()
  await expect(page.getByText(`Joined ${classroom.name}`)).toBeVisible()
})
