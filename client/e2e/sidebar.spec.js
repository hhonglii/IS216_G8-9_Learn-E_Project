// Browser checks for G11 (decision G-11): the sidebar from App.vue and
// navigation.js. Each page's data fails to load, so it shows its
// retry state; only the shell around it is checked here. Since G16 the person is
// logged in first.
import { test, expect } from '@playwright/test'
import { failEveryLoad, logInAs, user } from './helpers/session.js'

const classroomId = '507f1f77bcf86cd799439106'
const helpUrl = `/classrooms/${classroomId}/help`

const primaryNav = (page) => page.getByRole('navigation', { name: 'Primary navigation' })
const linkNames = (page) => primaryNav(page).getByRole('link').allTextContents()

function collectPageErrors(page) {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return pageErrors
}

const noSidewaysScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.beforeEach(async ({ page }) => {
  await failEveryLoad(page)
  await logInAs(page, user('demo-user', 'Demo Student'))
})

test('at 1280px the sidebar sits beside the page and replaces the top menu', async ({
  page,
}, testInfo) => {
  const pageErrors = collectPageErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(helpUrl)
  await expect(page.getByRole('heading', { name: 'Help queue', exact: true })).toBeVisible()

  // Exactly one Primary navigation is visible: the sidebar, not the top menu.
  await expect(primaryNav(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Toggle primary navigation' })).toBeHidden()
  expect(await linkNames(page)).toEqual([
    'Dashboard',
    'Take a break',
    'Classroom',
    'Help queue',
    'Your profile',
  ])

  const sidebar = await page.locator('.app-sidebar').boundingBox()
  const main = await page.locator('main').boundingBox()
  expect(sidebar.width).toBe(240)
  expect(main.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width)
  expect(await noSidewaysScroll(page)).toBe(true)

  // The current link is the cyan tint with cyan text (9.31:1) on every page.
  const current = primaryNav(page).getByRole('link', { name: 'Help queue' })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await expect(current).toHaveCSS('background-color', 'rgb(15, 53, 63)')
  await expect(current).toHaveCSS('color', 'rgb(0, 240, 255)')
  await expect(primaryNav(page).locator('[aria-current="page"]')).toHaveCount(1)

  await page.screenshot({ path: testInfo.outputPath('sidebar-1280.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})

test('Tab goes through the top bar chip, then the sidebar, then the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(helpUrl)
  await expect(page.getByRole('heading', { name: 'Help queue', exact: true })).toBeVisible()

  const focused = []
  for (let i = 0; i < 9; i += 1) {
    await page.keyboard.press('Tab')
    focused.push(
      await page.evaluate(() => {
        const el = document.activeElement
        const where = el.closest('.app-bar')
          ? 'top bar'
          : el.closest('.app-sidebar')
            ? 'sidebar'
            : el.closest('main')
              ? 'page'
              : 'other'
        return `${where}: ${el.textContent.trim()}`
      }),
    )
  }
  // The chip (G12) is the only control in the bar from 768px; Log out (G16) ends the sidebar.
  expect(focused.slice(0, 7)).toEqual([
    'top bar: Demo Student',
    'sidebar: Dashboard',
    'sidebar: Take a break',
    'sidebar: Classroom',
    'sidebar: Help queue',
    'sidebar: Your profile',
    'sidebar: Log out',
  ])
  expect(focused[7]).toMatch(/^page: /)
})

test('at 768px the sidebar still fits, and pages without a classroom id show only the global links', async ({
  page,
}) => {
  const pageErrors = collectPageErrors(page)
  await page.setViewportSize({ width: 768, height: 900 })

  await page.goto(`/classrooms/${classroomId}`)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(await linkNames(page)).toEqual([
    'Dashboard',
    'Take a break',
    'Classroom',
    'Help queue',
    'Your profile',
  ])
  const current = primaryNav(page).getByRole('link', { name: 'Classroom', exact: true })
  await expect(current).toHaveAttribute('aria-current', 'page')
  // The same ink on a classroom page as on Help Queue.
  await expect(current).toHaveCSS('color', 'rgb(0, 240, 255)')
  // 768px is the first width with the sidebar, so the page must already sit beside it.
  const sidebar = await page.locator('.app-sidebar').boundingBox()
  const main = await page.locator('main').boundingBox()
  expect(main.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width)
  expect(await noSidewaysScroll(page)).toBe(true)

  for (const url of ['/challenges/demo-challenge', '/mini-projects/demo-project', '/']) {
    await page.goto(url)
    await expect(primaryNav(page).getByRole('link', { name: 'Dashboard' })).toBeVisible()
    expect(await linkNames(page)).toEqual(['Dashboard', 'Take a break', 'Your profile'])
  }
  expect(pageErrors).toEqual([])
})

test('at 375px the sidebar is hidden and the menu button holds the same links', async ({
  page,
}, testInfo) => {
  const pageErrors = collectPageErrors(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(helpUrl)
  await expect(page.getByRole('heading', { name: 'Help queue', exact: true })).toBeVisible()

  await expect(page.locator('.app-sidebar')).toBeHidden()
  const toggle = page.getByRole('button', { name: 'Toggle primary navigation' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(await linkNames(page)).toEqual([
    'Dashboard',
    'Take a break',
    'Classroom',
    'Help queue',
    'Your profile',
  ])
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('menu-375.png'), fullPage: true })

  await primaryNav(page).getByRole('link', { name: 'Classroom', exact: true }).click()
  await expect(page).toHaveURL(`/classrooms/${classroomId}`)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(pageErrors).toEqual([])
})
