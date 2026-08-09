import { describe, expect, it } from 'vitest'

import { resolveDatabaseUrl } from '@/db/connection-string'
import { resolveApplicationDatabaseUrl } from '@/db/application-database-url'

describe('resolveDatabaseUrl', () => {
  it('prefers the portable DATABASE_URL', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgres://portable', NETLIFY_DB_URL: 'postgres://netlify' }))
      .toBe('postgres://portable')
  })

  it('falls back to Netlify Database', () => {
    expect(resolveDatabaseUrl({ NETLIFY_DB_URL: 'postgres://netlify' })).toBe('postgres://netlify')
  })

  it('fails closed when neither variable exists', () => {
    expect(() => resolveDatabaseUrl({})).toThrow('DATABASE_URL or NETLIFY_DB_URL is required')
  })
})

describe('resolveApplicationDatabaseUrl', () => {
  it('uses a build-only sentinel when Next explicitly identifies a production build', () => {
    expect(resolveApplicationDatabaseUrl({ NEXT_PHASE: 'phase-production-build' }))
      .toBe('postgres://build-only.invalid/unused')
  })

  it('never permits the sentinel at runtime', () => {
    expect(() => resolveApplicationDatabaseUrl({ NEXT_PHASE: 'phase-production-server' }))
      .toThrow('DATABASE_URL or NETLIFY_DB_URL is required')
    expect(() => resolveApplicationDatabaseUrl({})).toThrow('DATABASE_URL or NETLIFY_DB_URL is required')
  })
})
