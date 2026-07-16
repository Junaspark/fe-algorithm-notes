import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { AgentJobSchema, AgentResultSchema, type AgentAdapter, type AgentJob, type AgentResult } from '@/domain/agents/contracts'
import type { AgentJobRepository, StoredAgentJob } from '@/domain/agents/orchestrator'

type AgentDatabase<TQuery extends PgQueryResultHKT> = PgDatabase<TQuery, typeof schema>

export class DrizzleAgentJobRepository<TQuery extends PgQueryResultHKT> implements AgentJobRepository {
  constructor(private readonly database: AgentDatabase<TQuery>) {}

  async persist(input: AgentJob) {
    const job = AgentJobSchema.parse(input)
    await this.database.insert(schema.agentJobs).values({
      id: job.id,
      userId: job.userId,
      planId: job.planId,
      submissionId: job.submissionId!,
      payloadVersion: 1,
      payload: job,
    }).onConflictDoNothing()
    const stored = await this.get(job.id)
    if (!stored) throw new Error('AGENT_JOB_PERSIST_FAILED')
    return stored
  }

  async get(id: string): Promise<StoredAgentJob | null> {
    const [row] = await this.database.select().from(schema.agentJobs).where(eq(schema.agentJobs.id, id)).limit(1)
    if (!row) return null
    const job = AgentJobSchema.parse(row.payload)
    const result = row.result ? AgentResultSchema.parse(row.result) : undefined
    return { job, status: result?.status === 'retryable' ? 'retryable' : row.status, result }
  }

  async saveResult(id: string, input: AgentResult) {
    const result = AgentResultSchema.parse(input)
    await this.database.update(schema.agentJobs).set({
      result,
      status: result.status === 'succeeded' ? 'succeeded' : 'queued',
      updatedAt: new Date(),
    }).where(and(eq(schema.agentJobs.id, id), inArray(schema.agentJobs.status, ['queued', 'running'])))
    const stored = await this.get(id)
    if (!stored) throw new Error('AGENT_JOB_NOT_FOUND')
    return stored
  }

  async markRetryable(id: string, nextAttempt: number, result: AgentResult) {
    const current = await this.get(id)
    if (!current) throw new Error('AGENT_JOB_NOT_FOUND')
    await this.database.update(schema.agentJobs).set({
      payload: AgentJobSchema.parse({ ...current.job, attempt: nextAttempt }),
      result: AgentResultSchema.parse(result),
      status: 'queued',
      updatedAt: new Date(),
    }).where(eq(schema.agentJobs.id, id))
    return (await this.get(id))!
  }

  async pending(limit = 20) {
    const rows = await this.database.select().from(schema.agentJobs).where(eq(schema.agentJobs.status, 'queued')).limit(limit)
    return rows.map(row => AgentJobSchema.parse(row.payload))
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
