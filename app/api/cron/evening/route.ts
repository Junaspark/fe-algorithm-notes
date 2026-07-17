import type { NotificationMessage } from '@/adapters/notifications/port'
import type { PlanCheckResult } from '@/domain/plans/service'
import { isAuthorizedCronRequest } from '../auth'
import { reminderDelivery } from '@/domain/reminders/delivery'

type EveningRuntime = {
  runEveningCheck(now: Date): Promise<PlanCheckResult>
  takeReminder(): NotificationMessage | null
}

type EveningRouteDependencies = {
  getSecret(): string
  createRuntime(): Promise<EveningRuntime>
}

const defaults: EveningRouteDependencies = {
  getSecret: () => process.env.CRON_SECRET ?? '',
  async createRuntime() {
    const { createEveningRuntime } = await import('@/domain/plans/runtime')
    return createEveningRuntime()
  },
}

export function createEveningRoute(dependencies: EveningRouteDependencies = defaults) {
  return async function handler(request: Request): Promise<Response> {
    if (!isAuthorizedCronRequest(request, dependencies.getSecret())) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const now = new Date(request.headers.get('x-e2e-now') ?? Date.now())
    if ((await import('@/domain/e2e/state')).e2eEnabled()) {
      const { getE2EState } = await import('@/domain/e2e/state'); const state = getE2EState(); const exerciseIds = state.plan?.items.filter(x => x.status === 'pending').map(x => x.exerciseId) ?? []
      const reminder = exerciseIds.length ? { kind: 'evening' as const, exerciseIds, remainingCount: exerciseIds.length } : null; if (reminder) state.reminders.push(reminder)
      return Response.json({ planId: state.plan?.id ?? null, created: false, remainingCount: exerciseIds.length, reminder, delivery: reminderDelivery(reminder ? { ...reminder, userId: '00000000-0000-4000-8000-000000000001', planId: state.plan!.id } : null, now) })
    }
    const runtime = await dependencies.createRuntime()
    const { planId, created, remainingCount } = await runtime.runEveningCheck(now)
    const reminder = runtime.takeReminder()
    return Response.json({ planId, created, remainingCount, reminder, delivery: reminderDelivery(reminder, now) })
  }
}

export const GET = createEveningRoute()
