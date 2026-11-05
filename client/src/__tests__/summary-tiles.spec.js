// Tests for G14: the summary tiles and bars in ProfessorReviewView.vue.
// getInsights is mocked, so
// only what the page does with the server's summary is under test.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProfessorReviewView from '../views/ProfessorReviewView.vue'
import { getInsights } from '../services/classroomsApi.js'
vi.mock('../services/classroomsApi.js', () => ({ getInsights: vi.fn() }))
vi.mock('../services/challengesApi.js', () => ({ reviewAttempt: vi.fn() }))
vi.mock('../services/groupsApi.js', () => ({ reviewGroup: vi.fn() }))

const classroomId = '507f1f77bcf86cd799439106'
const emptySummary = {
  startedAttempts: 0,
  completedAttempts: 0,
  pendingAttemptReviews: 0,
  pendingGroupReviews: 0,
  wrongOptions: [],
  openHelpRequests: 0,
  timesMarkedUnresolved: 0,
  mostRequestedHintType: [],
  groupsByStatus: { draft: 0, submitted: 0, approved: 0, returned: 0 },
}
const tileLabels = [
  'Challenge attempts started',
  'Challenge attempts completed (approved)',
  'Diagnoses waiting for review',
  'Group projects waiting for review',
  'Help requests waiting for a mentor',
  "Times a mentor's answer was marked unresolved",
]

async function showSummary(fields) {
  getInsights.mockResolvedValue({
    data: {
      classroomId,
      pendingAppliedAttempts: [],
      pendingGroups: [],
      summary: { ...emptySummary, ...fields },
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/classrooms/:classroomId/review', component: ProfessorReviewView },
      // The page's back link resolves this route by name.
      { path: '/classrooms/:classroomId', name: 'classroom', component: { template: '<div />' } },
    ],
  })
  await router.push(`/classrooms/${classroomId}/review`)
  const wrapper = mount(ProfessorReviewView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper.get('[aria-labelledby="summary-heading"]')
}

// Each tile's label and number, read as a screen reader pairs them.
const tiles = (summary) =>
  summary
    .findAll('.le-tiles > .le-tile')
    .map((tile) => [tile.get('dt').text(), tile.get('dd').text()])
const bars = (question) =>
  question.findAll('.le-bar-row').map((row) => ({
    label: row.get('.le-bar-label').text(),
    width: row.get('.le-bar').attributes('style'),
    count: row.get('.le-bar-count').text(),
  }))

beforeEach(() => vi.resetAllMocks())
enableAutoUnmount(afterEach)

describe('summary tiles (G14)', () => {
  it('gives each of the six counts its own tile, in the G5 order and wording', async () => {
    const summary = await showSummary({
      startedAttempts: 3,
      completedAttempts: 1,
      pendingAttemptReviews: 2,
      pendingGroupReviews: 4,
      openHelpRequests: 5,
      timesMarkedUnresolved: 6,
    })
    expect(tiles(summary)).toEqual([
      [tileLabels[0], '3'],
      [tileLabels[1], '1'],
      [tileLabels[2], '2'],
      [tileLabels[3], '4'],
      [tileLabels[4], '5'],
      [tileLabels[5], '6'],
    ])
    // A dl, so screen readers pair each label with its number.
    expect(summary.get('.le-tiles').element.tagName).toBe('DL')
  })

  it('keeps all six tiles at 0 beside the zero-data sentence', async () => {
    const summary = await showSummary({})
    expect(summary.text()).toContain(
      'No attempts yet. Numbers appear once students start a challenge.',
    )
    expect(tiles(summary)).toEqual(tileLabels.map((label) => [label, '0']))
    expect(summary.text()).not.toContain('NaN')
  })

  it('keeps the hint kinds and group statuses as text rows, not tiles', async () => {
    const summary = await showSummary({
      mostRequestedHintType: ['Guiding question'],
      groupsByStatus: { draft: 1, submitted: 0, approved: 2, returned: 0 },
    })
    const rows = summary.get('.le-details')
    expect(rows.findAll('dt').map((dt) => dt.text())).toEqual([
      'Most requested kind of hint',
      'Groups by submission status',
    ])
    expect(rows.text()).toContain('Guiding question')
    expect(rows.text()).toContain('Draft 1 · Submitted 0 · Approved 2 · Returned 0')
  })
})

describe('wrong-option bars (G14)', () => {
  it('sizes counts 3 and 1 at 100% and about 33% of the biggest, with each count as text', async () => {
    const summary = await showSummary({
      startedAttempts: 4,
      wrongOptions: [
        {
          challengeTitle: 'Loops',
          questionPrompt: 'What does this print?',
          options: [
            { optionId: 'b', label: '4', count: 3 },
            { optionId: 'c', label: '6', count: 1 },
          ],
        },
      ],
    })
    const rows = bars(summary)
    expect(rows.map(({ label, count }) => [label, count])).toEqual([
      ['4', '3 times'],
      ['6', '1 times'],
    ])
    expect(rows[0].width).toBe('width: 100%;')
    expect(Number(rows[1].width.match(/[\d.]+/)[0])).toBeCloseTo(33.33, 1)
    // The bar is a picture of the count beside it, so screen readers skip it.
    for (const track of summary.findAll('.le-bar-track')) {
      expect(track.attributes('aria-hidden')).toBe('true')
    }
    expect(summary.text()).toContain('Times this option was chosen, including retries')
  })

  it('scales each question by its own biggest count', async () => {
    const summary = await showSummary({
      startedAttempts: 4,
      wrongOptions: [
        {
          challengeTitle: 'Loops',
          questionPrompt: 'What does this print?',
          options: [{ optionId: 'b', label: '4', count: 2 }],
        },
        {
          challengeTitle: 'Strings',
          questionPrompt: 'Output?',
          options: [
            { optionId: 'a', label: 'undefined', count: 10 },
            { optionId: 'd', label: 'null', count: 5 },
          ],
        },
      ],
    })
    const questions = summary.findAll('.le-bars')
    expect(bars(questions[0]).map((row) => row.width)).toEqual(['width: 100%;'])
    expect(bars(questions[1]).map((row) => row.width)).toEqual(['width: 100%;', 'width: 50%;'])
  })

  it('shows the zero sentence and no bars when nothing wrong was chosen', async () => {
    const summary = await showSummary({})
    expect(summary.text()).toContain('No wrong options chosen yet.')
    expect(summary.find('.le-bars').exists()).toBe(false)
  })
})
