import { isAuthorizedCronRequest } from '../auth'
import type { PlanCheckResult } from '@/domain/plans/service'

type EveningService = { runEveningCheck(now: Date): Promise<PlanCheckResult> }

export function createEveningHandler(dependencies: { secret: string } & EveningService) {
  return async function handler(request: Request): Promise<Response> {
    if (!isAuthorizedCronRequest(request, dependencies.secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { planId, created, remainingCount } = await dependencies.runEveningCheck(new Date())
    return Response.json({ planId, created, remainingCount })
  }
}

export async function GET(request: Request): Promise<Response> {
  const { createEveningRuntime } = await import('@/domain/plans/runtime')
  return createEveningHandler({ secret: process.env.CRON_SECRET ?? '', ...await createEveningRuntime() })(request)
}
