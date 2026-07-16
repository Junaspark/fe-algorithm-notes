import { timingSafeEqual } from 'node:crypto'
import { AgentJobSchema } from '@/domain/agents/contracts'
import { getAgentJobStore } from './store'

function authenticated(request: Request, secret: string) {
  const supplied = request.headers.get('x-agent-bridge-secret')
  if (!supplied) return false
  const actual = Buffer.from(supplied)
  const expected = Buffer.from(secret)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(request: Request) {
  const secret = process.env.AGENT_BRIDGE_SECRET
  if (!secret) return Response.json({ error: 'Agent bridge is disabled' }, { status: 503 })
  if (!authenticated(request, secret)) return Response.json({ error: 'Invalid bridge secret' }, { status: 401 })
  const repository = await getAgentJobStore()
  const pending = repository.pending ? await repository.pending(20) : []
  return Response.json({ schemaVersion: 'agent-job.v1', jobs: pending.map(job => AgentJobSchema.parse(job)) })
}
