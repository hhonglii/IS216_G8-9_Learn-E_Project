import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import AppAlert from '../components/shared/AppAlert.vue'
import AppLoading from '../components/shared/AppLoading.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import QuestionRenderer from '../components/challenges/QuestionRenderer.vue'
import PredictOutputQuestion from '../components/challenges/PredictOutputQuestion.vue'
import LocateFaultQuestion from '../components/challenges/LocateFaultQuestion.vue'
import RepairOrderQuestion from '../components/challenges/RepairOrderQuestion.vue'
import AppliedCaseForm from '../components/challenges/AppliedCaseForm.vue'
import ChallengeProgress from '../components/challenges/ChallengeProgress.vue'
import ClassroomCard from '../components/classrooms/ClassroomCard.vue'
import { defaultCover } from '../config/covers.js'
import { iconPaths } from '../config/icons.js'
import JoinClassroomForm from '../components/classrooms/JoinClassroomForm.vue'
import HelpRequestCard from '../components/mentoring/HelpRequestCard.vue'
import HelpRequestForm from '../components/mentoring/HelpRequestForm.vue'
import LeaderboardTable from '../components/mentoring/LeaderboardTable.vue'
import GroupBrowser from '../components/projects/GroupBrowser.vue'
import GroupTaskList from '../components/projects/GroupTaskList.vue'
import ProjectStagePanel from '../components/projects/ProjectStagePanel.vue'
import GitHubRepositoryPanel from '../components/github/GitHubRepositoryPanel.vue'

const components = [
  AppAlert,
  AppLoading,
  EmptyState,
  QuestionRenderer,
  PredictOutputQuestion,
  LocateFaultQuestion,
  RepairOrderQuestion,
  AppliedCaseForm,
  ChallengeProgress,
  ClassroomCard,
  JoinClassroomForm,
  HelpRequestCard,
  HelpRequestForm,
  LeaderboardTable,
  GroupBrowser,
  GroupTaskList,
  ProjectStagePanel,
  GitHubRepositoryPanel,
]
afterEach(() => vi.restoreAllMocks())
it.each(components.map((component) => [component.__name, component]))(
  'mounts %s with its default props and no Vue warnings',
  (name, component) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(component, { global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(wrapper.html()).not.toBe('')
    expect(warn).not.toHaveBeenCalled()
  },
)

// H3 Step 3 repair-order tests.
describe('repair order buttons', () => {
  const steps = [
    { id: 's1', label: 'Read the error' },
    { id: 's2', label: 'Find the loop' },
    { id: 's3' },
  ]
  const mountOrder = (modelValue) =>
    mount(RepairOrderQuestion, { props: { question: { options: steps }, modelValue } })
  const button = (wrapper, name) => wrapper.findAll('button').find((b) => b.text() === name)
  const rows = (wrapper) => wrapper.findAll('li').map((li) => li.text().split('Move up')[0].trim())

  it('sends the starting order when nothing has been chosen, so Submit works untouched', () => {
    const wrapper = mountOrder(undefined)
    expect(rows(wrapper)).toEqual(['Read the error', 'Find the loop', 's3'])
    expect(wrapper.emitted('update:modelValue')).toEqual([[['s1', 's2', 's3']]])
  })

  it('shows a chosen order as it is and does not send it again', () => {
    const wrapper = mountOrder(['s3', 's1', 's2'])
    expect(rows(wrapper)).toEqual(['s3', 'Read the error', 'Find the loop'])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('swaps a step with its neighbour and leaves the old order untouched', async () => {
    const chosen = ['s1', 's2', 's3']
    const wrapper = mountOrder(chosen)
    await button(wrapper, 'Move down: Read the error').trigger('click')
    await button(wrapper, 'Move up: s3').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([
      [['s2', 's1', 's3']],
      [['s1', 's3', 's2']],
    ])
    expect(chosen).toEqual(['s1', 's2', 's3'])
  })

  it('names each button after its step and marks the moves off either end', () => {
    const wrapper = mountOrder(['s1', 's2', 's3'])
    const buttons = wrapper.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual([
      'Move up: Read the error',
      'Move down: Read the error',
      'Move up: Find the loop',
      'Move down: Find the loop',
      'Move up: s3',
      'Move down: s3',
    ])
    expect(buttons.map((b) => b.attributes('type'))).toEqual(Array(6).fill('button'))
    // H5 Step 2: aria-disabled, not disabled, so a button keeps focus after its
    // step reaches either end.
    expect(buttons.map((b) => b.attributes('aria-disabled'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'true',
    ])
    expect(buttons.some((b) => b.attributes('disabled') !== undefined)).toBe(false)
  })

  it('does nothing when a move off either end is pressed', async () => {
    const wrapper = mountOrder(['s1', 's2', 's3'])
    await button(wrapper, 'Move up: Read the error').trigger('click')
    await button(wrapper, 'Move down: s3').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(rows(wrapper)).toEqual(['Read the error', 'Find the loop', 's3'])
  })
})

it('emits a trimmed join code without contacting the server', async () => {
  const wrapper = mount(JoinClassroomForm)
  await wrapper.get('input').setValue('  CLASS42  ')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('join')).toEqual([['CLASS42']])
})
it('emits question help with only the question and the hint choice (H-14)', async () => {
  const wrapper = mount(HelpRequestForm, {
    props: { kind: 'question', contextId: 'c1', questionId: 'q2' },
  })
  expect(wrapper.findAll('textarea')).toHaveLength(0)
  await wrapper.get('input[value="Concept reminder"]').setValue(true)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('submit')[0][0]).toEqual({
    contextType: 'challenge',
    contextId: 'c1',
    questionId: 'q2',
    hintType: 'Concept reminder',
  })
})
it('emits general class help with the snippet, both behaviors and the hint (H-14)', async () => {
  const wrapper = mount(HelpRequestForm, { props: { kind: 'general', contextId: 'room1' } })
  const inputs = wrapper.findAll('textarea')
  expect(inputs).toHaveLength(3)
  for (const [index, input] of inputs.entries()) {
    expect(input.attributes('required')).toBeDefined()
    await input.setValue(['let x', 'expected', 'actual'][index])
  }
  await wrapper.get('input[value="Repair-direction hint"]').setValue(true)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('submit')[0][0]).toEqual({
    contextType: 'classroom',
    contextId: 'room1',
    codeSnippet: 'let x',
    expectedBehaviour: 'expected',
    actualBehaviour: 'actual',
    hintType: 'Repair-direction hint',
  })
})
it('shows every hint type with its description, none chosen and one required (H-14)', () => {
  const wrapper = mount(HelpRequestForm, { props: { contextId: 'c1', questionId: 'q1' } })
  const radios = wrapper.findAll('input[type="radio"]')
  expect(radios.map((radio) => radio.attributes('value'))).toEqual([
    'Guiding question',
    'Concept reminder',
    'Fault-location clue',
    'Repair-direction hint',
  ])
  expect(radios.every((radio) => !radio.element.checked)).toBe(true)
  expect(radios[0].attributes('required')).toBeDefined()
  expect(wrapper.find('.le-infotip').exists()).toBe(false)
  for (const label of wrapper.findAll('.form-check-label'))
    expect(label.get('.form-text').text().length).toBeGreaterThan(20)
})
it('labels each stage evidence box with its own stage name', () => {
  const wrapper = mount(ProjectStagePanel, { props: { stage: 'Repair' } })
  const label = wrapper.get('label')
  expect(label.text()).toBe('Repair evidence')
  expect(wrapper.get('textarea').attributes('id')).toBe(label.attributes('for'))
  expect(wrapper.get('textarea').attributes('aria-describedby')).toBeUndefined()
})
// UX audit item 8: the stage's instruction is the hint under its box.
it("shows the stage's instruction under its evidence box and links it", () => {
  const wrapper = mount(ProjectStagePanel, {
    props: { stage: 'Verify', instruction: 'Show a test that fails before and passes after.' },
  })
  const hint = wrapper.get('#stage-instruction-Verify')
  expect(hint.text()).toBe('Show a test that fails before and passes after.')
  expect(wrapper.get('textarea').attributes('aria-describedby')).toBe('stage-instruction-Verify')
})
it('preserves cached repository data when refresh fails', async () => {
  const wrapper = mount(GitHubRepositoryPanel, {
    props: {
      repository: { name: 'cached-repo', description: 'Last good snapshot' },
      commits: [{ sha: 'abc', message: 'Cached commit', author: 'Student', date: '2026-09-06' }],
      error: 'Refresh failed',
      lastRefreshedAt: '2026-09-06',
    },
  })
  expect(wrapper.text()).toContain('cached-repo')
  expect(wrapper.text()).toContain('Cached commit')
  expect(wrapper.text()).toContain('Refresh failed')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('refresh')).toHaveLength(1)
})
// F7 contributors tests.
it('says contributors were not retrieved for a snapshot saved without them', () => {
  const wrapper = mount(GitHubRepositoryPanel, {
    props: { repository: { name: 'old-snapshot' }, commits: [] },
  })
  expect(wrapper.text()).toContain('Not retrieved yet')
  expect(wrapper.text()).not.toContain('No contributors yet')
})
it('tells an empty contributors list apart from a missing one', () => {
  const wrapper = mount(GitHubRepositoryPanel, {
    props: { repository: { name: 'empty-repo' }, commits: [], contributors: [] },
  })
  expect(wrapper.text()).toContain('No contributors yet')
  expect(wrapper.text()).not.toContain('Not retrieved yet')
})
it('lists contributors as GitHub links with counts, labelled as activity not a score', () => {
  const wrapper = mount(GitHubRepositoryPanel, {
    props: {
      repository: { name: 'demo' },
      commits: [],
      contributors: [
        { login: 'alice', commits: 12, url: 'https://github.com/alice' },
        { login: 'bob', commits: 3, url: 'https://github.com/bob' },
      ],
    },
  })
  const links = wrapper.findAll('a')
  expect(links.map((link) => link.text())).toEqual(['alice', 'bob'])
  expect(links[0].attributes('href')).toBe('https://github.com/alice')
  expect(links[0].attributes('rel')).toContain('noopener')
  expect(wrapper.text()).toContain('12')
  expect(wrapper.text()).toMatch(/reported by GitHub/i)
  expect(wrapper.text()).toMatch(/not a measure/i)
})
it('keeps cached contributors visible when a refresh fails', () => {
  const wrapper = mount(GitHubRepositoryPanel, {
    props: {
      repository: { name: 'cached-repo' },
      commits: [],
      contributors: [{ login: 'alice', commits: 12, url: 'https://github.com/alice' }],
      error: 'Refresh failed',
    },
  })
  expect(wrapper.text()).toContain('Refresh failed')
  expect(wrapper.get('a').text()).toBe('alice')
})
it('renders untrusted classroom text without interpreting markup', () => {
  const wrapper = mount(ClassroomCard, {
    props: { classroom: { id: 'c1', name: '<img src=x onerror=alert(1)>', description: 'test' } },
  })
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toContain('<img')
})
it('shows the default cover as a decorative background, never an img', () => {
  const wrapper = mount(ClassroomCard, {
    props: { classroom: { id: 'c1', name: 'Loops', description: 'Week 3' } },
  })
  const cover = wrapper.get('.le-cover')
  expect(cover.attributes('aria-hidden')).toBe('true')
  expect(cover.get('.le-cover-art').attributes('style')).toContain(defaultCover.file)
  expect(wrapper.find('img').exists()).toBe(false)
})
it("shows the classroom's chosen cover, or the default for an unknown id (G-10)", () => {
  const chosen = mount(ClassroomCard, {
    props: { classroom: { id: 'c1', name: 'Loops', coverId: 'teal-nodes' } },
  })
  expect(chosen.get('.le-cover-art').attributes('style')).toContain('/covers/teal-nodes.svg')
  const unknown = mount(ClassroomCard, {
    props: { classroom: { id: 'c2', name: 'Arrays', coverId: 'purple-stars' } },
  })
  expect(unknown.get('.le-cover-art').attributes('style')).toContain(defaultCover.file)
})
it('makes the whole card one click target that opens the classroom once', async () => {
  const wrapper = mount(ClassroomCard, { props: { classroom: { id: 'c1', name: 'Loops' } } })
  const buttons = wrapper.findAll('button')
  expect(buttons).toHaveLength(1)
  expect(buttons[0].classes()).toContain('stretched-link')
  await buttons[0].trigger('click')
  expect(wrapper.emitted('open')).toEqual([['c1']])
})
it('shows the join code chip only when the classroom has a code', () => {
  const withCode = mount(ClassroomCard, {
    props: { classroom: { id: 'c1', name: 'Loops', joinCode: 'ABC123' } },
  })
  const withoutCode = mount(ClassroomCard, { props: { classroom: { id: 'c2', name: 'Arrays' } } })
  expect(withCode.get('.le-chip').text()).toContain('ABC123')
  expect(withoutCode.find('.le-chip').exists()).toBe(false)
})

// UI refresh 3: the shared parts keep their roles and text.
describe('shared parts after UI refresh 3', () => {
  it.each([
    ['success', 'check'],
    ['danger', 'warning'],
    ['warning', 'warning'],
    ['info', 'info'],
  ])('AppAlert %s shows the %s icon, hidden, beside its message', (variant, icon) => {
    const alert = mount(AppAlert, { props: { variant, message: 'Saved.' } }).get('[role="alert"]')
    expect(alert.get('.le-alert-text').text()).toBe('Saved.')
    expect(alert.get('svg').attributes('aria-hidden')).toBe('true')
    expect(alert.findAll('path').map((p) => p.attributes('d'))).toEqual(iconPaths[icon])
  })

  it('AppAlert emits dismiss from its close button', async () => {
    const wrapper = mount(AppAlert, { props: { variant: 'danger', message: 'Failed.' } })
    await wrapper.get('button[aria-label="Dismiss alert"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  // AppAlert always shows its close button, so a page that ignores dismiss shows
  // an X that does nothing (the login page did until 2026-11-05).
  it('every AppAlert in the app handles dismiss', () => {
    const src = resolve(process.cwd(), 'src')
    const missing = readdirSync(src, { recursive: true })
      .filter((file) => file.endsWith('.vue'))
      .flatMap((file) =>
        (readFileSync(resolve(src, file), 'utf8').match(/<AppAlert\b[^>]*>/g) ?? [])
          .filter((tag) => !tag.includes('@dismiss'))
          .map((tag) => `${file}: ${tag.replace(/\s+/g, ' ')}`),
      )
    expect(missing).toEqual([])
  })

  it('AppLoading keeps one status with its label, and hides the bars', () => {
    const wrapper = mount(AppLoading, { props: { label: 'Loading classroom' } })
    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
    expect(wrapper.get('[role="status"]').text()).toBe('Loading classroom')
    expect(wrapper.get('.le-skeleton').attributes('aria-hidden')).toBe('true')
  })
})
