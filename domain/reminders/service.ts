import type { NotificationPort } from '@/adapters/notifications/port'
import type { PlanCheckResult } from '@/domain/plans/service'
import type { PlanRepository } from '@/domain/plans/repository'

export function createReminderService(dependencies: {
  userId: string
  plans: Pick<PlanRepository, 'findActive'>
  notifications: NotificationPort
}) {
  return {
    async runEveningCheck(now: Date): Promise<PlanCheckResult> {
      void now
      const plan = await dependencies.plans.findActive(dependencies.userId)
      if (!plan) return { planId: null, created: false, remainingCount: 0 }
      const exerciseIds = plan.items.filter(({ status }) => status === 'pending').map(({ exerciseId }) => exerciseId)
      if (exerciseIds.length > 0) {
        await dependencies.notifications.send({ kind: 'evening', userId: dependencies.userId, planId: plan.id, remainingCount: exerciseIds.length, exerciseIds })
      }
      return { planId: plan.id, created: false, remainingCount: exerciseIds.length }
    },
  }
}
