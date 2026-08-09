import { afterEach, describe, expect, it, vi } from 'vitest'
import { e2eEnabled } from '@/domain/e2e/state'

afterEach(() => vi.unstubAllEnvs())

describe('E2E gate', () => {
  it('requires compile/runtime gates, a high entropy secret and loopback binding', () => {
    vi.stubEnv('E2E_COMPILED', '1'); vi.stubEnv('E2E_TEST_MODE', '1'); vi.stubEnv('E2E_ACCESS_SECRET', 'x'.repeat(32))
    vi.stubEnv('E2E_BIND_HOST', '0.0.0.0'); expect(e2eEnabled()).toBe(false)
    vi.stubEnv('E2E_BIND_HOST', '127.0.0.1'); expect(e2eEnabled()).toBe(true)
    expect(e2eEnabled(new Request('http://example.com/api/e2e/state', { headers: { 'x-e2e-secret': 'x'.repeat(32) } }))).toBe(false)
    expect(e2eEnabled(new Request('http://127.0.0.1/api/e2e/state'))).toBe(false)
    expect(e2eEnabled(new Request('http://127.0.0.1/api/e2e/state', { headers: { 'x-e2e-secret': 'x'.repeat(32) } }))).toBe(true)
  })
})
