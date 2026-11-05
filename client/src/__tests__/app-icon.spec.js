// Tests for the UI refresh 3 icon.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from '../components/shared/AppIcon.vue'
import { iconPaths } from '../config/icons.js'
import { navigation, classroomNavigation } from '../config/navigation.js'

describe('AppIcon', () => {
  it('draws a known icon from its paths, hidden from screen readers', () => {
    const svg = mount(AppIcon, { props: { name: 'dashboard' } }).get('svg')
    expect(svg.classes()).toContain('le-icon')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')
    expect(svg.attributes('viewBox')).toBe('0 0 16 16')
    expect(svg.findAll('path').map((path) => path.attributes('d'))).toEqual(iconPaths.dashboard)
  })

  // toString and __proto__ exist on every object, so a plain lookup would find them.
  it.each(['no-such-icon', '', 'toString', '__proto__'])('draws nothing for %j', (name) => {
    const wrapper = mount(AppIcon, { props: { name } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  // Names the broken icons on failure, since the linter allows no message argument.
  it('has at least one non-empty path for every icon', () => {
    const broken = Object.entries(iconPaths)
      .filter(([, paths]) => paths.length === 0 || paths.some((d) => !/^M\S/.test(d)))
      .map(([name]) => name)
    expect(broken).toEqual([])
  })
})

describe('navigation icons', () => {
  it.each([...navigation, ...classroomNavigation('c1')].map((item) => [item.label, item.icon]))(
    '%s has an icon AppIcon can draw (%s)',
    (label, icon) => {
      expect(Object.hasOwn(iconPaths, icon)).toBe(true)
    },
  )
})
