import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/e2e/login/route'

afterEach(() => vi.unstubAllEnvs())

function enableLocalE2E() {
  vi.stubEnv('E2E_COMPILED', '1')
  vi.stubEnv('E2E_TEST_MODE', '1')
  vi.stubEnv('E2E_BIND_HOST', '127.0.0.1')
  vi.stubEnv('E2E_ACCESS_SECRET', 'x'.repeat(32))
}

describe('local E2E login', () => {
  it('sets the allowlisted demo user only on the loopback-bound E2E build', async () => {
    enableLocalE2E()

    const response = await GET(new Request('http://127.0.0.1:4174/api/e2e/login'))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/today')
    expect(response.headers.get('set-cookie')).toContain('e2e-user=Junaspark')
  })

  it('is absent outside loopback and when the E2E gate is disabled', async () => {
    enableLocalE2E()
    expect((await GET(new Request('http://example.com/api/e2e/login'))).status).toBe(404)

    vi.stubEnv('E2E_TEST_MODE', '0')
    expect((await GET(new Request('http://127.0.0.1:4174/api/e2e/login'))).status).toBe(404)
  })
})
