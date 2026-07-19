import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('documents every production gate without embedding secret values', async () => {
  const text = await readFile('docs/operations/netlify-production.md', 'utf8')

  for (const token of [
    '901b1baf-beca-4688-b0c8-24d5da2b9a80',
    'https://fe-algorithm-gym.netlify.app',
    '/api/auth/callback/github',
    'validation/promotion',
    'pnpm db:migrate',
    'pnpm seed',
    '19 exercises upserted',
    '09:30',
    '20:00',
    'Junaspark',
    'Codex Automation ID',
    'netlify-cli rollback',
  ]) expect(text).toContain(token)

  expect(text).not.toMatch(/gh[opsu]_[A-Za-z0-9]{20,}/)
  expect(text).not.toMatch(/(?:AUTH_GITHUB_SECRET|CRON_SECRET|GITHUB_SYNC_TOKEN)=[^\s$<{][^\s]*/)
})
