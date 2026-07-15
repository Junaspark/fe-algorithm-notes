import { describe, expect, it, vi } from 'vitest'

import { createPlanService } from '@/domain/plans/service'
import { createExerciseSelector } from '@/domain/plans/selector'
import type { DailyPlan, PlanRepository } from '@/domain/plans/repository'

const activePlan = {
  id: '10000000-0000-4000-8000-000000000001', userId: 'user-1', localDate: '2026-07-15', status: 'active',
  createdAt: new Date(), completedAt: null,
  items: [
    { planId: '10000000-0000-4000-8000-000000000001', exerciseId: 'alg', position: 0, status: 'pending', submissionId: null, completedAt: null },
    { planId: '10000000-0000-4000-8000-000000000001', exerciseId: 'fe', position: 1, status: 'completed', submissionId: null, completedAt: new Date() },
  ],
} satisfies DailyPlan

const algorithmExercise = { id: 'alg', kind: 'algorithm' as const }
const frontendExercise = { id: 'fe', kind: 'frontend' as const }

const setup = () => {
  const plans = {
    findActive: vi.fn(), create: vi.fn(), markItemComplete: vi.fn(),
  } satisfies PlanRepository
  const selector = { select: vi.fn() }
  const notifications = { send: vi.fn() }
  return { plans, selector, notifications, service: createPlanService({ userId: 'user-1', plans, selector, notifications }) }
}

describe('daily plan service', () => {
  it('reuses an incomplete plan without selecting exercises', async () => {
    const { plans, selector, notifications, service } = setup()
    plans.findActive.mockResolvedValue(activePlan)
    await expect(service.runMorningCheck(new Date('2026-07-16T01:30:00Z'))).resolves.toMatchObject({ planId: activePlan.id, created: false, remainingCount: 1 })
    expect(selector.select).not.toHaveBeenCalled()
    expect(plans.create).not.toHaveBeenCalled()
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ planId: activePlan.id, remainingCount: 1 }))
  })

  it('creates exactly one algorithm and one frontend exercise using the Shanghai date', async () => {
    const { plans, selector, service } = setup()
    plans.findActive.mockResolvedValue(null)
    selector.select.mockResolvedValue([algorithmExercise, frontendExercise])
    plans.create.mockResolvedValue(activePlan)
    const result = await service.runMorningCheck(new Date('2026-07-15T16:30:00Z'))
    expect(plans.create).toHaveBeenCalledWith({ userId: 'user-1', localDate: '2026-07-16', exerciseIds: ['alg', 'fe'] })
    expect(result.created).toBe(true)
  })

  it('rejects selector output without exact algorithm/frontend composition', async () => {
    const { plans, selector, service } = setup()
    plans.findActive.mockResolvedValue(null)
    selector.select.mockResolvedValue([algorithmExercise, { id: 'alg-2', kind: 'algorithm' }])
    await expect(service.runMorningCheck(new Date())).rejects.toThrow('PLAN_REQUIRES_ALGORITHM_AND_FRONTEND')
    expect(plans.create).not.toHaveBeenCalled()
  })

  it('recovers the winning active plan when concurrent creation loses the database race', async () => {
    const { plans, selector, service } = setup()
    plans.findActive.mockResolvedValueOnce(null).mockResolvedValueOnce(activePlan)
    selector.select.mockResolvedValue([algorithmExercise, frontendExercise])
    plans.create.mockRejectedValue(new Error('ACTIVE_PLAN_EXISTS'))
    await expect(service.runMorningCheck(new Date())).resolves.toMatchObject({ planId: activePlan.id, created: false })
    expect(plans.create).toHaveBeenCalledTimes(1)
  })
})

describe('exercise selector', () => {
  it('prioritizes due review, then weak topic, then unseen candidates per kind', async () => {
    const source = {
      findDueReview: vi.fn().mockResolvedValueOnce({ id: 'due-alg', kind: 'algorithm' }).mockResolvedValueOnce(null),
      findWeakTopic: vi.fn().mockResolvedValue({ id: 'weak-fe', kind: 'frontend' }),
      findUnseen: vi.fn(),
    }
    await expect(createExerciseSelector(source).select({ userId: 'user-1', now: new Date() })).resolves.toEqual([
      { id: 'due-alg', kind: 'algorithm' }, { id: 'weak-fe', kind: 'frontend' },
    ])
    expect(source.findUnseen).not.toHaveBeenCalled()
  })
})
