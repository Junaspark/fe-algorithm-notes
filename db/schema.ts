import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { Exercise } from '@/domain/exercises/schema'

type AdapterAccountType = 'oauth' | 'oidc' | 'email' | 'webauthn'

export const exerciseKind = pgEnum('exercise_kind', ['algorithm', 'frontend'])
export const planStatus = pgEnum('plan_status', ['active', 'completed'])
export const planItemStatus = pgEnum('plan_item_status', ['pending', 'completed'])
export const submissionStatus = pgEnum('submission_status', ['passed', 'failed'])
export const reviewStatus = pgEnum('review_status', ['pending', 'completed'])
export const jobStatus = pgEnum('job_status', ['queued', 'running', 'succeeded', 'failed', 'dead'])

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  githubLogin: text('githubLogin').notNull(),
})

export const accounts = pgTable('account', {
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<AdapterAccountType>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })])

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable('verificationToken', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (table) => [primaryKey({ columns: [table.identifier, table.token] })])

export const authenticators = pgTable('authenticator', {
  credentialID: text('credentialID').notNull().unique(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerAccountId: text('providerAccountId').notNull(),
  credentialPublicKey: text('credentialPublicKey').notNull(),
  counter: integer('counter').notNull(),
  credentialDeviceType: text('credentialDeviceType').notNull(),
  credentialBackedUp: boolean('credentialBackedUp').notNull(),
  transports: text('transports'),
}, (table) => [primaryKey({ columns: [table.userId, table.credentialID] })])

export const exercises = pgTable('exercises', {
  id: text('id').primaryKey(),
  kind: exerciseKind('kind').notNull(),
  version: integer('version').notNull().default(1),
  content: jsonb('content').$type<Exercise>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dailyPlans = pgTable('daily_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  localDate: text('local_date').notNull(),
  status: planStatus('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('daily_plans_one_active_per_user').on(table.userId).where(sql`${table.status} = 'active'`),
  uniqueIndex('daily_plans_user_local_date').on(table.userId, table.localDate),
])

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
  requestId: text('request_id'),
  code: text('code').notNull(),
  status: submissionStatus('status').notNull(),
  testResult: jsonb('test_result').$type<{ passed: number; failed: number }>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('submissions_user_exercise').on(table.userId, table.exerciseId), uniqueIndex('submissions_user_exercise_request_once').on(table.userId, table.exerciseId, table.requestId)])

export const planItems = pgTable('plan_items', {
  planId: uuid('plan_id').notNull().references(() => dailyPlans.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
  position: integer('position').notNull(),
  status: planItemStatus('status').notNull().default('pending'),
  submissionId: uuid('submission_id').references(() => submissions.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [primaryKey({ columns: [table.planId, table.exerciseId] }), uniqueIndex('plan_items_position').on(table.planId, table.position)])

export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
  code: text('code').notNull(),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('drafts_user_exercise').on(table.userId, table.exerciseId)])

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
  submissionId: uuid('submission_id').references(() => submissions.id),
  status: reviewStatus('status').notNull().default('pending'),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  planId: uuid('plan_id').notNull().references(() => dailyPlans.id),
  submissionId: uuid('submission_id').references(() => submissions.id),
  jobType: text('job_type').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: jobStatus('status').notNull().default('queued'),
  attempt: integer('attempt').notNull().default(1),
  workerId: text('worker_id'),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  payloadVersion: integer('payload_version').notNull(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  result: jsonb('result').$type<unknown>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('agent_jobs_review_submission_once').on(table.submissionId).where(sql`${table.jobType} = 'review-submission' AND ${table.submissionId} IS NOT NULL`),
  uniqueIndex('agent_jobs_owner_idempotency_once').on(table.userId, table.idempotencyKey),
])

export const gitSyncJobs = pgTable('git_sync_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  planId: uuid('plan_id').notNull().references(() => dailyPlans.id),
  status: jobStatus('status').notNull().default('queued'),
  attempt: integer('attempt').notNull().default(1),
  workerId: text('worker_id'),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  expectedHeadSha: text('expected_head_sha'),
  commitSha: text('commit_sha'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('git_sync_jobs_plan_once').on(table.planId)])
