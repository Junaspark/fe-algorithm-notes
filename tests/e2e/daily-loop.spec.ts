import { expect, test } from '@playwright/test'
import { createPlanService } from '../../domain/plans/service'
import { createReminderService } from '../../domain/reminders/service'
import type { DailyPlan } from '../../domain/plans/repository'

test('morning creates once, carries incomplete work, evening reminds, and carries only the remnant', async () => {
  let active: DailyPlan | null = null
  const sent: Array<{ kind: string; exerciseIds: string[] }> = []
  const plans = {
    findActive: async () => active,
    create: async ({ localDate, exerciseIds }: { localDate: string; exerciseIds: string[] }) => active = { id: '11111111-1111-4111-8111-111111111111', userId: 'owner', localDate, status: 'active', createdAt: new Date(), completedAt: null, items: exerciseIds.map((exerciseId, position) => ({ planId: '11111111-1111-4111-8111-111111111111', exerciseId, position, status: 'pending' as const, submissionId: null, completedAt: null })) },
  }
  const notifications = { send: async (message: { kind: string; exerciseIds: string[] }) => { sent.push(message) } }
  const morning = createPlanService({ userId: 'owner', plans: plans as never, notifications, selector: { select: async () => [{ id: 'unique-array', kind: 'algorithm' }, { id: 'debounce', kind: 'frontend' }] } })
  expect((await morning.runMorningCheck(new Date('2026-07-17T01:30:00Z'))).created).toBe(true)
  expect((await morning.runMorningCheck(new Date('2026-07-18T01:30:00Z'))).created).toBe(false)
  active!.items[0].status = 'completed'
  const evening = createReminderService({ userId: 'owner', plans: plans as never, notifications })
  expect((await evening.runEveningCheck(new Date('2026-07-18T12:00:00Z'))).remainingCount).toBe(1)
  expect((await morning.runMorningCheck(new Date('2026-07-19T01:30:00Z'))).remainingCount).toBe(1)
  expect(sent.at(-1)?.exerciseIds).toEqual(['debounce'])
})

test('all 19 migrated exercises are searchable in a browser', async ({ page }) => {
  await page.goto('/tests/browser/runner.html')
  const records = await page.evaluate(async () => {
    const ids = ['unique-array','throttle','debounce','curry','deep-clone','event-emitter','promise-all','promise-race','promise-all-settled','promise-any','my-set-interval','lru-cache','event-loop-01','event-loop-02','event-loop-03','event-loop-04','event-loop-05','event-loop-06','event-loop-07']
    return Promise.all(ids.map(id => fetch(`/exercises/${id}.json`).then(response => response.json())))
  })
  expect(records).toHaveLength(19)
  expect(records.filter(record => `${record.title} ${record.prompt}`.toLowerCase().includes('promise')).length).toBeGreaterThan(0)
})
