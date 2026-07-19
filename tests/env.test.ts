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
