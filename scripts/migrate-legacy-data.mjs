import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(path.join(root, 'data.js'), 'utf8')
const context = { window: {} }
vm.createContext(context)
vm.runInContext(source, context, { filename: 'data.js' })

const legacyItems = JSON.parse(JSON.stringify(context.window.HANDBOOK_DATA))

const slugs = new Map([
  [1, 'unique-array'], [2, 'throttle'], [3, 'debounce'], [4, 'curry'],
  [5, 'deep-clone'], [6, 'event-emitter'], [7, 'promise-all'],
  [8, 'promise-race'], [9, 'promise-all-settled'], [10, 'promise-any'],
  [11, 'my-set-interval'], [12, 'lru-cache'], [13, 'event-loop-01'],
  [14, 'event-loop-02'], [15, 'event-loop-03'], [16, 'event-loop-04'],
  [17, 'event-loop-05'], [18, 'event-loop-06'], [19, 'event-loop-07'],
])

const difficulty = { '简单': 'easy', '中等': 'medium', '困难': 'hard' }
const algorithmCategories = new Set(['数组', '对象', '数据结构'])
const executableCases = new Map([
  [1, [{ name: '去重并保留首次顺序', args: [[1, 1, 2, 3, 2]], expected: [1, 2, 3] }, { name: '空数组', args: [[]], expected: [] }]],
  [5, [{ name: '深拷贝嵌套数组与对象', args: [{ a: [1, { b: 2 }] }], expected: { a: [1, { b: 2 }] } }]],
  [7, [{ name: '保持输入顺序', args: [[1, 2, 3]], expected: [1, 2, 3] }, { name: '空可迭代对象', args: [[]], expected: [] }]],
  [8, [{ name: '第一个已兑现值', args: [[1, 2]], expected: 1 }]],
  [9, [{ name: '记录每个结果', args: [[1, 2]], expected: [{ status: 'fulfilled', value: 1 }, { status: 'fulfilled', value: 2 }] }]],
])

const migrated = legacyItems.map((item) => {
  const id = slugs.get(item.id)
  if (!id) throw new Error(`Missing stable slug for legacy exercise ${item.id}`)

  return {
    id,
    title: item.title,
    kind: algorithmCategories.has(item.category) ? 'algorithm' : 'frontend',
    difficulty: difficulty[item.difficulty],
    language: 'javascript',
    topics: [item.category],
    prompt: item.summary,
    starterCode: item.code,
    evaluation: item.answer ? { mode: 'console-output' } : executableCases.has(item.id) ? { mode: 'function' } : { mode: 'function-presence' },
    publicTests: (executableCases.get(item.id) ?? [{
      name: item.answer ? '匹配文档化输出' : '导出可调用实现', args: [], expected: item.answer ?? true,
    }]).map(test => ({ ...test, timeoutMs: 1000 })),
    hiddenTests: [],
    legacy: item,
  }
})

if (migrated.length !== 19) throw new Error(`Expected 19 exercises, got ${migrated.length}`)

const destination = path.join(root, 'exercises')
const staging = path.join(root, `.exercises-migration-${process.pid}`)
const backup = path.join(root, `.exercises-backup-${process.pid}`)
await rm(staging, { recursive: true, force: true })
await mkdir(staging, { recursive: true })
await Promise.all(migrated.map((exercise) => writeFile(
  path.join(staging, `${exercise.id}.json`),
  `${JSON.stringify(exercise, null, 2)}\n`,
)))
await rename(destination, backup)
try {
  await rename(staging, destination)
  await rm(backup, { recursive: true, force: true })
} catch (error) {
  await rename(backup, destination).catch(() => undefined)
  throw error
}

console.log(`Migrated ${migrated.length} legacy exercises to ${destination}`)
