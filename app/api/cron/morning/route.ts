import { isAuthorizedCronRequest } from '../auth'
import type { PlanCheckResult } from '@/domain/plans/service'

type MorningService = { runMorningCheck(now: Date): Promise<PlanCheckResult> }

export function createMorningHandler(dependencies: { secret: string } & MorningService) {
  return async function handler(request: Request): Promise<Response> {
    if (!isAuthorizedCronRequest(request, dependencies.secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { planId, created, remainingCount } = await dependencies.runMorningCheck(new Date())
    return Response.json({ planId, created, remainingCount })
  }
}

export async function GET(request: Request): Promise<Response> {
  const { createMorningRuntime } = await import('@/domain/plans/runtime')
  return createMorningHandler({ secret: process.env.CRON_SECRET ?? '', ...await createMorningRuntime() })(request)
}
