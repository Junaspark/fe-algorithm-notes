import { z } from 'zod'

export const AGENT_SCHEMA_VERSION = 'agent-job.v1' as const
export const MAX_AGENT_MESSAGE_BYTES = 64 * 1024
export const MAX_REVIEW_CODE_BYTES = 48 * 1024
export const utf8ByteLength = (value: string) => new TextEncoder().encode(value).byteLength

const UuidSchema = z.string().uuid()
const IsoDateSchema = z.string().datetime({ offset: true })
const MetadataSchema = z.object({
  adapter: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  promptVersion: z.string().min(1).max(100),
}).strict()

const ReviewContextSchema = z.object({
  exerciseId: z.string().min(1).max(200),
  exerciseKind: z.enum(['algorithm', 'frontend']),
  code: z.string().min(1).refine(value => utf8ByteLength(value) <= MAX_REVIEW_CODE_BYTES, 'Review code exceeds UTF-8 byte limit'),
  testSummary: z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }).strict(),
}).strict()

const SelectionContextSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  candidates: z.array(z.object({
    id: z.string().min(1).max(200),
    kind: z.enum(['algorithm', 'frontend']),
    difficulty: z.enum(['easy', 'medium', 'hard']),
  }).strict()).max(100),
  recentExerciseIds: z.array(z.string().min(1).max(200)).max(100),
}).strict()

const JobBaseSchema = z.object({
  schemaVersion: z.literal(AGENT_SCHEMA_VERSION),
  id: UuidSchema,
  userId: UuidSchema,
  planId: UuidSchema,
  submissionId: UuidSchema.optional(),
  idempotencyKey: z.string().min(1).max(300),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1).max(10),
  deadline: IsoDateSchema,
}).strict()

export const AgentJobSchema = z.discriminatedUnion('jobType', [
  JobBaseSchema.extend({
    jobType: z.literal('review-submission'),
    submissionId: UuidSchema,
    context: ReviewContextSchema,
  }).strict(),
  JobBaseSchema.extend({
    jobType: z.literal('select-exercises'),
    context: SelectionContextSchema,
  }).strict(),
]).superRefine((value, context) => {
  if (value.attempt > value.maxAttempts) context.addIssue({ code: 'custom', message: 'attempt exceeds maxAttempts' })
  if (utf8ByteLength(JSON.stringify(value)) > MAX_AGENT_MESSAGE_BYTES) context.addIssue({ code: 'custom', message: 'Agent job exceeds 64 KiB' })
})

const ResultBaseSchema = z.object({
  schemaVersion: z.literal(AGENT_SCHEMA_VERSION),
  jobId: UuidSchema,
  idempotencyKey: z.string().min(1).max(300),
  completedAt: IsoDateSchema,
  metadata: MetadataSchema,
}).strict()

const ReviewPayloadSchema = z.object({
  summary: z.string().min(1).max(2000),
  strengths: z.array(z.string().min(1).max(500)).max(10),
  improvements: z.array(z.string().min(1).max(500)).max(10),
  followUpQuestions: z.array(z.string().min(1).max(500)).max(10),
}).strict()

const SelectionPayloadSchema = z.object({
  algorithmExerciseId: z.string().min(1).max(200),
  frontendExerciseId: z.string().min(1).max(200),
  rationale: z.string().min(1).max(2000),
}).strict()

const RetryableResultSchema = ResultBaseSchema.extend({
  status: z.literal('retryable'),
  jobType: z.enum(['select-exercises', 'review-submission']),
  error: z.object({ code: z.enum(['timeout', 'temporary_failure']), message: z.string().min(1).max(500) }).strict(),
}).strict()

export const AgentResultSchema = z.discriminatedUnion('status', [
  z.discriminatedUnion('jobType', [
    ResultBaseSchema.extend({ status: z.literal('succeeded'), jobType: z.literal('review-submission'), payload: ReviewPayloadSchema }).strict(),
    ResultBaseSchema.extend({ status: z.literal('succeeded'), jobType: z.literal('select-exercises'), payload: SelectionPayloadSchema }).strict(),
  ]),
  RetryableResultSchema,
]).superRefine((value, context) => {
  if (utf8ByteLength(JSON.stringify(value)) > MAX_AGENT_MESSAGE_BYTES) context.addIssue({ code: 'custom', message: 'Agent result exceeds 64 KiB' })
})

export type AgentJob = z.infer<typeof AgentJobSchema>
export type AgentResult = z.infer<typeof AgentResultSchema>
export type AgentMetadata = z.infer<typeof MetadataSchema>

export interface AgentAdapter {
  dispatch(job: AgentJob): Promise<void>
  getResult(jobId: string): Promise<AgentResult | null>
  healthCheck(): Promise<AgentMetadata & { healthy: boolean }>
}
