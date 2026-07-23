import { afterEach, describe, expect, it, vi } from 'vitest'

const { createPlanService, createReminderService } = vi.hoisted(() => ({
  createPlanService: vi.fn().mockReturnValue({ runMorningCheck: vi.fn() }),
  createReminderService: vi.fn().mockReturnValue({ runEveningCheck: vi.fn() }),
}))

vi.mock('@/db/client', () => ({ db: {}, sqlClient: vi.fn() }))
vi.mock('@/domain/plans/repository', () => ({ createPlanRepository: vi.fn().mockReturnValue({}) }))
vi.mock('@/domain/plans/selector', () => ({ createExerciseSelector: vi.fn().mockReturnValue({}) }))
vi.mock('@/domain/plans/service', () => ({ createPlanService }))
vi.mock('@/domain/reminders/service', () => ({ createReminderService }))

import { createEveningRuntime, createMorningRuntime } from '@/domain/plans/runtime'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('scheduled plan runtimes', () => {
  it('uses the resolved owner for both scheduled runtimes', async () => {
    vi.stubEnv('OWNER_USER_ID', 'environment-owner')
    const resolveOwner = vi.fn().mockResolvedValue('owner-3')

    await createMorningRuntime({ resolveOwner })
    await createEveningRuntime({ resolveOwner })

    expect(resolveOwner).toHaveBeenCalledTimes(2)
    expect(createPlanService).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-3' }))
    expect(createReminderService).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-3' }))
  })
})
