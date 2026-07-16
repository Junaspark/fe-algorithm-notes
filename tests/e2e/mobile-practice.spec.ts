import { expect, test } from '@playwright/test'

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name} uses the real Worker, routes, editor, IndexedDB, and conflict recovery`, async ({ page, context }) => {
    await page.setViewportSize(viewport)
    await page.request.post('/tests/api/version', { data: { version: 1 } })
    await page.goto('/tests/browser/practice.html')
    await expect(page.getByRole('tabpanel', { name: '题目' })).toBeAttached()
    const editor = page.getByRole('textbox', { name: 'Editor content' })
    const typeCode = async (source: string) => {
      if (viewport.name === 'mobile') { const codeTab = page.getByRole('tab', { name: '代码', exact: true }); await codeTab.press('Enter'); await expect(codeTab).toHaveAttribute('aria-selected', 'true') }
      await editor.focus(); await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.insertText(`\n${source}`)
    }
    await typeCode('function answer() { return 42 }')
    const runButton = page.getByRole('button', { name: '运行测试' })
    await runButton.press('Enter')
    await expect(page.getByText('1 / 1 通过')).toBeVisible()
    await page.getByRole('button', { name: '提交解答' }).press('Enter')
    await expect(page.getByText('已通过全部测试')).toBeVisible()

    await context.setOffline(true)
    await typeCode('function answer() { return 41 + 1 }')
    await page.waitForTimeout(2200)
    expect(await page.evaluate(async () => new Promise<number>((resolve, reject) => { const open = indexedDB.open('fe-algorithm-gym', 1); open.onerror = () => reject(open.error); open.onsuccess = () => { const count = open.result.transaction('draft-queue').objectStore('draft-queue').count(); count.onsuccess = () => resolve(count.result) } }))).toBe(1)
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => page.evaluate(async () => new Promise<number>((resolve, reject) => { const open = indexedDB.open('fe-algorithm-gym', 1); open.onerror = () => reject(open.error); open.onsuccess = () => { const count = open.result.transaction('draft-queue').objectStore('draft-queue').count(); count.onsuccess = () => resolve(count.result) } }))).toBe(0)

    await page.request.post('/tests/api/version', { data: { version: 9 } })
    await typeCode('function answer() { return 6 * 7 }')
    await expect(page.getByText('草稿版本冲突')).toBeAttached({ timeout: 4000 })
    if (viewport.name === 'mobile') await page.getByRole('tab', { name: '结果', exact: true }).press('Enter')
    await expect(page.getByText('草稿版本冲突')).toBeVisible()
    await page.getByRole('button', { name: '保留本地代码' }).click()
    await expect.poll(async () => page.request.get('/tests/api/version').then(response => response.json())).toMatchObject({ version: 10, code: expect.stringContaining('6 * 7') })
  })
}
