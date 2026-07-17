import { z } from 'zod'


const Input = z.object({
  exerciseId: z.string().regex(/^[a-z0-9-]+$/),
  code: z.string().max(100_000),
  expectedVersion: z.number().int().min(0),
})

type Session = { user?: { id?: string } } | null
type Dependencies = {
  authenticate(): Promise<Session>
  save(input: { userId: string; exerciseId: string; code: string; expectedVersion: number }): Promise<{ version: number; updatedAt: Date }>
  find?(userId: string, exerciseId: string): Promise<{ version: number } | null>
}

export function createDraftRoute(deps: Dependencies) {
  return async function PUT(request: Request) {
    const session = await deps.authenticate()
    const userId = session?.user?.id
    if (!userId) return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })
    const parsed = Input.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ code: 'INVALID_DRAFT', issues: parsed.error.issues }, { status: 400 })
    try {
      const draft = await deps.save({ userId, ...parsed.data })
      return Response.json({ version: draft.version, savedAt: draft.updatedAt.toISOString() })
    } catch (error) {
      if (error instanceof Error && error.message === 'DRAFT_CONFLICT') {
        const server = await deps.find?.(userId, parsed.data.exerciseId)
        return Response.json({ code: 'DRAFT_CONFLICT', serverVersion: server?.version ?? 0, localVersion: parsed.data.expectedVersion }, { status: 409 })
      }
      throw error
    }
  }
}

export const PUT = async (request: Request) => {
  if (process.env.E2E_COMPILED === '1' && process.env.E2E_TEST_MODE === '1') {
    const { getE2EState } = await import('@/domain/e2e/state'); const state = getE2EState()
    return createDraftRoute({ authenticate: async () => ({ user: { id: '00000000-0000-4000-8000-000000000001' } }), find: async (_u, id) => state.drafts[id] ? { ...state.drafts[id] } : null, save: async input => { const current = state.drafts[input.exerciseId]; if ((current?.version ?? 0) !== input.expectedVersion) throw new Error('DRAFT_CONFLICT'); const saved = { code: input.code, version: input.expectedVersion + 1 }; state.drafts[input.exerciseId] = saved; return { ...saved, updatedAt: new Date() } } })(request)
  }
  const [{ auth }, { db }, { createDraftRepository }] = await Promise.all([import('@/auth'), import('@/db/client'), import('@/domain/plans/repository')])
  const repository = createDraftRepository(db)
  return createDraftRoute({ authenticate: auth, save: repository.save, find: repository.find })(request)
}
