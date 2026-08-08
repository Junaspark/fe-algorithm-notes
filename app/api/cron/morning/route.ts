import type { NotificationMessage } from '@/adapters/notifications/port'
import type { PlanCheckResult } from '@/domain/plans/service'
import { cronErrorCode } from '../cron-error'
import { isAuthorizedCronRequest } from '../auth'
import { publicReminderResponse } from '../reminder-response'

type MorningRuntime = {
  runMorningCheck(now: Date): Promise<PlanCheckResult>
  takeReminder(): NotificationMessage | null
}

type MorningRouteDependencies = {
  getSecret(): string
  createRuntime(): Promise<MorningRuntime>
}

const defaults: MorningRouteDependencies = {
  getSecret: () => process.env.CRON_SECRET ?? '',
  async createRuntime() {
    const { createMorningRuntime } = await import('@/domain/plans/runtime')
    return createMorningRuntime()
  },
}

export function createMorningRoute(dependencies: MorningRouteDependencies = defaults) {
  return async function handler(request: Request): Promise<Response> {
    if (!isAuthorizedCronRequest(request, dependencies.getSecret())) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const now = new Date(request.headers.get('x-e2e-now') ?? Date.now())
    if ((await import('@/domain/e2e/state')).e2eEnabled()) {
      const { getE2EState } = await import('@/domain/e2e/state'); const state = getE2EState(); const created = !state.plan
      if (!state.plan) state.plan = { id: '11111111-1111-4111-8111-111111111111', localDate: '2026-07-17', status: 'active', items: [{ exerciseId: 'unique-array', status: 'pending' }, { exerciseId: 'debounce', status: 'pending' }] }
      const exerciseIds = state.plan.items.filter(x => x.status === 'pending').map(x => x.exerciseId); const reminder = { kind: 'morning' as const, exerciseIds, remainingCount: exerciseIds.length }
      state.reminders.push(reminder); return Response.json({ planId: state.plan.id, created, remainingCount: exerciseIds.length, ...publicReminderResponse({ ...reminder, userId: '00000000-0000-4000-8000-000000000001', planId: state.plan.id }, now) })
    }
    try {
      const runtime = await dependencies.createRuntime()
      const { planId, created, remainingCount } = await runtime.runMorningCheck(now)
      return Response.json({ planId, created, remainingCount, ...publicReminderResponse(runtime.takeReminder(), now) })
    } catch (error) {
      console.error('cron morning failed', { code: cronErrorCode(error) })
      return Response.json({ error: 'Morning check failed' }, { status: 500 })
    }
  }
}

export const GET = createMorningRoute()
