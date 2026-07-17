import fs from 'node:fs'
import path from 'node:path'
import type { Exercise } from '@/domain/exercises/schema'

export const e2eEnabled = () => process.env.E2E_COMPILED === '1' && process.env.E2E_TEST_MODE === '1'
export type E2EState = {
  exercises: Array<{ id: string; kind: 'algorithm' | 'frontend'; content: Exercise }>
  drafts: Record<string, { code: string; version: number }>
  plan: null | { id: string; localDate: string; status: 'active' | 'completed'; items: Array<{ exerciseId: string; status: 'pending' | 'completed' }> }
  reminders: unknown[]; submissions: Array<{ exerciseId: string; code: string; status: 'passed' | 'failed'; durationMs: number }>
  gitJobs: Array<{ status: string; retryable?: boolean; error?: string }>; agentJobs: Array<{ status: string; result?: unknown }>; mistakeNote?: string
}
const loadExercises = () => fs.readdirSync(path.join(process.cwd(), 'exercises')).filter(x => x.endsWith('.json')).sort().map(file => { const content = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'exercises', file), 'utf8')) as Exercise; return { id: file.slice(0, -5), kind: content.kind, content } })
const fresh = (): E2EState => ({ exercises: loadExercises(), drafts: {}, plan: null, reminders: [], submissions: [], gitJobs: [], agentJobs: [] })
const globalState = globalThis as typeof globalThis & { __gymE2E?: E2EState }
export const getE2EState = () => globalState.__gymE2E ??= fresh()
export function resetE2EState(options: { withPlan?: boolean; completedPlan?: boolean } = {}) {
  const state = fresh(); globalState.__gymE2E = state
  if (options.withPlan || options.completedPlan) state.plan = { id: '11111111-1111-4111-8111-111111111111', localDate: '2026-07-17', status: options.completedPlan ? 'completed' : 'active', items: [{ exerciseId: 'unique-array', status: options.completedPlan ? 'completed' : 'pending' }, { exerciseId: 'debounce', status: options.completedPlan ? 'completed' : 'pending' }] }
  if (options.completedPlan) { state.gitJobs.push({ status: 'queued' }); state.agentJobs.push({ status: 'queued' }) }
  return state
}
