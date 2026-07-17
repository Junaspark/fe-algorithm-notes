import type { NotificationMessage } from '@/adapters/notifications/port'
import type { PlanCheckResult } from '@/domain/plans/service'
import { isAuthorizedCronRequest } from '../auth'

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
    if (process.env.E2E_COMPILED === '1' && process.env.E2E_TEST_MODE === '1') {
      const { getE2EState } = await import('@/domain/e2e/state'); const state = getE2EState(); const created = !state.plan
      if (!state.plan) state.plan = { id: '11111111-1111-4111-8111-111111111111', localDate: '2026-07-17', status: 'active', items: [{ exerciseId: 'unique-array', status: 'pending' }, { exerciseId: 'debounce', status: 'pending' }] }
      const exerciseIds = state.plan.items.filter(x => x.status === 'pending').map(x => x.exerciseId); const reminder = { kind: 'morning', exerciseIds, remainingCount: exerciseIds.length }
      state.reminders.push(reminder); return Response.json({ planId: state.plan.id, created, remainingCount: exerciseIds.length, reminder })
    }
    const runtime = await dependencies.createRuntime()
    const { planId, created, remainingCount } = await runtime.runMorningCheck(new Date(request.headers.get('x-e2e-now') ?? Date.now()))
    return Response.json({ planId, created, remainingCount, reminder: runtime.takeReminder() })
  }
}

export const GET = createMorningRoute()
