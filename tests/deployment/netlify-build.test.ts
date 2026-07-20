import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { netlifyBuildSteps } from '@/scripts/build-netlify'

describe('Netlify build contract', () => {
  it('prepares migrations, seeds the migrated database, then builds on Netlify', () => {
    expect(netlifyBuildSteps({ NETLIFY: 'true' })).toEqual([
      ['pnpm', ['netlify:migrations']],
      ['pnpm', ['seed']],
      ['pnpm', ['exec', 'next', 'build']],
    ])
  })

  it('does not contact a live database during local or offline builds', () => {
    expect(netlifyBuildSteps({})).toEqual([
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
