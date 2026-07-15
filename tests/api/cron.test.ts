import { describe, expect, it, vi } from 'vitest'

import { createMorningHandler } from '@/app/api/cron/morning/route'
import { createEveningHandler } from '@/app/api/cron/evening/route'

describe('cron handlers', () => {
  it('fails closed when the cron secret is not configured', async () => {
    const runMorningCheck = vi.fn()
    const request = { headers: { get: () => 'Bearer ' } } as unknown as Request
    const response = await createMorningHandler({ secret: '', runMorningCheck })(request)
    expect(response.status).toBe(401)
    expect(runMorningCheck).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'Bearer wrong'])('returns 401 for a missing or wrong token', async (authorization) => {
    const runMorningCheck = vi.fn()
    const handler = createMorningHandler({ secret: 'correct', runMorningCheck })
    const headers = new Headers()
    if (authorization !== undefined) headers.set('authorization', authorization)
    expect((await handler(new Request('http://localhost/api/cron/morning', { headers }))).status).toBe(401)
    expect(runMorningCheck).not.toHaveBeenCalled()
  })

  it('runs morning once at the frozen 09:30 Shanghai instant', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-16T01:30:00Z'))
    const runMorningCheck = vi.fn().mockResolvedValue({ planId: 'plan-1', created: true, remainingCount: 2 })
    const response = await createMorningHandler({ secret: 'correct', runMorningCheck })(new Request('http://localhost', { headers: { authorization: 'Bearer correct' } }))
    expect(runMorningCheck).toHaveBeenCalledOnce()
    expect(runMorningCheck).toHaveBeenCalledWith(new Date('2026-07-16T01:30:00Z'))
    expect(await response.json()).toEqual({ planId: 'plan-1', created: true, remainingCount: 2 })
    vi.useRealTimers()
  })

  it('runs evening once at the frozen 20:00 Shanghai instant', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00Z'))
    const runEveningCheck = vi.fn().mockResolvedValue({ planId: 'plan-1', created: false, remainingCount: 1 })
    const response = await createEveningHandler({ secret: 'correct', runEveningCheck })(new Request('http://localhost', { headers: { authorization: 'Bearer correct' } }))
    expect(runEveningCheck).toHaveBeenCalledOnce()
    expect(await response.json()).toEqual({ planId: 'plan-1', created: false, remainingCount: 1 })
    vi.useRealTimers()
  })
})
