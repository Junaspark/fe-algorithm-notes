import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { ExerciseSchema, type Exercise } from '../domain/exercises/schema'

export const STABLE_SLUGS = new Map([
  [1, 'unique-array'], [2, 'throttle'], [3, 'debounce'], [4, 'curry'], [5, 'deep-clone'],
  [6, 'event-emitter'], [7, 'promise-all'], [8, 'promise-race'], [9, 'promise-all-settled'],
  [10, 'promise-any'], [11, 'my-set-interval'], [12, 'lru-cache'], [13, 'event-loop-01'],
  [14, 'event-loop-02'], [15, 'event-loop-03'], [16, 'event-loop-04'], [17, 'event-loop-05'],
  [18, 'event-loop-06'], [19, 'event-loop-07'],
])

type LegacyItem = Record<string, unknown> & { id: number; title: string; category: string; difficulty: string; summary: string; code: string; answer?: string }
type MigrationOptions = { source: string; destination: string; failAt?: 'beforeSwap' | 'afterSwap' }
const difficulty = { '简单': 'easy', '中等': 'medium', '困难': 'hard' } as const
const algorithms = new Set(['数组', '对象', '数据结构'])
const exists = async (file: string) => access(file).then(() => true, () => false)
const normalizeLines = (value: unknown): unknown => typeof value === 'string' ? value.replaceAll('\r\n', '\n')
  : Array.isArray(value) ? value.map(normalizeLines)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeLines(item)])) : value

export async function readLegacy(source: string): Promise<LegacyItem[]> {
  const context = { window: {} as { HANDBOOK_DATA?: LegacyItem[] } }
  vm.createContext(context); vm.runInContext(await readFile(source, 'utf8'), context, { filename: source })
  return JSON.parse(JSON.stringify(context.window.HANDBOOK_DATA)) as LegacyItem[]
}

export function buildExercises(items: LegacyItem[]): Exercise[] {
  if (items.length !== STABLE_SLUGS.size) throw new Error(`Expected exactly 19 legacy records, got ${items.length}`)
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Legacy IDs must be unique')
  return items.map(item => {
    const id = STABLE_SLUGS.get(item.id); if (!id) throw new Error(`Missing stable slug for legacy ${item.id}`)
    const eventLoop = typeof item.answer === 'string'
    return ExerciseSchema.parse({
      id, title: item.title, kind: algorithms.has(item.category) ? 'algorithm' : 'frontend',
      difficulty: difficulty[item.difficulty as keyof typeof difficulty], language: 'javascript', topics: [item.category],
      prompt: item.summary, starterCode: item.code, evaluation: { mode: eventLoop ? 'console-output' : 'function' },
      publicTests: [{
        name: eventLoop ? '匹配文档化完整输出顺序' : '通过规范行为场景', args: [],
        expected: eventLoop ? item.answer : true, ...(eventLoop ? {} : { scenario: id }), timeoutMs: eventLoop ? 1000 : 3000,
      }], hiddenTests: [], legacy: item,
    })
  })
}

export async function validateCanonicalDirectory({ source, destination }: Pick<MigrationOptions, 'source' | 'destination'>): Promise<Exercise[]> {
  const legacy = await readLegacy(source)
  const files = (await readdir(destination)).filter(file => file.endsWith('.json')).sort()
  if (files.length !== STABLE_SLUGS.size) throw new Error(`Expected exactly 19 canonical files, got ${files.length}`)
  const canonical = await Promise.all(files.map(async file => ExerciseSchema.parse(JSON.parse(await readFile(path.join(destination, file), 'utf8')))))
  if (new Set(canonical.map(item => item.id)).size !== canonical.length) throw new Error('Canonical IDs must be unique')
  const byLegacyId = new Map(canonical.map(item => [item.legacy?.id, item]))
  for (const item of legacy) {
    const migrated = byLegacyId.get(item.id); const expectedSlug = STABLE_SLUGS.get(item.id)
    if (!migrated || migrated.id !== expectedSlug || files.includes(`${migrated.id}.json`) === false) throw new Error(`Stable slug mismatch for legacy ${item.id}`)
    for (const field of ['code', 'status', 'complexity', 'mistakes', 'questions'] as const) {
      if (JSON.stringify(normalizeLines(migrated.legacy?.[field])) !== JSON.stringify(normalizeLines(item[field]))) throw new Error(`Legacy ${item.id} ${field} differs`)
    }
    if (normalizeLines(migrated.starterCode) !== normalizeLines(item.code)) throw new Error(`Legacy ${item.id} starter code differs`)
    const test = migrated.publicTests[0]
    if (item.answer) {
      if (migrated.evaluation?.mode !== 'console-output' || test.expected !== item.answer) throw new Error(`Event Loop ${item.id} lacks exact output contract`)
    } else if (migrated.evaluation?.mode !== 'function' || test.scenario !== migrated.id || test.expected !== true) {
      throw new Error(`Exercise ${item.id} lacks canonical behavior readiness`)
    }
  }
  return canonical
}

export async function migrateLegacyData({ source, destination, failAt }: MigrationOptions): Promise<void> {
  const staging = `${destination}.staging-${process.pid}-${Date.now()}`; const backup = `${destination}.backup`
  if (!(await exists(destination)) && await exists(backup)) await rename(backup, destination)
  else if (await exists(backup)) await rm(backup, { recursive: true, force: true })
  const hadDestination = await exists(destination)
  try {
    await mkdir(staging, { recursive: true })
    const exercises = buildExercises(await readLegacy(source))
    await Promise.all(exercises.map(item => writeFile(path.join(staging, `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`)))
    await validateCanonicalDirectory({ source, destination: staging })
    if (failAt === 'beforeSwap') throw new Error('Injected beforeSwap')
    if (hadDestination) await rename(destination, backup)
    await rename(staging, destination)
    if (failAt === 'afterSwap') throw new Error('Injected afterSwap')
    await rm(backup, { recursive: true, force: true })
  } catch (error) {
    if (await exists(backup)) {
      await rm(destination, { recursive: true, force: true }); await rename(backup, destination)
    } else if (!hadDestination) await rm(destination, { recursive: true, force: true })
    throw error
  } finally {
    await rm(staging, { recursive: true, force: true })
    if (await exists(destination)) await rm(backup, { recursive: true, force: true })
  }
}
