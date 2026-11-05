// Setup for the product journeys (H2).
// Builds the records a journey starts from through the real API, so each test
// only drives in the browser the part of the feature it is checking.
import { apiAs, logInAs, register, uniqueName } from './api.js'
import { blockAvatars } from './test.js'

// The one public repository ../fake-github.js knows about.
export const FAKE_REPOSITORY = 'https://github.com/learn-e-e2e/loop-fixer'

// The smallest challenge the server will publish: one predict-output question,
// an applied case and two hints. The right option is labelled "3". A journey can
// pass its own questions instead.
const predictOutput = {
  type: 'predict-output',
  prompt: 'What does this print?',
  options: [
    { id: 'a', label: '3' },
    { id: 'b', label: '6' },
  ],
  acceptedAnswer: 'a',
  explanation: '1 + 2 is 3.',
}

const challengeBody = (title, questions) => ({
  title,
  language: 'JavaScript',
  objective: 'Trace a loop that stops one step early.',
  prompt: 'The loop should add every number from 1 to 3.',
  codeSnippet: 'let total = 0\nfor (let i = 1; i < 3; i++) total += i\nconsole.log(total)',
  explanation: 'The condition i < 3 skips 3, so only 1 and 2 are added.',
  questions,
  appliedCase: { prompt: 'A cart total leaves out the last item. Explain why.' },
  progressiveHints: ['Read the loop condition.', 'Which value of i never runs?'],
})

// A professor, a classroom and one published challenge in it.
export async function classroomWithChallenge(request, questions = [predictOutput]) {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: `Loops ${uniqueName('class')}`,
  })
  const draft = await apiAs(
    request,
    professor,
    'POST',
    `/classrooms/${classroom.id}/challenges`,
    challengeBody(`Off by one ${uniqueName('ch')}`, questions),
  )
  const challenge = await apiAs(request, professor, 'POST', `/challenges/${draft.id}/publish`)
  return { professor, classroom, challenge, questionId: challenge.questions[0].id }
}

const stages = ['Diagnose', 'Repair', 'Extend', 'Verify', 'Reflect']

// A professor, a classroom and one published mini-project in it.
export async function classroomWithMiniProject(request, { maxGroupSize = 2 } = {}) {
  const professor = await register(request, 'professor', 'Prof Tan')
  const classroom = await apiAs(request, professor, 'POST', '/classrooms', {
    name: `Projects ${uniqueName('class')}`,
  })
  const miniProject = await miniProjectIn(request, professor, classroom, maxGroupSize)
  return { professor, classroom, miniProject }
}

// One published mini-project in a classroom the professor already owns.
export async function miniProjectIn(request, professor, classroom, maxGroupSize = 2) {
  const draft = await apiAs(
    request,
    professor,
    'POST',
    `/classrooms/${classroom.id}/mini-projects`,
    {
      title: `Cart fixer ${uniqueName('mp')}`,
      brief: 'The cart total leaves out the last item. Find and fix the bug.',
      rubric: 'Clear diagnosis, a working repair and an honest reflection.',
      stageInstructions: Object.fromEntries(
        stages.map((stage) => [stage, `Write your ${stage} notes.`]),
      ),
      acceptanceCriteria: ['The total includes every item.'],
      maxGroupSize,
    },
  )
  // Creating saves a draft; students only see it once it is published (H-8).
  return apiAs(request, professor, 'POST', `/mini-projects/${draft.id}/publish`)
}

// A group led by `student`, with the evidence the server needs before a submit.
export async function groupWithEvidence(request, setup, student, name) {
  const group = await apiAs(
    request,
    student,
    'POST',
    `/mini-projects/${setup.miniProject.id}/groups`,
    {
      name,
    },
  )
  await apiAs(request, student, 'PUT', `/groups/${group.id}/stages`, {
    stageEvidence: {
      Diagnose: 'The loop stops one item early.',
      Repair: 'Changed < to <= in the loop.',
      Verify: 'A three-item cart now totals correctly.',
    },
  })
  return group
}

export async function studentIn(request, classroom, displayName) {
  const student = await register(request, 'student', displayName)
  await apiAs(request, student, 'POST', '/classrooms/join', { joinCode: classroom.joinCode })
  return student
}

// Answers the challenge, submits a diagnosis and has the professor approve it,
// which is what makes a student a mentor for that challenge.
export async function approveLearner(request, setup, student) {
  const attempt = await apiAs(
    request,
    student,
    'POST',
    `/challenges/${setup.challenge.id}/attempts`,
    {
      questionId: setup.questionId,
      value: 'a',
    },
  )
  await apiAs(request, student, 'PUT', `/attempts/${attempt.id}/applied`, {
    appliedDiagnosis: 'The loop stops before the last item, so it is never added.',
  })
  await apiAs(request, setup.professor, 'PUT', `/attempts/${attempt.id}/review`, {
    decision: 'approve',
    feedback: '',
  })
}

// Question help about the challenge's first question (decision H-14).
export async function askForHelp(request, setup, student) {
  return apiAs(request, student, 'POST', '/help-requests', {
    contextType: 'challenge',
    contextId: setup.challenge.id,
    questionId: setup.challenge.questions[0].id,
    hintType: 'Guiding question',
  })
}

// A fresh browser context per person, so two people can use the app in one test.
export async function pageFor(browser, person) {
  const context = await browser.newContext()
  await blockAvatars(context)
  const page = await context.newPage()
  await logInAs(page, person)
  return page
}
