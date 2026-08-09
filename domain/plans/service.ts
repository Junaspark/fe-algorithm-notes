import type { NotificationPort } from '@/adapters/notifications/port'
import type { DailyPlan, PlanRepository } from './repository'
import type { ExerciseSelector, SelectedExercise } from './selector'
import { scheduleTimedInterview } from '@/domain/reviews/schedule'

export type PlanCheckResult = { planId: string | null; created: boolean; remainingCount: number; plan?: DailyPlan }

const localDate = (now: Date): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now)

const pendingIds = (plan: DailyPlan) => plan.items.filter(({ status }) => status === 'pending').map(({ exerciseId }) => exerciseId)

const isActivePlanConflict = (error: unknown) => error instanceof Error && error.message === 'ACTIVE_PLAN_EXISTS'

export function createPlanService(dependencies: {
  userId: string
  plans: PlanRepository
  selector: ExerciseSelector
  notifications: NotificationPort
}) {
  const notify = async (plan: DailyPlan) => {
    const exerciseIds = pendingIds(plan)
    await dependencies.notifications.send({ kind: 'morning', userId: dependencies.userId, planId: plan.id, remainingCount: exerciseIds.length, exerciseIds })
  }

  return {
    async runMorningCheck(now: Date): Promise<PlanCheckResult> {
      let plan = await dependencies.plans.findActive(dependencies.userId)
      if (plan) {
        await notify(plan)
        return { planId: plan.id, created: false, remainingCount: pendingIds(plan).length, plan }
      }

      const selected = await dependencies.selector.select({ userId: dependencies.userId, now })
      assertComposition(selected)
      const mode = scheduleTimedInterview(await dependencies.plans.countCompleted(dependencies.userId))
      try {
        plan = await dependencies.plans.create({ userId: dependencies.userId, localDate: localDate(now), exerciseIds: selected.map(({ id }) => id), mode })
      } catch (error) {
        if (!isActivePlanConflict(error)) throw error
        plan = await dependencies.plans.findActive(dependencies.userId)
        if (!plan) throw error
        await notify(plan)
        return { planId: plan.id, created: false, remainingCount: pendingIds(plan).length, plan }
      }
      await notify(plan)
      return { planId: plan.id, created: true, remainingCount: pendingIds(plan).length, plan }
    },
  }
}

function assertComposition(exercises: SelectedExercise[]): asserts exercises is [SelectedExercise, SelectedExercise] {
  if (exercises.length !== 2 || exercises.filter(({ kind }) => kind === 'algorithm').length !== 1 || exercises.filter(({ kind }) => kind === 'frontend').length !== 1) {
    throw new Error('PLAN_REQUIRES_ALGORITHM_AND_FRONTEND')
  }
}
