import { describe, expect, it } from 'vitest'

import { resolveDatabaseUrl } from '@/db/connection-string'

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
