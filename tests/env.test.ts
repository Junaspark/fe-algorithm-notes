import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('accepts NETLIFY_DB_URL as the only usable database connection variable', async () => {
  vi.stubEnv('AUTH_SECRET', 'test-secret')
  vi.stubEnv('AUTH_GITHUB_ID', 'test-client-id')
  vi.stubEnv('AUTH_GITHUB_SECRET', 'test-client-secret')
  vi.stubEnv('DATABASE_URL', '')
  vi.stubEnv('NETLIFY_DB_URL', 'postgres://netlify:netlify@localhost:5432/test')

  const { env } = await import('@/env')

  expect(env.DATABASE_URL).toBe('postgres://netlify:netlify@localhost:5432/test')
})

it('allows a non-routable database sentinel only during the Next production build phase', async () => {
  vi.stubEnv('AUTH_SECRET', 'test-secret')
  vi.stubEnv('AUTH_GITHUB_ID', 'test-client-id')
  vi.stubEnv('AUTH_GITHUB_SECRET', 'test-client-secret')
  vi.stubEnv('DATABASE_URL', '')
  vi.stubEnv('NETLIFY_DB_URL', '')
  vi.stubEnv('NEXT_PHASE', 'phase-production-build')

  const { env } = await import('@/env')
  expect(env.DATABASE_URL).toBe('postgres://build-only.invalid/unused')
})

it('still rejects a missing database URL outside the production build phase', async () => {
  vi.stubEnv('AUTH_SECRET', 'test-secret')
  vi.stubEnv('AUTH_GITHUB_ID', 'test-client-id')
  vi.stubEnv('AUTH_GITHUB_SECRET', 'test-client-secret')
  vi.stubEnv('DATABASE_URL', '')
  vi.stubEnv('NETLIFY_DB_URL', '')
  vi.stubEnv('NEXT_PHASE', 'phase-production-server')

  await expect(import('@/env')).rejects.toThrow('DATABASE_URL or NETLIFY_DB_URL is required')
})
