import { describe, expect, it } from 'vitest'
import { orderDueReviews, scheduleTimedInterview, selectNextPendingReview } from '@/domain/reviews/schedule'

describe('review scheduling', () => {
  it('orders overdue reviews first and avoids consecutive topics when alternatives exist', () => {
    const now = new Date('2026-07-17T04:00:00.000Z')
    const ordered = orderDueReviews([
      { id: 'array-1', topic: 'array', dueAt: '2026-07-15T00:00:00.000Z' },
      { id: 'array-2', topic: 'array', dueAt: '2026-07-16T00:00:00.000Z' },
      { id: 'promise-1', topic: 'promise', dueAt: '2026-07-16T12:00:00.000Z' },
      { id: 'future', topic: 'timer', dueAt: '2026-07-18T00:00:00.000Z' },
    ], now)

    expect(ordered.map(item => item.id)).toEqual(['array-1', 'promise-1', 'array-2'])
  })

  it('uses id as the deterministic tie breaker and keeps a sole topic', () => {
    const dueAt = '2026-07-16T00:00:00.000Z'
    expect(orderDueReviews([
      { id: 'b', topic: 'array', dueAt },
      { id: 'a', topic: 'array', dueAt },
    ], new Date('2026-07-17T00:00:00.000Z')).map(item => item.id)).toEqual(['a', 'b'])
  })

  it('schedules exactly one timed interview per seven completed plans', () => {
    expect(scheduleTimedInterview(0)).toBe('practice')
    expect(scheduleTimedInterview(6)).toBe('practice')
    expect(scheduleTimedInterview(7)).toBe('timed')
    expect(scheduleTimedInterview(8)).toBe('practice')
    expect(scheduleTimedInterview(14)).toBe('timed')
  })

  it('shows the earliest pending review for an exercise', () => {
    const next = selectNextPendingReview([
      { exerciseId: 'debounce', status: 'pending', dueAt: new Date('2026-07-20') },
      { exerciseId: 'debounce', status: 'completed', dueAt: new Date('2026-07-17') },
      { exerciseId: 'debounce', status: 'pending', dueAt: new Date('2026-07-18') },
    ], 'debounce')
    expect(next?.dueAt).toEqual(new Date('2026-07-18'))
  })
})
