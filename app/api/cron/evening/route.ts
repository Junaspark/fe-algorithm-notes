import type { NotificationMessage } from '@/adapters/notifications/port'
import type { PlanCheckResult } from '@/domain/plans/service'
import { isAuthorizedCronRequest } from '../auth'

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
    if (process.env.E2E_COMPILED === '1' && process.env.E2E_TEST_MODE === '1') {
      const { getE2EState } = await import('@/domain/e2e/state'); const state = getE2EState(); const exerciseIds = state.plan?.items.filter(x => x.status === 'pending').map(x => x.exerciseId) ?? []
      const reminder = exerciseIds.length ? { kind: 'evening', exerciseIds, remainingCount: exerciseIds.length } : null; if (reminder) state.reminders.push(reminder)
      return Response.json({ planId: state.plan?.id ?? null, created: false, remainingCount: exerciseIds.length, reminder })
    }
    const runtime = await dependencies.createRuntime()
    const { planId, created, remainingCount } = await runtime.runEveningCheck(new Date(request.headers.get('x-e2e-now') ?? Date.now()))
    return Response.json({ planId, created, remainingCount, reminder: runtime.takeReminder() })
  }
}

export const GET = createEveningRoute()
