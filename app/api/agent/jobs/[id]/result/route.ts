import { createHmac, timingSafeEqual } from 'node:crypto'
import { AgentResultSchema, MAX_AGENT_MESSAGE_BYTES } from '@/domain/agents/contracts'
import type { AgentJobRepository } from '@/domain/agents/orchestrator'
import { getAgentJobStore, setAgentJobStoreForTests } from '../../store'

export function setAgentCallbackStoreForTests(repository?: AgentJobRepository) {
  setAgentJobStoreForTests(repository)
}

function validSignature(body: string, signature: string | null, secret: string) {
  if (!signature?.startsWith('sha256=')) return false
  const supplied = Buffer.from(signature.slice(7), 'hex')
  const expected = createHmac('sha256', secret).update(body).digest()
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const secret = process.env.AGENT_BRIDGE_SECRET
  if (!secret) return Response.json({ error: 'Agent bridge is disabled' }, { status: 503 })
  const body = await request.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_AGENT_MESSAGE_BYTES) return Response.json({ error: 'Payload too large' }, { status: 413 })
  if (!validSignature(body, request.headers.get('x-agent-signature'), secret)) return Response.json({ error: 'Invalid signature' }, { status: 401 })

  let result
  try {
    result = AgentResultSchema.parse(JSON.parse(body))
  } catch {
    return Response.json({ error: 'Invalid Agent result' }, { status: 400 })
  }
  const { id } = await context.params
  const repository = await getAgentJobStore()
  const stored = await repository.get(id)
  if (!stored) return Response.json({ error: 'Agent job not found' }, { status: 404 })
  if (result.jobId !== id || result.idempotencyKey !== stored.job.idempotencyKey || result.jobType !== stored.job.jobType) {
    return Response.json({ error: 'Agent result does not match job' }, { status: 409 })
  }
  if (Date.now() > new Date(stored.job.deadline).getTime()) return Response.json({ error: 'Agent job expired' }, { status: 410 })
  await repository.saveResult(id, result)
  return Response.json({ accepted: true }, { status: 202 })
}
