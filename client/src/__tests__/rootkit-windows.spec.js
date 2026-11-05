import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import DesktopWindow from '../games/rootkit/DesktopWindow.vue'
import { useWindowManager } from '../games/rootkit/useWindowManager.js'

const wrappers = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

function mountManager() {
  let manager
  const wrapper = mount(
    defineComponent({
      setup() {
        manager = useWindowManager()
        return () => null
      },
    }),
  )
  wrappers.push(wrapper)
  return { manager, wrapper }
}
const app = (manager, id = 'terminal') => manager.windows.value.find((window) => window.id === id)
const geometry = ({ x, y, width, height }) => ({ x, y, width, height })

function pointerDown(overrides = {}) {
  const target = document.createElement('div')
  target.setPointerCapture = vi.fn()
  target.hasPointerCapture = vi.fn(() => true)
  target.releasePointerCapture = vi.fn()
  return {
    pointerId: 7,
    button: 0,
    isPrimary: true,
    clientX: 100,
    clientY: 100,
    target,
    currentTarget: target,
    cancelable: true,
    preventDefault: vi.fn(),
    ...overrides,
  }
}

function sendPointer(type, { pointerId = 7, clientX = 100, clientY = 100 } = {}) {
  const event = new Event(type, { cancelable: true })
  Object.assign(event, { pointerId, clientX, clientY })
  window.dispatchEvent(event)
}

describe('RootKit window management', () => {
  it('opens terminal and notes initially, and reopening an app restores it to the front', () => {
    const { manager } = mountManager()
    expect(
      manager.windows.value.filter((window) => window.open).map((window) => window.id),
    ).toEqual(['terminal', 'notes'])
    expect(manager.activeId.value).toBe('terminal')
    expect(manager.openWindow('sniffer')).toBe(true)
    expect(app(manager, 'sniffer').open).toBe(true)
    expect(manager.activeId.value).toBe('sniffer')
    const oldZ = app(manager, 'sniffer').z
    manager.openWindow('terminal')
    expect(app(manager).z).toBeGreaterThan(oldZ)
    expect(manager.openWindow('unknown')).toBe(false)
  })

  it('keeps activeId on a visible app when apps are minimized or closed', () => {
    const { manager } = mountManager()
    manager.minimizeWindow('terminal')
    expect(app(manager).open).toBe(true)
    expect(app(manager).minimized).toBe(true)
    expect(manager.activeId.value).toBe('notes')
    expect(manager.focusWindow('terminal')).toBe(false)
    manager.closeWindow('notes')
    expect(manager.activeId.value).toBeNull()
    manager.openWindow('terminal')
    expect(app(manager).minimized).toBe(false)
    expect(manager.activeId.value).toBe('terminal')
    manager.closeWindow('terminal')
    manager.openWindow('notes')
    expect(app(manager, 'notes').open).toBe(true)
    expect(manager.activeId.value).toBe('notes')
  })

  it('maximizes to the supplied window area, adapts to resize, and restores normal geometry', () => {
    const { manager } = mountManager()
    manager.setBounds(1200, 700)
    const normal = geometry(app(manager))
    manager.toggleMaximize('terminal')
    expect(geometry(app(manager))).toEqual({ x: 0, y: 0, width: 1200, height: 700 })
    manager.setBounds(600, 420)
    expect(geometry(app(manager))).toEqual({ x: 0, y: 0, width: 600, height: 420 })
    manager.toggleMaximize('terminal')
    expect(app(manager).maximized).toBe(false)
    expect(app(manager).x + app(manager).width).toBeLessThanOrEqual(600)
    expect(app(manager).y + app(manager).height).toBeLessThanOrEqual(420)
    manager.setBounds(1200, 700)
    expect(geometry(app(manager))).toEqual(normal)
  })

  it('fits all apps into a narrow desktop and restores their intended size when it grows', () => {
    const { manager } = mountManager()
    manager.setBounds(294, 500)
    for (const window of manager.windows.value) {
      expect(window.x).toBeGreaterThanOrEqual(0)
      expect(window.y).toBeGreaterThanOrEqual(0)
      expect(window.x + window.width).toBeLessThanOrEqual(294)
      expect(window.y + window.height).toBeLessThanOrEqual(500)
    }
    expect(app(manager).width).toBe(270)
    manager.setBounds(1200, 700)
    expect(app(manager).width).toBe(540)
    expect(app(manager, 'notes').width).toBe(285)
    expect(manager.setBounds(0, 0)).toBe(false)
    expect(manager.setBounds(Number.NaN, 500)).toBe(false)
    expect(app(manager).width).toBe(540)
  })

  it('moves windows by keyboard deltas, clamps every edge, and leaves maximized windows fixed', () => {
    const { manager } = mountManager()
    manager.setBounds(800, 500)
    manager.moveWindow('terminal', -10000, -10000)
    expect(geometry(app(manager))).toMatchObject({ x: 0, y: 0 })
    manager.moveWindow('terminal', 10000, 10000)
    expect(app(manager).x).toBe(800 - app(manager).width)
    expect(app(manager).y).toBe(500 - app(manager).height)
    manager.toggleMaximize('terminal')
    expect(manager.moveWindow('terminal', 12, 12)).toBe(false)
    expect(geometry(app(manager))).toEqual({ x: 0, y: 0, width: 800, height: 500 })
    expect(manager.moveWindow('missing', 12, 12)).toBe(false)
  })

  it('drags using the initiating pointer only and stops on pointer cancellation', () => {
    const { manager } = mountManager()
    manager.setBounds(800, 500)
    const down = pointerDown()
    expect(manager.startDrag('terminal', down)).toBe(true)
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(7)
    const initial = geometry(app(manager))
    sendPointer('pointermove', { pointerId: 99, clientX: 300, clientY: 300 })
    expect(geometry(app(manager))).toEqual(initial)
    sendPointer('pointermove', { clientX: 140, clientY: 130 })
    expect(app(manager).x).toBe(initial.x + 40)
    expect(app(manager).y).toBe(Math.min(initial.y + 30, 500 - initial.height))
    sendPointer('pointercancel')
    const cancelled = geometry(app(manager))
    expect(app(manager).dragging).toBe(false)
    sendPointer('pointermove', { clientX: 700, clientY: 700 })
    expect(geometry(app(manager))).toEqual(cancelled)
    expect(down.currentTarget.releasePointerCapture).toHaveBeenCalledWith(7)
  })

  it('rejects secondary pointers, interactive controls, hidden apps, and maximized windows', () => {
    const { manager } = mountManager()
    expect(manager.startDrag('terminal', pointerDown({ button: 2 }))).toBe(false)
    expect(manager.startDrag('terminal', pointerDown({ isPrimary: false }))).toBe(false)
    expect(
      manager.startDrag('terminal', pointerDown({ target: document.createElement('button') })),
    ).toBe(false)
    expect(
      manager.startDrag('terminal', pointerDown({ target: document.createElement('input') })),
    ).toBe(false)
    expect(manager.startDrag('monitor', pointerDown())).toBe(false)
    manager.toggleMaximize('terminal')
    expect(manager.startDrag('terminal', pointerDown())).toBe(false)
  })

  it('ends a drag when browser focus is lost, ignoring later moves from a released pointer', () => {
    const { manager } = mountManager()
    const remove = vi.spyOn(window, 'removeEventListener')
    const down = pointerDown()
    manager.startDrag('terminal', down)
    sendPointer('pointermove', { clientX: 130, clientY: 120 })
    const beforeBlur = geometry(app(manager))
    window.dispatchEvent(new Event('blur'))
    expect(app(manager).dragging).toBe(false)
    expect(down.currentTarget.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(remove).toHaveBeenCalledWith('blur', expect.any(Function))
    sendPointer('pointermove', { clientX: 600, clientY: 400 })
    expect(geometry(app(manager))).toEqual(beforeBlur)
  })

  it('keeps global dragging usable when native pointer capture is unavailable', () => {
    const { manager } = mountManager()
    const down = pointerDown()
    down.currentTarget.setPointerCapture.mockImplementation(() => {
      throw new Error('Capture unavailable')
    })
    down.currentTarget.hasPointerCapture.mockReturnValue(false)
    const initial = geometry(app(manager))
    expect(manager.startDrag('terminal', down)).toBe(true)
    sendPointer('pointermove', { clientX: 125, clientY: 115 })
    expect(app(manager).x).toBe(initial.x + 25)
    expect(app(manager).y).toBe(initial.y + 15)
    sendPointer('pointerup')
    expect(app(manager).dragging).toBe(false)
  })

  it('cancels a drag before responsive reflow and does not let stale moves escape the new bounds', () => {
    const { manager } = mountManager()
    manager.startDrag('terminal', pointerDown())
    manager.setBounds(294, 500)
    expect(app(manager).dragging).toBe(false)
    const resized = geometry(app(manager))
    sendPointer('pointermove', { clientX: 900, clientY: 900 })
    expect(geometry(app(manager))).toEqual(resized)
    expect(app(manager).x + app(manager).width).toBeLessThanOrEqual(294)
    expect(app(manager).y + app(manager).height).toBeLessThanOrEqual(500)
  })

  it('clamps a pointer drag to the desktop and removes native handlers on unmount', () => {
    const { manager, wrapper } = mountManager()
    const remove = vi.spyOn(window, 'removeEventListener')
    manager.setBounds(800, 500)
    manager.startDrag('terminal', pointerDown())
    sendPointer('pointermove', { clientX: 10000, clientY: -10000 })
    expect(app(manager).x).toBe(800 - app(manager).width)
    expect(app(manager).y).toBe(0)
    const final = geometry(app(manager))
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('pointerup', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('pointercancel', expect.any(Function))
    sendPointer('pointermove', { clientX: -500, clientY: -500 })
    expect(geometry(app(manager))).toEqual(final)
  })

  it('resets window state and keeps focus ordering bounded after prolonged use', () => {
    const { manager } = mountManager()
    for (let index = 0; index < 10020; index += 1) manager.focusWindow('terminal')
    expect(Math.max(...manager.windows.value.map((window) => window.z))).toBeLessThan(10000)
    expect(app(manager).z).toBeGreaterThan(app(manager, 'notes').z)
    manager.closeWindow('notes')
    manager.openWindow('monitor')
    manager.toggleMaximize('terminal')
    manager.resetWindows()
    expect(app(manager).maximized).toBe(false)
    expect(app(manager, 'notes').open).toBe(true)
    expect(app(manager, 'monitor').open).toBe(false)
    expect(manager.activeId.value).toBe('terminal')
  })
})

describe('RootKit desktop window shell', () => {
  function mountWindow(overrides = {}) {
    const wrapper = mount(DesktopWindow, {
      props: {
        window: {
          id: 'terminal',
          title: 'bash_terminal.exe',
          x: 100,
          y: 90,
          width: 540,
          height: 360,
          z: 12,
          maximized: false,
          ...overrides,
        },
        active: true,
      },
      slots: { default: '<p>Terminal content</p>' },
    })
    wrappers.push(wrapper)
    return wrapper
  }

  it('provides a named nonmodal region, native window controls, geometry, and slotted content', async () => {
    const wrapper = mountWindow({ dockDx: -42, dockDy: 180 })
    expect(wrapper.attributes('role')).toBe('region')
    expect(wrapper.attributes('aria-label')).toBe('bash_terminal.exe')
    expect(wrapper.attributes('data-window-id')).toBe('terminal')
    expect(wrapper.get('h3').text()).toBe('bash_terminal.exe')
    expect(wrapper.get('.window-body').text()).toBe('Terminal content')
    expect(wrapper.element.style.left).toBe('100px')
    expect(wrapper.element.style.getPropertyValue('--rk-dock-dx')).toBe('-42px')
    expect(wrapper.element.style.getPropertyValue('--rk-dock-dy')).toBe('180px')
    await wrapper.get('button[aria-label="Minimize bash_terminal.exe"]').trigger('click')
    await wrapper.get('button[aria-label="Maximize bash_terminal.exe"]').trigger('click')
    await wrapper.get('button[aria-label="Close bash_terminal.exe"]').trigger('click')
    expect(wrapper.emitted('minimize')).toHaveLength(1)
    expect(wrapper.emitted('maximize')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('offers focused-header arrow movement without hijacking the native buttons', async () => {
    const wrapper = mountWindow()
    const header = wrapper.get('.window-titlebar')
    expect(header.attributes('tabindex')).toBe('0')
    await header.trigger('keydown', { key: 'ArrowLeft' })
    await header.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(wrapper.emitted('move')).toEqual([
      [-12, 0],
      [0, -32],
    ])
    await wrapper.get('button').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('move')).toHaveLength(2)
    await wrapper.setProps({ window: { ...wrapper.props('window'), maximized: true } })
    await header.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('move')).toHaveLength(2)
    expect(wrapper.get('button[aria-label="Restore bash_terminal.exe"]').exists()).toBe(true)
  })
})
