import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

import { resolveDatabaseUrl } from '@/db/connection-string'
import * as schema from '@/db/schema'
import { createPlanRepository } from '@/domain/plans/repository'

type QueryClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>
  end(): Promise<void>
}

type Connect = (url: string) => QueryClient

type ProbePlan = { id: string }
type ProbeRepository = {
  create(input: { userId: string; localDate: string; exerciseIds: string[] }): Promise<ProbePlan>
  findActive(userId: string): Promise<ProbePlan | null>
}

type Dependencies = {
  connect?: Connect
  createDatabase?: (client: QueryClient) => unknown
  createRepository?: (database: unknown) => ProbeRepository
}

export async function verifyLiveDatabase(url: string, dependencies: Dependencies = {}) {
  const connect = dependencies.connect ?? (value => postgres(value, { max: 1 }) as unknown as QueryClient)
  const createDatabase = dependencies.createDatabase ?? (client => drizzle(client as never, { schema }))
  const createRepository = dependencies.createRepository ?? (database => createPlanRepository(database as never))
  const first = connect(url)
  const second = connect(url)
  let probeUserId: string | undefined

  try {
    const [[firstBackend], [secondBackend]] = await Promise.all([
      first`select pg_backend_pid() as pid`,
      second`select pg_backend_pid() as pid`,
    ])
    const firstPid = Number(firstBackend?.pid)
    const secondPid = Number(secondBackend?.pid)
    if (!Number.isInteger(firstPid) || !Number.isInteger(secondPid) || firstPid === secondPid) {
      throw new Error('INDEPENDENT_DATABASE_CONNECTIONS_REQUIRED')
    }

    const [seed] = await first`select count(*)::integer as count from exercises where active = true`
    const exerciseCount = Number(seed?.count)
    if (exerciseCount !== 19) throw new Error(`EXPECTED_19_EXERCISES: received ${exerciseCount}`)

    const exercises = await first`select id, kind from exercises where active = true and kind in ('algorithm', 'frontend') order by id`
    const algorithm = exercises.find(row => row.kind === 'algorithm')?.id
    const frontend = exercises.find(row => row.kind === 'frontend')?.id
    if (typeof algorithm !== 'string' || typeof frontend !== 'string') throw new Error('LIVE_PROBE_EXERCISES_REQUIRED')

    probeUserId = crypto.randomUUID()
    const probeId = Date.now()
    const firstInput = { userId: probeUserId, localDate: `live-gate-${probeId}-a`, exerciseIds: [algorithm, frontend] }
    const secondInput = { userId: probeUserId, localDate: `live-gate-${probeId}-b`, exerciseIds: [algorithm, frontend] }
    const firstRepository = createRepository(createDatabase(first))
    const secondRepository = createRepository(createDatabase(second))
    const results = await Promise.allSettled([firstRepository.create(firstInput), secondRepository.create(secondInput)])
    const successes = results.filter((result): result is PromiseFulfilledResult<ProbePlan> => result.status === 'fulfilled')
    const conflicts = results.filter(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.message === 'ACTIVE_PLAN_EXISTS')
    if (successes.length !== 1 || conflicts.length !== 1) throw new Error('ACTIVE_PLAN_CONCURRENCY_GATE_FAILED')

    const [firstView, secondView] = await Promise.all([
      firstRepository.findActive(probeUserId),
      secondRepository.findActive(probeUserId),
    ])
    if (!firstView || !secondView || firstView.id !== successes[0].value.id || secondView.id !== successes[0].value.id) {
      throw new Error('ACTIVE_PLAN_CROSS_CONNECTION_VISIBILITY_FAILED')
    }

    return { firstPid, secondPid, exerciseCount, concurrency: 'ACTIVE_PLAN_EXISTS' as const }
  } finally {
    let cleanupError: unknown
    try {
      if (probeUserId) await first`delete from daily_plans where user_id = ${probeUserId}`
    } catch (error) {
      cleanupError = error
    }
    await Promise.allSettled([first.end(), second.end()])
    if (cleanupError) throw new Error('LIVE_PROBE_CLEANUP_FAILED', { cause: cleanupError })
  }
}

if (process.argv[1]?.endsWith('verify-live-database.ts')) {
  const result = await verifyLiveDatabase(resolveDatabaseUrl(process.env))
  console.log(`live database gate passed: two backends (${result.firstPid}, ${result.secondPid}), ${result.exerciseCount} exercises, ${result.concurrency}`)
}
