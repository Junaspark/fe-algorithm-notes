import { describe, expect, it, vi } from 'vitest'

import { createDraftRoute } from '@/app/api/drafts/route'

const request = (body: unknown) => new Request('http://localhost/api/drafts', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('PUT /api/drafts', () => {
  it('requires an authenticated owner and validates input', async () => {
    const save = vi.fn()
    const route = createDraftRoute({ authenticate: vi.fn().mockResolvedValue(null), save })
    expect((await route(request({ exerciseId: 'debounce', code: 'x', expectedVersion: 0 }))).status).toBe(401)
    expect(save).not.toHaveBeenCalled()
  })

  it('derives ownership from session and returns the next version', async () => {
    const save = vi.fn().mockResolvedValue({ version: 3, updatedAt: new Date('2026-07-15T10:00:00Z') })
    const route = createDraftRoute({ authenticate: vi.fn().mockResolvedValue({ user: { id: 'owner' } }), save })
    const response = await route(request({ exerciseId: 'debounce', code: 'function debounce() {}', expectedVersion: 2 }))
    expect(response.status).toBe(200)
    expect(save).toHaveBeenCalledWith({ userId: 'owner', exerciseId: 'debounce', code: 'function debounce() {}', expectedVersion: 2 })
    expect(await response.json()).toEqual({ version: 3, savedAt: '2026-07-15T10:00:00.000Z' })
  })

  it('returns both versions on an optimistic version conflict', async () => {
    const route = createDraftRoute({
      authenticate: vi.fn().mockResolvedValue({ user: { id: 'owner' } }),
      save: vi.fn().mockRejectedValue(new Error('DRAFT_CONFLICT')),
      find: vi.fn().mockResolvedValue({ version: 5 }),
    })
    const response = await route(request({ exerciseId: 'debounce', code: 'local', expectedVersion: 2 }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: 'DRAFT_CONFLICT', serverVersion: 5, localVersion: 2 })
  })
})
