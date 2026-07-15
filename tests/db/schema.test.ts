import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
  agentJobs,
  dailyPlans,
  drafts,
  exercises,
  gitSyncJobs,
  planItems,
  reviews,
  submissions,
} from '@/db/schema'

describe('PostgreSQL training schema', () => {
  it('defines every durable training table', () => {
    expect([
      exercises,
      dailyPlans,
      planItems,
      drafts,
      submissions,
      reviews,
      agentJobs,
      gitSyncJobs,
    ].map((table) => getTableConfig(table).name)).toEqual([
      'exercises',
      'daily_plans',
      'plan_items',
      'drafts',
      'submissions',
      'reviews',
      'agent_jobs',
      'git_sync_jobs',
    ])
  })

  it('uses a partial unique index to allow only one active plan per user', () => {
    const index = getTableConfig(dailyPlans).indexes.find(({ config }) => config.name === 'daily_plans_one_active_per_user')

    expect(index?.config.unique).toBe(true)
    expect(index?.config.where).toBeDefined()
  })

  it('stores Shanghai plan dates as local_date strings and instants with timezone', () => {
    const plan = getTableConfig(dailyPlans)
    const localDate = plan.columns.find(({ name }) => name === 'local_date')
    const createdAt = plan.columns.find(({ name }) => name === 'created_at')

    expect(localDate?.getSQLType()).toBe('text')
    expect(createdAt?.getSQLType()).toContain('with time zone')
  })
})
