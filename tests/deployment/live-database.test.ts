import { describe, expect, it, vi } from 'vitest'

import { verifyLiveDatabase } from '@/scripts/verify-live-database'
import { findOwnerUserId } from '@/scripts/find-owner-user-id'

type Result = Record<string, unknown>[]

function client(results: Result[]) {
  const sql = vi.fn(async () => results.shift() ?? [])
  return Object.assign(sql, { end: vi.fn(async () => undefined) })
}

describe('verifyLiveDatabase', () => {
  it('uses two independent clients and verifies all seeded exercises', async () => {
    const first = client([[{ pid: 101 }], [{ count: 19 }]])
    const second = client([[{ pid: 202 }]])
    const connect = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)

    await expect(verifyLiveDatabase('postgres://live', connect)).resolves.toEqual({
      firstPid: 101,
      secondPid: 202,
      exerciseCount: 19,
    })
    expect(connect).toHaveBeenNthCalledWith(1, 'postgres://live')
    expect(connect).toHaveBeenNthCalledWith(2, 'postgres://live')
    expect(first.end).toHaveBeenCalledOnce()
    expect(second.end).toHaveBeenCalledOnce()
  })

  it('fails when the clients share a backend or seed count is wrong', async () => {
    const sameBackend = vi.fn()
      .mockReturnValueOnce(client([[{ pid: 101 }], [{ count: 19 }]]))
      .mockReturnValueOnce(client([[{ pid: 101 }]]))
    await expect(verifyLiveDatabase('postgres://live', sameBackend)).rejects.toThrow('INDEPENDENT_DATABASE_CONNECTIONS_REQUIRED')

    const wrongSeed = vi.fn()
      .mockReturnValueOnce(client([[{ pid: 101 }], [{ count: 18 }]]))
      .mockReturnValueOnce(client([[{ pid: 202 }]]))
    await expect(verifyLiveDatabase('postgres://live', wrongSeed)).rejects.toThrow('EXPECTED_19_EXERCISES')
  })
})

describe('findOwnerUserId', () => {
  it('discovers exactly one normalized Junaspark user and closes its client', async () => {
    const sql = client([[{ id: 'owner-uuid' }]])
    const connect = vi.fn().mockReturnValue(sql)

    await expect(findOwnerUserId('postgres://live', '  Junaspark ', connect)).resolves.toBe('owner-uuid')
    expect(connect).toHaveBeenCalledWith('postgres://live')
    expect(sql).toHaveBeenCalledOnce()
    expect(sql.end).toHaveBeenCalledOnce()
  })

  it('fails closed unless exactly one owner exists', async () => {
    const connect = vi.fn().mockReturnValue(client([[]]))
    await expect(findOwnerUserId('postgres://live', 'Junaspark', connect)).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
  })
})
