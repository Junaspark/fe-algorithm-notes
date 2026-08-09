import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMorningRoute } from '@/app/api/cron/morning/route'
import { createEveningRoute } from '@/app/api/cron/evening/route'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('cron handlers', () => {
  it('fails closed when the cron secret is not configured', async () => {
    const runMorningCheck = vi.fn()
    const request = { headers: { get: () => 'Bearer ' } } as unknown as Request
    const response = await createMorningRoute({ getSecret: () => '', createRuntime: vi.fn().mockResolvedValue({ runMorningCheck, takeReminder: vi.fn() }) })(request)
    expect(response.status).toBe(401)
    expect(runMorningCheck).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'Bearer wrong'])('returns 401 for a missing or wrong token', async (authorization) => {
    const createRuntime = vi.fn()
    const handler = createMorningRoute({ getSecret: () => 'correct', createRuntime })
    const headers = new Headers()
    if (authorization !== undefined) headers.set('authorization', authorization)
    expect((await handler(new Request('http://localhost/api/cron/morning', { headers }))).status).toBe(401)
    expect(createRuntime).not.toHaveBeenCalled()
  })

  it('reads CRON_SECRET lazily from route environment wiring', async () => {
    vi.stubEnv('CRON_SECRET', 'from-env')
    const runMorningCheck = vi.fn().mockResolvedValue({ planId: 'plan-1', created: true, remainingCount: 2 })
    const route = createMorningRoute({ getSecret: () => process.env.CRON_SECRET ?? '', createRuntime: vi.fn().mockResolvedValue({ runMorningCheck, takeReminder: () => null }) })
    expect((await route(new Request('http://localhost', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
    expect((await route(new Request('http://localhost', { headers: { authorization: 'Bearer from-env' } }))).status).toBe(200)
  })

  it('runs morning once at the frozen 09:30 Shanghai instant', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-16T01:30:00Z'))
    const runMorningCheck = vi.fn().mockResolvedValue({ planId: 'plan-1', created: true, remainingCount: 2 })
    const reminder = { kind: 'morning', userId: 'user-1', planId: 'plan-1', remainingCount: 2, exerciseIds: ['alg', 'fe'] }
    const response = await createMorningRoute({ getSecret: () => 'correct', createRuntime: vi.fn().mockResolvedValue({ runMorningCheck, takeReminder: () => reminder }) })(new Request('http://localhost', { headers: { authorization: 'Bearer correct' } }))
    expect(runMorningCheck).toHaveBeenCalledOnce()
    expect(runMorningCheck).toHaveBeenCalledWith(new Date('2026-07-16T01:30:00Z'))
    const body = await response.json()
    expect(body).toEqual({ planId: 'plan-1', created: true, remainingCount: 2, reminder: { kind: 'morning', remainingCount: 2, exerciseIds: ['alg', 'fe'] }, delivery: { id: 'morning:plan-1:2026-07-16', channel: 'codex-task-notification', message: { kind: 'morning', remainingCount: 2, exerciseIds: ['alg', 'fe'] } } })
    expect(JSON.stringify(body)).not.toContain('user-1')
    expect(JSON.stringify(body)).not.toContain('userId')
  })

  it('runs evening once at the frozen 20:00 Shanghai instant', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00Z'))
    const runEveningCheck = vi.fn().mockResolvedValue({ planId: 'plan-1', created: false, remainingCount: 1 })
    const reminder = { kind: 'evening', userId: 'user-1', planId: 'plan-1', remainingCount: 1, exerciseIds: ['alg'] }
    const response = await createEveningRoute({ getSecret: () => 'correct', createRuntime: vi.fn().mockResolvedValue({ runEveningCheck, takeReminder: () => reminder }) })(new Request('http://localhost', { headers: { authorization: 'Bearer correct' } }))
    expect(runEveningCheck).toHaveBeenCalledOnce()
    const body = await response.json()
    expect(body).toEqual({ planId: 'plan-1', created: false, remainingCount: 1, reminder: { kind: 'evening', remainingCount: 1, exerciseIds: ['alg'] }, delivery: { id: 'evening:plan-1:2026-07-16', channel: 'codex-task-notification', message: { kind: 'evening', remainingCount: 1, exerciseIds: ['alg'] } } })
    expect(JSON.stringify(body)).not.toContain('user-1')
    expect(JSON.stringify(body)).not.toContain('userId')
  })

  it('does not expose the E2E owner UUID in either cron response', async () => {
    vi.stubEnv('E2E_COMPILED', '1')
    vi.stubEnv('E2E_TEST_MODE', '1')
    vi.stubEnv('E2E_BIND_HOST', '127.0.0.1')
    vi.stubEnv('E2E_ACCESS_SECRET', 'x'.repeat(32))
    const request = new Request('http://localhost', { headers: { authorization: 'Bearer correct' } })

    const morning = await createMorningRoute({ getSecret: () => 'correct', createRuntime: vi.fn() })(request)
    const evening = await createEveningRoute({ getSecret: () => 'correct', createRuntime: vi.fn() })(request)

    for (const body of [await morning.json(), await evening.json()]) {
      expect(JSON.stringify(body)).not.toContain('00000000-0000-4000-8000-000000000001')
      expect(JSON.stringify(body)).not.toContain('userId')
    }
  })

  it('does not initialize evening runtime before authorization', async () => {
    const createRuntime = vi.fn()
    const response = await createEveningRoute({ getSecret: () => 'correct', createRuntime })(new Request('http://localhost'))
    expect(response.status).toBe(401)
    expect(createRuntime).not.toHaveBeenCalled()
  })
})
