import { expect, test } from '@playwright/test'
import { authorizeGitHubUser } from '../../domain/auth/authorize-github-user'

test('production authorization seam allows Junaspark and denies another account', async ({ page }) => {
  expect(authorizeGitHubUser({ login: 'Junaspark' })).toBe(true)
  expect(authorizeGitHubUser({ login: 'other' })).toBe(false)
  await page.setContent('<main><h1>无权限</h1><p>仅 Junaspark 可访问训练数据。</p></main>')
  await expect(page.getByRole('heading', { name: '无权限' })).toBeVisible()
})
