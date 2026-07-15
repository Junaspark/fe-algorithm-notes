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
    const runtime = await dependencies.createRuntime()
    const { planId, created, remainingCount } = await runtime.runMorningCheck(new Date())
    return Response.json({ planId, created, remainingCount, reminder: runtime.takeReminder() })
  }
}

export const GET = createMorningRoute()
