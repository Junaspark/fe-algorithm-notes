import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createExecutionAttestation, normalizedCodeHash } from '@/domain/submissions/execution-attestation'

const Input = z.object({
  exerciseId: z.string().regex(/^[a-z0-9-]+$/), code: z.string().min(1), requestId: z.string().min(1),
  tests: z.array(z.object({ name: z.string().min(1), status: z.literal('passed') })).min(1),
})

export function createAttestationRoute(deps: { authenticate(): Promise<{ user?: { id?: string } } | null>; issue(input: z.infer<typeof Input> & { userId: string }): Promise<string> }) {
  return async (request: Request) => {
    const userId = (await deps.authenticate())?.user?.id
    if (!userId) return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })
    const parsed = Input.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ code: 'PASSING_WORKER_RESULT_REQUIRED' }, { status: 422 })
    try { return Response.json({ attestation: await deps.issue({ userId, ...parsed.data }) }, { status: 201 }) }
    catch (error) { return Response.json({ code: error instanceof Error ? error.message : 'ATTESTATION_FAILED' }, { status: 422 }) }
  }
}

export const POST = async (request: Request) => {
  if (process.env.E2E_COMPILED === '1' && process.env.E2E_TEST_MODE === '1') {
    const { getE2EState } = await import('@/domain/e2e/state'); const state = getE2EState()
    return createAttestationRoute({ authenticate: async () => ({ user: { id: '00000000-0000-4000-8000-000000000001' } }), issue: async input => {
      const exercise = state.exercises.find(row => row.id === input.exerciseId); if (!exercise) throw new Error('EXERCISE_NOT_FOUND')
      const names = [...exercise.content.publicTests, ...exercise.content.hiddenTests].map(test => test.name)
      if (names.length !== input.tests.length || names.some((name, index) => input.tests[index]?.name !== name)) throw new Error('FULL_TEST_EVIDENCE_MISMATCH')
      const nonce = crypto.randomUUID(); state.attestationNonces.push(nonce)
      return createExecutionAttestation({ userId: input.userId, exerciseId: input.exerciseId, code: input.code, suiteVersion: 'exercise:1:full' }, { secret: 'e2e-attestation-secret-at-least-32-bytes', nonce })
    } })(request)
  }
  return createAttestationRoute({
  authenticate: async () => (await import('@/auth')).auth(),
  issue: async input => {
    const [{ db }, schema] = await Promise.all([import('@/db/client'), import('@/db/schema')])
    const [exercise] = await db.select().from(schema.exercises).where(eq(schema.exercises.id, input.exerciseId)).limit(1)
    if (!exercise) throw new Error('EXERCISE_NOT_FOUND')
    const names = [...exercise.content.publicTests, ...exercise.content.hiddenTests].map(test => test.name)
    if (names.length !== input.tests.length || names.some((name, index) => input.tests[index]?.name !== name)) throw new Error('FULL_TEST_EVIDENCE_MISMATCH')
    const suiteVersion = `exercise:${exercise.version}:full`
    const secret = process.env.EXECUTION_ATTESTATION_SECRET
    if (!secret) throw new Error('EXECUTION_ATTESTATION_SECRET_MISSING')
    const nonce = crypto.randomUUID(); const now = new Date(); const expiresAt = new Date(now.getTime() + 120_000)
    const token = await createExecutionAttestation({ userId: input.userId, exerciseId: input.exerciseId, code: input.code, suiteVersion }, { secret, nonce, now, ttlSeconds: 120 })
    await db.insert(schema.executionAttestations).values({ nonce, userId: input.userId, exerciseId: input.exerciseId, codeHash: await normalizedCodeHash(input.code), suiteVersion, expiresAt })
    return token
  },
  })(request)
}
