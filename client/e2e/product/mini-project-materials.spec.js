// Product test for mini-project materials (H-10), against the real server and
// its in-memory MongoDB, so the files really go through GridFS. A professor
// attaches a PDF to a draft, publishes it, and a student downloads the same bytes.
import { test, expect } from './helpers/test.js'
import { API, apiAs, register, uniqueName } from './helpers/api.js'
import { Buffer } from 'node:buffer'
import { pageFor, studentIn } from './helpers/setup.js'

const stages = ['Diagnose', 'Repair', 'Extend', 'Verify', 'Reflect']
const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n')

test('a professor attaches a PDF to a draft and a student downloads it once published', async ({
  browser,
  request,
}) => {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: `Projects ${uniqueName('class')}`,
  })
  const student = await studentIn(request, classroom, 'Ana Cruz')
  const title = `Grade report ${uniqueName('mp')}`
  const draft = await apiAs(
    request,
    professor,
    'POST',
    `/classrooms/${classroom.id}/mini-projects`,
    {
      title,
      brief: 'The grade report rounds every average down.',
      rubric: 'A working fix and a short reflection.',
      stageInstructions: Object.fromEntries(stages.map((stage) => [stage, `${stage} notes.`])),
      acceptanceCriteria: ['Averages round to the nearest whole mark.'],
    },
  )

  const page = await pageFor(browser, professor)
  await page.goto(`/classrooms/${classroom.id}`)
  await page.getByRole('button', { name: `Edit draft: ${title}` }).click()

  // A Word file is refused in the browser, before anything is sent.
  const picker = page.getByLabel('Add a file')
  await picker.setInputFiles({ name: 'notes.docx', mimeType: 'application/msword', buffer: pdf })
  await expect(page.getByRole('alert')).toHaveText('Only PDF and zip files can be uploaded.')

  await picker.setInputFiles({ name: 'Week 3 brief.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByRole('status')).toHaveText('Added Week 3 brief.pdf.')
  await expect(page.getByRole('button', { name: 'Remove Week 3 brief.pdf' })).toBeVisible()

  // The server checks the bytes too: a program renamed to .pdf is refused.
  const auth = (person) => ({ authorization: `Bearer ${person.token}` })
  const renamed = await request.post(`${API}/mini-projects/${draft.id}/materials`, {
    headers: {
      ...auth(professor),
      'Content-Type': 'application/octet-stream',
      'X-File-Name': 'setup.pdf',
    },
    data: Buffer.from('MZ\x90\x00 not a pdf'),
  })
  expect(renamed.status()).toBe(400)

  // Students can't reach a draft's files.
  const saved = await apiAs(request, professor, 'GET', `/mini-projects/${draft.id}`)
  const fileUrl = `${API}/mini-projects/${draft.id}/materials/${saved.materials[0].id}`
  expect((await request.get(fileUrl, { headers: auth(student) })).status()).toBe(404)

  page.once('dialog', (dialog) => dialog.accept()) // publishing asks first
  await page.getByRole('button', { name: 'Publish mini-project', exact: true }).click()
  await expect(page.getByText('Mini-project published. Students can now see it.')).toBeVisible()

  // Published files are fixed, like the rest of the brief.
  const late = await request.post(`${API}/mini-projects/${draft.id}/materials`, {
    headers: {
      ...auth(professor),
      'Content-Type': 'application/octet-stream',
      'X-File-Name': 'late.pdf',
    },
    data: pdf,
  })
  expect(late.status()).toBe(409)

  const studentPage = await pageFor(browser, student)
  await studentPage.goto(`/mini-projects/${draft.id}`)
  await expect(studentPage.getByRole('heading', { name: 'Materials' })).toBeVisible()
  const downloading = studentPage.waitForEvent('download')
  await studentPage.getByRole('button', { name: 'Download Week 3 brief.pdf' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('Week 3 brief.pdf')
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  expect(Buffer.concat(chunks).equals(pdf)).toBe(true)
})
