import { onBeforeUnmount, ref } from 'vue'

const DEFINITIONS = [
  {
    id: 'terminal',
    title: 'bash_terminal.exe',
    width: 540,
    height: 400,
    rx: 100 / 960,
    ry: 90 / 620,
    open: true,
    z: 12,
  },
  {
    id: 'notes',
    title: 'sticky_notes.app',
    width: 285,
    height: 500,
    rx: 690 / 960,
    ry: 60 / 620,
    open: true,
    z: 11,
  },
  {
    id: 'sniffer',
    title: 'net_sniffer.app',
    width: 480,
    height: 440,
    rx: 0.27,
    ry: 0.24,
    open: false,
    z: 10,
  },
  {
    id: 'monitor',
    title: 'sys_monitor.app',
    width: 350,
    height: 420,
    rx: 0.58,
    ry: 0.46,
    open: false,
    z: 10,
  },
]
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

export function useWindowManager() {
  const windows = ref([])
  const activeId = ref(null)
  // Keep preferred geometry separately so a narrow viewport does not permanently shrink apps.
  const normalGeometry = new Map()
  let bounds = { width: 960, height: 620 }
  let nextZ = 12
  let drag = null

  const findWindow = (id) => windows.value.find((window) => window.id === id)
  const isVisible = (window) => window?.open && !window.minimized

  function fitNormal(window) {
    const saved = normalGeometry.get(window.id)
    window.width = Math.min(saved.width, Math.max(1, bounds.width - 24))
    window.height = Math.min(saved.height, Math.max(1, bounds.height - 24))
    window.x = clamp((saved.x / saved.boundsWidth) * bounds.width, 0, bounds.width - window.width)
    window.y = clamp(
      (saved.y / saved.boundsHeight) * bounds.height,
      0,
      bounds.height - window.height,
    )
  }

  function fitMaximized(window) {
    Object.assign(window, { x: 0, y: 0, width: bounds.width, height: bounds.height })
  }

  function chooseActive() {
    activeId.value =
      windows.value.filter(isVisible).sort((first, second) => second.z - first.z)[0]?.id ?? null
  }

  function focusWindow(id) {
    const window = findWindow(id)
    if (!isVisible(window)) return false
    if (nextZ >= 10000) {
      const ordered = [...windows.value].sort((first, second) => first.z - second.z)
      ordered.forEach((entry, index) => {
        entry.z = 10 + index
      })
      nextZ = 10 + ordered.length
    }
    window.z = ++nextZ
    activeId.value = id
    return true
  }

  function stopDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return
    const previous = drag
    drag = null
    const window = findWindow(previous.id)
    if (window) window.dragging = false
    globalThis.window?.removeEventListener('pointermove', dragMove)
    globalThis.window?.removeEventListener('pointerup', stopDrag)
    globalThis.window?.removeEventListener('pointercancel', stopDrag)
    globalThis.window?.removeEventListener('lostpointercapture', stopDrag)
    globalThis.window?.removeEventListener('blur', cancelDrag)
    try {
      if (previous.target?.hasPointerCapture?.(previous.pointerId)) {
        previous.target.releasePointerCapture(previous.pointerId)
      }
    } catch {
      // The capture can already have ended when a window closes mid-gesture.
    }
  }

  function cancelDrag() {
    // Alt-Tab can release a mouse outside this window without delivering pointerup here.
    stopDrag()
  }

  function rememberPosition(window) {
    const saved = normalGeometry.get(window.id)
    normalGeometry.set(window.id, {
      ...saved,
      x: window.x,
      y: window.y,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
    })
  }

  function dragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    const window = findWindow(drag.id)
    if (!isVisible(window)) {
      stopDrag()
      return
    }
    window.x = clamp(drag.x + event.clientX - drag.clientX, 0, bounds.width - window.width)
    window.y = clamp(drag.y + event.clientY - drag.clientY, 0, bounds.height - window.height)
    rememberPosition(window)
    if (event.cancelable) event.preventDefault()
  }

  function openWindow(id) {
    const window = findWindow(id)
    if (!window) return false
    window.open = true
    window.minimized = false
    return focusWindow(id)
  }

  function closeWindow(id) {
    const window = findWindow(id)
    if (!window) return false
    if (drag?.id === id) stopDrag()
    window.open = false
    window.minimized = false
    if (activeId.value === id) chooseActive()
    return true
  }

  function minimizeWindow(id) {
    const window = findWindow(id)
    if (!isVisible(window)) return false
    if (drag?.id === id) stopDrag()
    window.minimized = true
    if (activeId.value === id) chooseActive()
    return true
  }

  function toggleMaximize(id) {
    const window = findWindow(id)
    if (!isVisible(window)) return false
    if (drag?.id === id) stopDrag()
    window.maximized = !window.maximized
    if (window.maximized) fitMaximized(window)
    else fitNormal(window)
    focusWindow(id)
    return true
  }

  function moveWindow(id, dx, dy) {
    const window = findWindow(id)
    if (!isVisible(window) || window.maximized || !Number.isFinite(dx) || !Number.isFinite(dy))
      return false
    window.x = clamp(window.x + dx, 0, bounds.width - window.width)
    window.y = clamp(window.y + dy, 0, bounds.height - window.height)
    rememberPosition(window)
    return focusWindow(id)
  }

  function startDrag(id, event) {
    const window = findWindow(id)
    if (
      !isVisible(window) ||
      window.maximized ||
      event.button !== 0 ||
      event.isPrimary === false ||
      event.target?.closest?.('button,input,textarea,select,a,[contenteditable="true"]') ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    )
      return false
    stopDrag()
    focusWindow(id)
    drag = {
      id,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: window.x,
      y: window.y,
      target: event.currentTarget,
    }
    window.dragging = true
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId)
    } catch {
      /* Global listeners still support dragging without capture. */
    }
    globalThis.window?.addEventListener('pointermove', dragMove, { passive: false })
    globalThis.window?.addEventListener('pointerup', stopDrag)
    globalThis.window?.addEventListener('pointercancel', stopDrag)
    globalThis.window?.addEventListener('lostpointercapture', stopDrag)
    globalThis.window?.addEventListener('blur', cancelDrag)
    if (event.cancelable) event.preventDefault()
    return true
  }

  function setBounds(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
      return false
    stopDrag()
    bounds = { width, height }
    for (const window of windows.value) {
      if (window.maximized) fitMaximized(window)
      else fitNormal(window)
    }
    return true
  }

  function resetWindows() {
    stopDrag()
    normalGeometry.clear()
    windows.value = DEFINITIONS.map((definition) => {
      normalGeometry.set(definition.id, {
        x: definition.rx * bounds.width,
        y: definition.ry * bounds.height,
        width: definition.width,
        height: definition.height,
        boundsWidth: bounds.width,
        boundsHeight: bounds.height,
      })
      const window = {
        id: definition.id,
        title: definition.title,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        open: definition.open,
        minimized: false,
        maximized: false,
        z: definition.z,
        dragging: false,
      }
      fitNormal(window)
      return window
    })
    nextZ = 12
    activeId.value = 'terminal'
  }

  resetWindows()
  onBeforeUnmount(() => stopDrag())
  return {
    windows,
    activeId,
    openWindow,
    closeWindow,
    minimizeWindow,
    toggleMaximize,
    focusWindow,
    startDrag,
    moveWindow,
    setBounds,
    resetWindows,
  }
}
