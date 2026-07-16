import { and, eq, inArray, lte, or } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { AgentJobSchema, AgentResultSchema, type AgentAdapter, type AgentJob, type AgentResult } from '@/domain/agents/contracts'
import type { AgentClaim, AgentJobRepository, CompleteExpectation, CompleteOutcome, StoredAgentJob } from '@/domain/agents/orchestrator'

type AgentDatabase<TQuery extends PgQueryResultHKT> = PgDatabase<TQuery, typeof schema>
type AgentJobRow = typeof schema.agentJobs.$inferSelect

function storedFromRow(row: AgentJobRow): StoredAgentJob {
  const job = AgentJobSchema.parse(row.payload)
  const result = row.result ? AgentResultSchema.parse(row.result) : undefined
  return {
    job, status: result?.status === 'retryable' ? 'retryable' : row.status, result,
    workerId: row.workerId ?? undefined, leaseToken: row.leaseToken ?? undefined, leaseUntil: row.leaseUntil ?? undefined,
  }
}

export class DrizzleAgentJobRepository<TQuery extends PgQueryResultHKT> implements AgentJobRepository {
  constructor(private readonly database: AgentDatabase<TQuery>) {}

  async persist(input: AgentJob) {
    const job = AgentJobSchema.parse(input)
    await this.database.insert(schema.agentJobs).values({
      id: job.id,
      userId: job.userId,
      planId: job.planId,
      submissionId: job.submissionId,
      jobType: job.jobType,
      idempotencyKey: job.idempotencyKey,
      attempt: job.attempt,
      payloadVersion: 1,
      payload: job,
    }).onConflictDoNothing()
    const stored = await this.get(job.id)
    if (!stored) throw new Error('AGENT_JOB_PERSIST_FAILED')
    const withoutAttempt = ({ attempt: _attempt, ...value }: AgentJob) => {
      void _attempt
      return value
    }
    if (JSON.stringify(withoutAttempt(stored.job)) !== JSON.stringify(withoutAttempt(job))) throw new Error('AGENT_JOB_IMMUTABLE_MISMATCH')
    return stored
  }

  async get(id: string): Promise<StoredAgentJob | null> {
    const [row] = await this.database.select().from(schema.agentJobs).where(eq(schema.agentJobs.id, id)).limit(1)
    if (!row) return null
    try {
      return storedFromRow(row)
    } catch {
      await this.database.update(schema.agentJobs).set({ status: 'failed', updatedAt: new Date() }).where(eq(schema.agentJobs.id, id))
      return null
    }
  }

  async complete(id: string, input: AgentResult, expected: CompleteExpectation): Promise<CompleteOutcome> {
    const result = AgentResultSchema.parse(input)
    return this.database.transaction(async tx => {
      const [row] = await tx.select().from(schema.agentJobs).where(eq(schema.agentJobs.id, id)).for('update').limit(1)
      if (!row) throw new Error('AGENT_JOB_NOT_FOUND')
      const currentResult = row.result ? AgentResultSchema.parse(row.result) : undefined
      if (row.status === 'succeeded' && currentResult) {
        return { kind: JSON.stringify(currentResult) === JSON.stringify(result) ? 'replay' : 'conflict', stored: storedFromRow(row) }
      }
      if (!expected.statuses.includes(row.status) || row.attempt !== expected.attempt || (expected.leaseToken && row.leaseToken !== expected.leaseToken)) {
        return { kind: 'lost', stored: storedFromRow(row) }
      }
      const databaseStatuses = expected.statuses.filter((status): status is 'queued' | 'running' | 'succeeded' | 'failed' => status !== 'retryable')
      const [updated] = await tx.update(schema.agentJobs).set({
        result, status: result.status === 'succeeded' ? 'succeeded' : 'queued',
        workerId: null, leaseToken: null, leaseUntil: null, updatedAt: new Date(),
      }).where(and(eq(schema.agentJobs.id, id), inArray(schema.agentJobs.status, databaseStatuses), eq(schema.agentJobs.attempt, expected.attempt))).returning()
      return updated ? { kind: 'stored', stored: storedFromRow(updated) } : { kind: 'lost', stored: storedFromRow(row) }
    })
  }

  async markRetryable(id: string, nextAttempt: number, result: AgentResult, expectedAttempt: number) {
    const current = await this.get(id)
    if (!current) throw new Error('AGENT_JOB_NOT_FOUND')
    await this.database.update(schema.agentJobs).set({
      payload: AgentJobSchema.parse({ ...current.job, attempt: nextAttempt }),
      result: AgentResultSchema.parse(result),
      attempt: nextAttempt,
      status: 'queued',
      workerId: null, leaseToken: null, leaseUntil: null,
      updatedAt: new Date(),
    }).where(and(eq(schema.agentJobs.id, id), eq(schema.agentJobs.attempt, expectedAttempt), inArray(schema.agentJobs.status, ['queued', 'running'])))
    return (await this.get(id))!
  }

  async claim(limit = 20, workerId: string, now: Date, leaseMs: number): Promise<AgentClaim[]> {
    return this.database.transaction(async tx => {
      const rows = await tx.select().from(schema.agentJobs)
        .where(or(eq(schema.agentJobs.status, 'queued'), and(eq(schema.agentJobs.status, 'running'), lte(schema.agentJobs.leaseUntil, now))))
        .for('update', { skipLocked: true }).limit(limit)
      const claims: AgentClaim[] = []
      for (const row of rows) {
        let job: AgentJob
        try {
          job = AgentJobSchema.parse(row.payload)
        } catch {
          await tx.update(schema.agentJobs).set({ status: 'failed', updatedAt: now }).where(eq(schema.agentJobs.id, row.id))
          continue
        }
        const leaseToken = crypto.randomUUID()
        const leaseUntil = new Date(now.getTime() + leaseMs)
        await tx.update(schema.agentJobs).set({ status: 'running', workerId, leaseToken, leaseUntil, updatedAt: now }).where(eq(schema.agentJobs.id, row.id))
        claims.push({ job, workerId, leaseToken, leaseUntil: leaseUntil.toISOString() })
      }
      return claims
    })
  }
}

export class CodexBridgeAdapter implements AgentAdapter {
  constructor(private readonly repository: AgentJobRepository) {}

  async dispatch(job: AgentJob) {
    await this.repository.persist(AgentJobSchema.parse(job))
  }

  async getResult(jobId: string) {
    return (await this.repository.get(jobId))?.result ?? null
  }

  async healthCheck() {
    return { healthy: true, adapter: 'codex-bridge', model: 'codex', promptVersion: 'agent-job.v1' }
  }
}
