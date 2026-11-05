// Decision H-16: names link to profiles, students see who runs the classroom, a
// professor's profile shows only their classrooms, and the game's Language box
// suggests languages. APIs are mocked.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProfileView from '../views/ProfileView.vue'
import ClassroomView from '../views/ClassroomView.vue'
import LeaderboardTable from '../components/mentoring/LeaderboardTable.vue'
import HelpRequestCard from '../components/mentoring/HelpRequestCard.vue'
import GroupTaskList from '../components/projects/GroupTaskList.vue'
import QuestionGeneratePanel from '../components/classroom-games/QuestionGeneratePanel.vue'
import { getProfile } from '../services/usersApi.js'
import { getClassroom, getLeaderboard } from '../services/classroomsApi.js'
import { commonLanguages, languageHint } from '../config/languages.js'
import { useCurrentUser } from '../composables/useCurrentUser.js'
vi.mock('../services/usersApi.js', () => ({
  getProfile: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
}))
vi.mock('../services/classroomsApi.js', () => ({
  getClassroom: vi.fn(),
  getLeaderboard: vi.fn(),
  leaveClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
}))

const profId = '507f1f77bcf86cd799439501'
const aliceId = '507f1f77bcf86cd799439502'
const bobId = '507f1f77bcf86cd799439503'
const classroomId = '507f1f77bcf86cd799439504'
const { currentUser } = useCurrentUser()
afterEach(() => {
  currentUser.value = null
  vi.resetAllMocks()
})
enableAutoUnmount(afterEach)

const blank = { template: '<p />' }
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: blank },
      { path: '/profiles/:userId', name: 'profile', component: ProfileView },
      { path: '/classrooms/:classroomId', name: 'classroom', component: ClassroomView },
      { path: '/classrooms/:classroomId/review', name: 'professor-review', component: blank },
      { path: '/classrooms/:classroomId/games', name: 'classroom-games', component: blank },
      { path: '/challenges/:challengeId', name: 'challenge', component: blank },
      { path: '/mini-projects/:miniProjectId', name: 'mini-project', component: blank },
    ],
  })
}
async function mountWithRouter(component, path, options = {}) {
  const router = makeRouter()
  await router.push(path)
  const wrapper = mount(component, { ...options, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const profileHref = (id) => `/profiles/${id}`

describe('profiles by role', () => {
  const profile = (role) => ({
    data: {
      id: role === 'professor' ? profId : aliceId,
      displayName: role === 'professor' ? 'Prof Tan' : 'Alice',
      role,
      helpfulCount: 0,
      milestones: [],
      nextMilestone: null,
      classrooms: [{ id: classroomId, name: 'IS216 G10', contributionPoints: 0 }],
      completedChallenges: [],
      projects: [],
    },
  })
  const headings = (wrapper) => wrapper.findAll('h2').map((h2) => h2.text())

  it("shows only the classrooms on a professor's profile, without points", async () => {
    currentUser.value = { id: aliceId, role: 'student', displayName: 'Alice' }
    getProfile.mockResolvedValue(profile('professor'))
    const wrapper = await mountWithRouter(ProfileView, profileHref(profId))
    expect(headings(wrapper)).toEqual(['Classrooms'])
    expect(wrapper.text()).not.toContain('points')
    expect(
      wrapper.get('section[aria-labelledby="profile-classrooms-heading"]').element.parentElement
        .className,
    ).toBe('col-12')
  })

  it("keeps the mentoring, challenge and group cards on a student's profile", async () => {
    currentUser.value = { id: bobId, role: 'student', displayName: 'Bob' }
    getProfile.mockResolvedValue(profile('student'))
    const wrapper = await mountWithRouter(ProfileView, profileHref(aliceId))
    expect(headings(wrapper)).toEqual([
      'Mentoring contributions',
      'Classrooms',
      'Completed challenges',
      'Project groups',
    ])
    expect(wrapper.text()).toContain('0 points')
  })
})

describe('the professor on the classroom page', () => {
  const reply = (owner) => ({
    data: {
      id: classroomId,
      name: 'IS216 G10',
      description: '',
      professorId: profId,
      professorName: 'Prof Tan',
      ...(owner ? { joinCode: 'ABC234' } : {}),
      challenges: [],
      miniProjects: [],
    },
  })

  it('names the professor for a student and links to their profile', async () => {
    currentUser.value = { id: aliceId, role: 'student', displayName: 'Alice' }
    getClassroom.mockResolvedValue(reply(false))
    getLeaderboard.mockResolvedValue({ data: [] })
    const wrapper = await mountWithRouter(ClassroomView, `/classrooms/${classroomId}`)
    const link = wrapper.findAll('a').find((a) => a.text() === 'Prof Tan')
    expect(link.attributes('href')).toBe(profileHref(profId))
    expect(link.element.parentElement.textContent).toContain('Professor:')
  })

  it('leaves the line out for the owning professor, who sees the join code instead', async () => {
    currentUser.value = { id: profId, role: 'professor', displayName: 'Prof Tan' }
    getClassroom.mockResolvedValue(reply(true))
    getLeaderboard.mockResolvedValue({ data: [] })
    const wrapper = await mountWithRouter(ClassroomView, `/classrooms/${classroomId}`)
    expect(wrapper.text()).not.toContain('Professor:')
  })
})

describe('names that link to profiles', () => {
  it('links each leaderboard name, and leaves a deleted account as plain text', async () => {
    const wrapper = await mountWithRouter(LeaderboardTable, '/', {
      props: {
        entries: [
          { userId: aliceId, displayName: 'Alice', contributionPoints: 3 },
          { userId: null, displayName: 'Unknown student', contributionPoints: 0 },
        ],
      },
    })
    const links = wrapper.findAll('a')
    expect(links.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Alice', profileHref(aliceId)],
    ])
    expect(wrapper.text()).toContain('Unknown student')
  })

  it("links the asker's name on a help request card", async () => {
    const wrapper = await mountWithRouter(HelpRequestCard, '/', {
      props: { request: { id: 'r1', status: 'open', requesterId: bobId, requesterName: 'Bob' } },
    })
    const link = wrapper.findAll('a').find((a) => a.text() === 'Bob')
    expect(link.attributes('href')).toBe(profileHref(bobId))
  })

  it("links each group member's chip", async () => {
    const wrapper = await mountWithRouter(GroupTaskList, '/', {
      props: {
        members: [
          { id: aliceId, displayName: 'Alice' },
          { id: bobId, displayName: 'Bob' },
        ],
      },
    })
    expect(wrapper.findAll('a.le-chip').map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Alice', profileHref(aliceId)],
      ['Bob', profileHref(bobId)],
    ])
  })
})

describe("the game's Language box", () => {
  it('suggests the common languages and says how to pick one', () => {
    const wrapper = mount(QuestionGeneratePanel, {
      props: { classroomId, spaceLeft: 5, errorMessage: () => '' },
    })
    const input = wrapper.get('#game-language')
    expect(input.attributes('list')).toBe('game-language-options')
    expect(
      wrapper.findAll('#game-language-options option').map((o) => o.attributes('value')),
    ).toEqual(commonLanguages)
    expect(wrapper.get(`#${input.attributes('aria-describedby')}`).text()).toBe(languageHint)
  })
})
