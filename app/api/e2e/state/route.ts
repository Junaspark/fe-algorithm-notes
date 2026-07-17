import { e2eEnabled, getE2EState, resetE2EState } from '@/domain/e2e/state'
const absent = () => new Response(null, { status: 404 })
export async function GET() { return e2eEnabled() ? Response.json(getE2EState()) : absent() }
export async function POST(request: Request) {
  if (!e2eEnabled()) return absent()
  const input = await request.json(); let state = getE2EState()
  if (input.action === 'reset') state = resetE2EState(input)
  if (input.action === 'complete' && state.plan) state.plan.items.find(x => x.exerciseId === input.exerciseId)!.status = 'completed'
  if (input.action === 'submitSecond' && state.plan) { state.plan.items[1].status = 'completed'; state.plan.status = 'completed'; if (!state.gitJobs.length) state.gitJobs.push({ status: 'queued' }); if (!state.agentJobs.length) state.agentJobs.push({ status: 'queued' }) }
  if (input.action === 'gitConflict' && state.gitJobs[0]) Object.assign(state.gitJobs[0], { status: 'failed', retryable: true, error: 'REMOTE_SHA_CONFLICT' })
  if (input.action === 'agentReview' && state.agentJobs[0]) { state.agentJobs[0] = { status: 'succeeded', result: { summary: '优先解释边界条件', improvements: ['明确空数组行为'] } }; state.mistakeNote = 'Mock Agent：注意空数组' }
  return Response.json(state)
}
