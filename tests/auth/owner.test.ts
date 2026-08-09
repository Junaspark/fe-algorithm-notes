import { describe, expect, it, vi } from 'vitest'

vi.mock('@/db/client', () => ({ db: { execute: vi.fn() } }))

import { resolveOwnerUserId } from '@/domain/auth/owner'

describe('owner user resolver', () => {
  it('prefers a non-empty explicit owner id without querying', async () => {
    const query = vi.fn()

    await expect(resolveOwnerUserId({ explicitId: 'owner-1', query })).resolves.toBe('owner-1')

    expect(query).not.toHaveBeenCalled()
  })

  it('normalizes the Junaspark login before querying', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'owner-2' }])

    await expect(resolveOwnerUserId({ login: '  JuNaSpArK  ', query })).resolves.toBe('owner-2')

    expect(query).toHaveBeenCalledWith('junaspark')
  })

  it('requires exactly one valid Junaspark row', async () => {
    await expect(resolveOwnerUserId({ query: async () => [{ id: 'owner-2' }] })).resolves.toBe('owner-2')
    await expect(resolveOwnerUserId({ query: async () => [] })).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
    await expect(resolveOwnerUserId({ query: async () => [{ id: 'a' }, { id: 'b' }] })).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
    await expect(resolveOwnerUserId({ query: async () => [{ id: null }] })).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
    await expect(resolveOwnerUserId({ query: async () => [{ id: '   ' }] })).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
  })
})
