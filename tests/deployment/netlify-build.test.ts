import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { netlifyBuildDecision, netlifyBuildSteps } from '@/scripts/build-netlify'

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

  it('does not seed an ordinary Netlify CLI local build without the explicit deploy marker', () => {
    const cliEnvironment = { CONTEXT: 'deploy-preview', NETLIFY_LOCAL: 'true' }

    expect(netlifyBuildDecision(cliEnvironment)).toEqual({
      context: 'local',
      seed: false,
      source: 'local',
    })
    expect(netlifyBuildSteps(cliEnvironment)).not.toContainEqual(['pnpm', ['seed']])
  })

  it('does not seed a plain local build merely because CONTEXT is present', () => {
    expect(netlifyBuildDecision({ CONTEXT: 'deploy-preview' })).toEqual({
      context: 'local',
      seed: false,
      source: 'local',
    })
  })

  it('accepts the explicit non-secret CLI deploy signal used by the runbook', () => {
    expect(netlifyBuildDecision({ CONTEXT: 'production', NETLIFY_DEPLOY_BUILD: 'true' })).toEqual({
      context: 'production',
      seed: true,
      source: 'netlify-cli',
    })
  })

  it('routes the Netlify build command through the gated orchestrator', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['build:netlify']).toBe('tsx scripts/build-netlify.ts')
  })
})
