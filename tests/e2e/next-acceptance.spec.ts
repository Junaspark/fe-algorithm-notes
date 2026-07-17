import { expect, test } from '@playwright/test'

const setup = async (request: import('@playwright/test').APIRequestContext, body: Record<string, unknown> = {}) => {
  const response = await request.post('/api/e2e/state', { headers: { 'x-e2e-secret': 'e2e-local-only-secret-at-least-32-bytes' }, data: { action: 'reset', ...body } })
  expect(response.status()).toBe(200)
}

test.beforeEach(async ({ request }) => setup(request))

test('real protected pages authorize only the deterministic owner and library searches 19 records', async ({ page, context }) => {
  await context.addCookies([{ name: 'e2e-user', value: 'Junaspark', url: 'http://127.0.0.1:4174' }])
  await page.goto('/today'); await expect(page.getByRole('heading', { name: '今日题目正在准备' })).toBeVisible()
  await page.goto('/library'); await expect(page.getByText('LIBRARY · 19 EXERCISES')).toBeVisible()
  await page.getByRole('textbox', { name: '搜索题库' }).fill('promise')
  await page.getByRole('button', { name: '筛选' }).click()
  await expect(page.locator('.library-card')).toHaveCount(6)
  await context.clearCookies(); await context.addCookies([{ name: 'e2e-user', value: 'intruder', url: 'http://127.0.0.1:4174' }])
  await page.goto('/progress'); await expect(page).toHaveURL(/\/unauthorized$/)
})

test('actual cron handlers create, carry over, and remind only remaining work', async ({ request }) => {
  let response = await request.get('/api/cron/morning', { headers: { authorization: 'Bearer e2e-cron', 'x-e2e-now': '2026-07-17T01:30:00.000Z' } })
  expect(await response.json()).toMatchObject({ created: true, remainingCount: 2 })
  response = await request.get('/api/cron/morning', { headers: { authorization: 'Bearer e2e-cron', 'x-e2e-now': '2026-07-18T01:30:00.000Z' } })
  expect(await response.json()).toMatchObject({ created: false, remainingCount: 2 })
  await request.post('/api/e2e/state', { headers: { 'x-e2e-secret': 'e2e-local-only-secret-at-least-32-bytes' }, data: { action: 'complete', exerciseId: 'unique-array' } })
  response = await request.get('/api/cron/evening', { headers: { authorization: 'Bearer e2e-cron', 'x-e2e-now': '2026-07-18T12:00:00.000Z' } })
  expect(await response.json()).toMatchObject({ remainingCount: 1, reminder: { exerciseIds: ['debounce'] } })
  response = await request.get('/api/cron/morning', { headers: { authorization: 'Bearer e2e-cron', 'x-e2e-now': '2026-07-19T01:30:00.000Z' } })
  expect(await response.json()).toMatchObject({ created: false, remainingCount: 1, reminder: { exerciseIds: ['debounce'] } })
})

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name} real practice page runs Worker and persists draft/submission handlers`, async ({ page, context, browser }) => {
    await setup(page.request, { withPlan: true })
    await context.addCookies([{ name: 'e2e-user', value: 'Junaspark', url: 'http://127.0.0.1:4174' }])
    await page.setViewportSize(viewport); await page.goto('/practice/unique-array')
    if (viewport.name === 'mobile') await page.getByRole('tab', { name: '代码' }).click()
    const editor = page.getByRole('textbox', { name: 'Editor content' }); await editor.focus(); await page.keyboard.press('Meta+A'); await page.keyboard.insertText('const uniqueArray = arr => [...new Set(arr)]')
    await page.getByRole('button', { name: '运行测试' }).click(); await expect(page.getByText('1 / 1 通过', { exact: true })).toBeVisible()
    await page.waitForTimeout(2200)
    const second = await browser.newContext(); await second.addCookies([{ name: 'e2e-user', value: 'Junaspark', url: 'http://127.0.0.1:4174' }])
    const restored = await second.newPage(); await restored.goto('/practice/unique-array'); await expect(restored.locator('.view-lines')).toContainText('new Set'); await second.close()
    await page.getByRole('button', { name: '提交解答' }).click(); await expect(page.getByText('已通过全部测试')).toBeVisible()
  })
}

test('real Worker times out then recovers and completed plan creates one job of each kind', async ({ page, context, request }) => {
  await setup(request, { withPlan: true }); await context.addCookies([{ name: 'e2e-user', value: 'Junaspark', url: 'http://127.0.0.1:4174' }])
  await page.goto('/practice/unique-array'); const editor = page.getByRole('textbox', { name: 'Editor content' })
  await editor.focus(); await page.keyboard.press('Meta+A'); await page.keyboard.insertText('const uniqueArray = () => { while(true){} }'); await page.getByRole('button', { name: '运行测试' }).click(); await expect(page.locator('[data-status="timeout"]')).toBeVisible({ timeout: 5000 })
  await editor.focus(); await page.keyboard.press('Meta+A'); await page.keyboard.insertText('const uniqueArray = arr => [...new Set(arr)]'); await page.getByRole('button', { name: '提交解答' }).click(); await expect(page.getByText('已通过全部测试')).toBeVisible()
  await request.post('/api/e2e/state', { headers: { 'x-e2e-secret': 'e2e-local-only-secret-at-least-32-bytes' }, data: { action: 'submitSecond' } }); const state = await request.get('/api/e2e/state', { headers: { 'x-e2e-secret': 'e2e-local-only-secret-at-least-32-bytes' } }).then(r => r.json())
  expect(state).toMatchObject({ gitJobs: [{ status: 'queued' }], agentJobs: [{ status: 'queued' }] })
})

test('Git SHA conflict stays retryable and mock Agent review is rendered by real pages', async ({ page, context, request }) => {
  await setup(request, { completedPlan: true })
  await request.post('/api/e2e/state', { headers: { 'x-e2e-secret': 'e2e-local-only-secret-at-least-32-bytes' }, data: { action: 'gitConflict' } }); await request.post('/api/e2e/state', { headers: { 'x-e2e-secret': 'e2e-local-only-secret-at-least-32-bytes' }, data: { action: 'agentReview' } })
  const state = await request.get('/api/e2e/state', { headers: { 'x-e2e-secret': 'e2e-local-only-secret-at-least-32-bytes' } }).then(r => r.json()); expect(state.gitJobs[0]).toMatchObject({ status: 'failed', retryable: true })
  await context.addCookies([{ name: 'e2e-user', value: 'Junaspark', url: 'http://127.0.0.1:4174' }])
  await page.goto('/progress'); await expect(page.getByText('优先解释边界条件')).toBeVisible()
  await page.goto('/mistakes'); await expect(page.getByText('Mock Agent：注意空数组')).toBeVisible()
})
