// Tests for G9 (decision G-9): UserAvatar and its use in the mentoring components.
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from '../components/shared/UserAvatar.vue'
import LeaderboardTable from '../components/mentoring/LeaderboardTable.vue'
import HelpRequestCard from '../components/mentoring/HelpRequestCard.vue'

const aliceId = '507f1f77bcf86cd799439101'
const bobId = '507f1f77bcf86cd799439102'
const dicebear = (seed) => `https://api.dicebear.com/10.x/thumbs/svg?seed=${seed}`

const avatar = (props) =>
  mount(UserAvatar, { props: { userId: aliceId, displayName: 'Alice', ...props } })

describe('UserAvatar (G9)', () => {
  it('asks the pinned DiceBear thumbs style for a picture seeded by the user id', () => {
    const img = avatar().find('img')
    expect(img.attributes('src')).toBe(dicebear(aliceId))
    // The name is printed beside every avatar, so the picture is not read out.
    expect(img.attributes('alt')).toBe('')
  })

  it('encodes the id, so a seed with spaces or & stays one seed', () => {
    expect(avatar({ userId: 'a b&c' }).find('img').attributes('src')).toBe(dicebear('a%20b%26c'))
  })

  it('gives the same id the same picture and a different id a different one', () => {
    const first = avatar().find('img').attributes('src')
    const again = avatar({ displayName: 'Alice Tan' }).find('img').attributes('src')
    const bob = avatar({ userId: bobId, displayName: 'Alice' }).find('img').attributes('src')
    // Seeded by id: a new name keeps the picture, a shared name does not borrow it.
    expect(again).toBe(first)
    expect(bob).not.toBe(first)
  })

  it('is 2.5rem unless a size is given', () => {
    expect(avatar().find('img').attributes('style')).toBe('width: 2.5rem; height: 2.5rem;')
    expect(avatar({ size: '4rem' }).find('img').attributes('style')).toBe(
      'width: 4rem; height: 4rem;',
    )
  })

  it.each([
    ['Alice', 'A'],
    ['Heng Hong Li', 'HH'],
    ['  heng hong li ', 'HH'],
    ['bob tan', 'BT'],
    ['', ''],
  ])('shows initials for %j when the picture fails to load', async (displayName, initials) => {
    const wrapper = avatar({ displayName, size: '4rem' })
    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    const fallback = wrapper.find('span')
    expect(fallback.text()).toBe(initials)
    expect(fallback.classes()).toContain('le-person-icon')
    expect(fallback.attributes('aria-hidden')).toBe('true')
    expect(fallback.attributes('style')).toBe('width: 4rem; height: 4rem;')
  })
})

describe('avatars in the mentoring components (G9)', () => {
  it('puts each leaderboard picture beside its name and keeps the points column', () => {
    const wrapper = mount(LeaderboardTable, {
      props: {
        entries: [
          { userId: aliceId, displayName: 'Alice', contributionPoints: 12 },
          { userId: bobId, displayName: 'Bob', contributionPoints: 5 },
        ],
      },
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows.map((row) => row.findAll('td').map((cell) => cell.text()))).toEqual([
      ['Alice', '12'],
      ['Bob', '5'],
    ])
    expect(rows.map((row) => row.find('.le-person img').attributes('src'))).toEqual([
      dicebear(aliceId),
      dicebear(bobId),
    ])
    // The picture and the name share the le-person row, so they sit side by side.
    expect(rows.map((row) => row.find('.le-person').text())).toEqual(['Alice', 'Bob'])
  })

  it('gives a deleted student (null id) no picture rather than a shared "null" one', () => {
    const wrapper = mount(LeaderboardTable, {
      props: { entries: [{ userId: null, displayName: 'Unknown student', contributionPoints: 3 }] },
    })
    const cells = wrapper.findAll('tbody td')
    expect(cells.map((cell) => cell.text())).toEqual(['Unknown student', '3'])
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('seeds the help request picture by the requester, not the request', () => {
    const wrapper = mount(HelpRequestCard, {
      props: {
        request: {
          id: '507f1f77bcf86cd799439120',
          status: 'open',
          hintType: 'Concept',
          actualBehaviour: 'It prints 11.',
          requesterId: aliceId,
          requesterName: 'Alice',
        },
      },
    })
    expect(wrapper.find('.le-person img').attributes('src')).toBe(dicebear(aliceId))
    expect(wrapper.find('.le-person-name').text()).toBe('Alice')
  })
})
