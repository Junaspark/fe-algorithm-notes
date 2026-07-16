import { z } from 'zod'

const Evidence = z.object({
  scope: z.literal('full'), requestId: z.string().min(1),
  tests: z.array(z.object({ name: z.string().min(1), status: z.enum(['passed', 'failed', 'error', 'timeout']) })).min(1),
}).refine(value => value.tests.every(test => test.status === 'passed'), 'Every full test must pass')
const Input = z.object({
  exerciseId: z.string().regex(/^[a-z0-9-]+$/), code: z.string().min(1).max(48 * 1024),
  evidence: Evidence, complexityAnswer: z.string().min(1).max(500), elapsedSeconds: z.number().int().min(0).max(86_400),
})
export type SubmissionInput = z.infer<typeof Input> & { userId: string }
type Result = { submissionId: string; completed: boolean; planCompleted: boolean }
type Dependencies = { authenticate(): Promise<{ user?: { id?: string } } | null>; submit(input: SubmissionInput): Promise<Result> }

export function createSubmissionRoute(deps: Dependencies) {
  return async function POST(request: Request) {
    const session = await deps.authenticate()
    const userId = session?.user?.id
    if (!userId) return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })
    const raw = await request.json().catch(() => null)
    const parsed = Input.safeParse(raw)
    if (!parsed.success) {
      const evidenceOnly = z.object({ evidence: z.object({ scope: z.string().optional(), tests: z.array(z.object({ status: z.string() })).optional() }).optional() }).safeParse(raw)
      const evidence = evidenceOnly.success ? evidenceOnly.data.evidence : undefined
      const oversized = typeof raw === 'object' && raw !== null && 'code' in raw && typeof raw.code === 'string' && raw.code.length > 48 * 1024
      const status = oversized ? 413 : evidence && (evidence.scope !== 'full' || evidence.tests?.some(test => test.status !== 'passed')) ? 422 : 400
      return Response.json({ code: oversized ? 'SUBMISSION_TOO_LARGE' : status === 422 ? 'FULL_TEST_EVIDENCE_REQUIRED' : 'INVALID_SUBMISSION', issues: parsed.error.issues }, { status })
    }
    return Response.json(await deps.submit({ userId, ...parsed.data }), { status: 201 })
  }
}

export const POST = async (request: Request) => createSubmissionRoute({
  authenticate: async () => (await import('@/auth')).auth(),
  submit: async input => (await import('@/domain/submissions/service')).persistPassingSubmission(input),
})(request)
