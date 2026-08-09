import { describe, expect, it } from 'vitest'
import { calculateProgressMetrics } from '@/domain/progress/metrics'

describe('calculateProgressMetrics', () => {
  it('calculates first-attempt pass rate and the median completion time', () => {
    const metrics = calculateProgressMetrics([
      { exerciseId: 'a', topics: ['array'], attempt: 1, passed: true, durationMs: 10_000, completedAt: '2026-07-11T01:00:00.000Z' },
      { exerciseId: 'b', topics: ['promise'], attempt: 1, passed: false, durationMs: 50_000, completedAt: '2026-07-12T01:00:00.000Z' },
      { exerciseId: 'b', topics: ['promise'], attempt: 2, passed: true, durationMs: 30_000, completedAt: '2026-07-12T01:10:00.000Z' },
      { exerciseId: 'c', topics: ['array', 'object'], attempt: 1, passed: true, durationMs: 20_000, completedAt: '2026-07-13T01:00:00.000Z' },
    ], new Date('2026-07-17T04:00:00.000Z'))

    expect(metrics.firstAttemptPassRate).toBe(2 / 3)
    expect(metrics.medianCompletionTimeMs).toBe(20_000)
  })

  it('reports seven Shanghai calendar days and topic mastery from first attempts', () => {
    const metrics = calculateProgressMetrics([
      { exerciseId: 'a', topics: ['array'], attempt: 1, passed: true, durationMs: 1, completedAt: '2026-07-10T16:00:00.000Z' },
      { exerciseId: 'b', topics: ['array'], attempt: 1, passed: false, durationMs: 1, completedAt: '2026-07-11T16:00:00.000Z' },
      { exerciseId: 'c', topics: ['promise'], attempt: 1, passed: true, durationMs: 1, completedAt: '2026-07-17T15:59:59.000Z' },
    ], new Date('2026-07-17T04:00:00.000Z'))

    expect(metrics.sevenDayCompletion).toEqual([
      { localDate: '2026-07-11', completed: 1 },
      { localDate: '2026-07-12', completed: 0 },
      { localDate: '2026-07-13', completed: 0 },
      { localDate: '2026-07-14', completed: 0 },
      { localDate: '2026-07-15', completed: 0 },
      { localDate: '2026-07-16', completed: 0 },
      { localDate: '2026-07-17', completed: 1 },
    ])
    expect(metrics.masteryByTopic).toEqual([
      { topic: 'array', passed: 1, attempted: 2, rate: 0.5 },
      { topic: 'promise', passed: 1, attempted: 1, rate: 1 },
    ])
  })

  it('returns stable empty metrics', () => {
    expect(calculateProgressMetrics([], new Date('2026-07-17T04:00:00.000Z'))).toMatchObject({
      firstAttemptPassRate: 0,
      medianCompletionTimeMs: 0,
      masteryByTopic: [],
    })
  })
})
