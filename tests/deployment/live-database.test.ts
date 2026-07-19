import { describe, expect, it, vi } from 'vitest'

import { verifyLiveDatabase } from '@/scripts/verify-live-database'
import { findOwnerUserId } from '@/scripts/find-owner-user-id'

type Result = Record<string, unknown>[]

function client(results: Result[]) {
  const sql = vi.fn(async () => results.shift() ?? [])
  return Object.assign(sql, { end: vi.fn(async () => undefined) })
}

describe('verifyLiveDatabase', () => {
  it('uses two independent production repositories and observes the active-plan retry boundary', async () => {
    const first = client([[{ pid: 101 }], [{ count: 19 }], [
      { id: 'algorithm-1', kind: 'algorithm' },
      { id: 'frontend-1', kind: 'frontend' },
    ], []])
    const second = client([[{ pid: 202 }]])
    const connect = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    let createCalls = 0
    let release!: () => void
    const bothStarted = new Promise<void>(resolve => { release = resolve })
    const plan = { id: 'probe-plan', status: 'active', items: [] }
    const repositories = [
      {
        create: vi.fn(async () => { if (++createCalls === 2) release(); await bothStarted; return plan }),
        findActive: vi.fn(async () => plan),
      },
      {
        create: vi.fn(async () => { if (++createCalls === 2) release(); await bothStarted; throw new Error('ACTIVE_PLAN_EXISTS') }),
        findActive: vi.fn(async () => plan),
      },
    ]
    const createRepository = vi.fn().mockReturnValueOnce(repositories[0]).mockReturnValueOnce(repositories[1])

    await expect(verifyLiveDatabase('postgres://live', { connect, createRepository, createDatabase: vi.fn(value => value) })).resolves.toEqual({
      firstPid: 101,
      secondPid: 202,
      exerciseCount: 19,
      concurrency: 'ACTIVE_PLAN_EXISTS',
    })
    expect(connect).toHaveBeenNthCalledWith(1, 'postgres://live')
    expect(connect).toHaveBeenNthCalledWith(2, 'postgres://live')
    expect(first.end).toHaveBeenCalledOnce()
    expect(second.end).toHaveBeenCalledOnce()
    expect(repositories[0].create).toHaveBeenCalledOnce()
    expect(repositories[1].create).toHaveBeenCalledOnce()
    expect(repositories[0].findActive).toHaveBeenCalledOnce()
    expect(repositories[1].findActive).toHaveBeenCalledOnce()
    expect(first).toHaveBeenCalledTimes(4)
  })

  it('fails when the clients share a backend or seed count is wrong', async () => {
    const sameBackend = vi.fn()
      .mockReturnValueOnce(client([[{ pid: 101 }], [{ count: 19 }]]))
      .mockReturnValueOnce(client([[{ pid: 101 }]]))
    await expect(verifyLiveDatabase('postgres://live', { connect: sameBackend })).rejects.toThrow('INDEPENDENT_DATABASE_CONNECTIONS_REQUIRED')

    const wrongSeed = vi.fn()
      .mockReturnValueOnce(client([[{ pid: 101 }], [{ count: 18 }]]))
      .mockReturnValueOnce(client([[{ pid: 202 }]]))
    await expect(verifyLiveDatabase('postgres://live', { connect: wrongSeed })).rejects.toThrow('EXPECTED_19_EXERCISES')
  })

  it('rejects false positives when both repository transactions succeed', async () => {
    const first = client([[{ pid: 101 }], [{ count: 19 }], [
      { id: 'algorithm-1', kind: 'algorithm' },
      { id: 'frontend-1', kind: 'frontend' },
    ], []])
    const second = client([[{ pid: 202 }]])
    const plan = { id: 'probe-plan', status: 'active', items: [] }
    const createRepository = vi.fn().mockReturnValue({ create: vi.fn(async () => plan), findActive: vi.fn(async () => plan) })

    await expect(verifyLiveDatabase('postgres://live', {
      connect: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
      createDatabase: vi.fn(value => value),
      createRepository,
    })).rejects.toThrow('ACTIVE_PLAN_CONCURRENCY_GATE_FAILED')
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
