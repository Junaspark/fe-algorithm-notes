import { describe, expect, it, vi } from 'vitest'

vi.mock('@/db/client', () => ({ db: {}, sqlClient: vi.fn() }))
vi.mock('@/domain/plans/repository', () => ({ createPlanRepository: vi.fn().mockReturnValue({}) }))

import { toSqlTimestamp } from '@/domain/plans/runtime'

describe('scheduled plan selection SQL values', () => {
  it('serializes Date values before passing them to the SQL client', () => {
    expect(toSqlTimestamp(new Date('2026-07-24T04:56:33.000Z'))).toBe('2026-07-24T04:56:33.000Z')
  })
})
