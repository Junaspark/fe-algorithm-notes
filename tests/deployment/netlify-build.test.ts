import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { netlifyBuildSteps } from '@/scripts/build-netlify'

describe('Netlify build contract', () => {
  it.each([
    {},
    { NETLIFY: 'true', CONTEXT: 'production', DATABASE_URL: 'postgres://must-not-be-used' },
    { NETLIFY_LOCAL: 'true', CONTEXT: 'deploy-preview', NETLIFY_DB_URL: 'postgres://must-not-be-used' },
  ])('only prepares migrations and builds without a database step for %j', (environment) => {
    expect(netlifyBuildSteps(environment)).toEqual([
      ['pnpm', ['netlify:migrations']],
      ['pnpm', ['exec', 'next', 'build']],
    ])
  })

  it('routes the Netlify build command through the gated orchestrator', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['build:netlify']).toBe('tsx scripts/build-netlify.ts')
  })
})
