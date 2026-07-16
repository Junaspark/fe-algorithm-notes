import { expect, test } from '@playwright/test'

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name} supports coding, running, and submitting`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/tests/browser/practice.html')
    await expect(page.getByRole('region', { name: '题目' })).toBeAttached()
    if (viewport.name === 'mobile') {
      await page.getByRole('tab', { name: '代码', exact: true }).click()
      await expect(page.getByRole('tab', { name: '代码', exact: true })).toHaveAttribute('aria-selected', 'true')
    }
    await page.getByRole('button', { name: '运行测试' }).click()
    await expect(page.getByText('1 / 1 通过')).toBeVisible()
    await page.getByRole('button', { name: '提交解答' }).click()
    await expect(page.getByText('已通过全部测试')).toBeVisible()
    if (viewport.name === 'mobile') await expect(page.getByRole('tab', { name: '结果' })).toHaveAttribute('aria-selected', 'true')
  })
}
