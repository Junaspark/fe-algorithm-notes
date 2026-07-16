import { timingSafeEqual } from 'node:crypto'
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
  const workerId = request.headers.get('x-agent-worker-id') || crypto.randomUUID()
  const jobs = await repository.claim(20, workerId, new Date(), 5 * 60 * 1000)
  return Response.json({ schemaVersion: 'agent-job.v1', jobs })
}
