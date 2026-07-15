import { readFile, readdir, mkdir, unlink, writeFile } from 'node:fs/promises'
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
    publicTests: [{
      name: item.answer ? 'matches the documented output' : 'loads the legacy implementation',
      args: [],
      expected: item.answer ?? null,
      timeoutMs: 1000,
    }],
    hiddenTests: [],
    legacy: item,
  }
})

if (migrated.length !== 19) throw new Error(`Expected 19 exercises, got ${migrated.length}`)

const destination = path.join(root, 'exercises')
await mkdir(destination, { recursive: true })
for (const file of await readdir(destination)) {
  if (file.endsWith('.json')) await unlink(path.join(destination, file))
}
await Promise.all(migrated.map((exercise) => writeFile(
  path.join(destination, `${exercise.id}.json`),
  `${JSON.stringify(exercise, null, 2)}\n`,
)))

console.log(`Migrated ${migrated.length} legacy exercises to ${destination}`)
