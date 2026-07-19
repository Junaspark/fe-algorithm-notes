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
    'scripts/verify-live-database.ts',
    'OWNER_USER_ID',
    '/deploys/',
    '/restore',
  ]) expect(text).toContain(token)

  expect(text).not.toMatch(/gh[opsu]_[A-Za-z0-9]{20,}/)
  expect(text).not.toMatch(/(?:AUTH_GITHUB_SECRET|CRON_SECRET|GITHUB_SYNC_TOKEN)=["']?(?![$<{])[^\s"']+/)
  expect(text).not.toContain('pnpm dlx netlify-cli')
  expect(text).not.toMatch(/netlify-cli (?:rollback|deploy:rollback)/)
  expect(text).not.toContain('env:list')
  expect(text).not.toContain('LIVE_DATABASE_URL')

  const netlifyCommands = text.match(/^pnpm .*netlify (?:login|status|link|env:set|db status|deploy).*$/gm) ?? []
  expect(netlifyCommands.length).toBeGreaterThan(10)
  expect(netlifyCommands.every(command => command.includes('pnpm --package=netlify-cli dlx netlify'))).toBe(true)

  const storeSecrets = text.indexOf('Store every generated secret in the password manager before the first unset')
  const firstUnset = text.indexOf('\nunset ')
  expect(storeSecrets).toBeGreaterThan(-1)
  expect(storeSecrets).toBeLessThan(firstUnset)

  const stagingAutomations = text.indexOf('Keep both schedules disabled')
  const productionAutomations = text.indexOf('Switch both automation endpoint URLs to production')
  const enableAutomations = text.indexOf('Enable both schedules')
  expect(stagingAutomations).toBeGreaterThan(-1)
  expect(productionAutomations).toBeGreaterThan(stagingAutomations)
  expect(enableAutomations).toBeGreaterThan(productionAutomations)
})
