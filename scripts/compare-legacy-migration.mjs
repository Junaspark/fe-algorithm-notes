import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

const source = await readFile('data.js', 'utf8')
const context = { window: {} }; vm.createContext(context); vm.runInContext(source, context, { filename: 'data.js' })
const legacy = JSON.parse(JSON.stringify(context.window.HANDBOOK_DATA))
const files = (await readdir('exercises')).filter(file => file.endsWith('.json')).sort()
if (legacy.length !== 19 || files.length !== 19) throw new Error(`Expected exactly 19 records, got legacy=${legacy.length} canonical=${files.length}`)
const canonical = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join('exercises', file), 'utf8'))))
const byLegacyId = new Map(canonical.map(item => [item.legacy?.id, item]))
for (const item of legacy) {
  const migrated = byLegacyId.get(item.id)
  if (!migrated) throw new Error(`Missing exact legacy id ${item.id}`)
  for (const field of ['code', 'status', 'complexity', 'mistakes', 'questions']) {
    if (JSON.stringify(migrated.legacy[field]) !== JSON.stringify(item[field])) throw new Error(`Legacy ${item.id} ${field} differs`)
  }
  if (migrated.starterCode !== item.code) throw new Error(`Legacy ${item.id} normalized code differs`)
  if (!Array.isArray(migrated.publicTests) || migrated.publicTests.length === 0) throw new Error(`Legacy ${item.id} has no executable cases`)
  if (item.answer && migrated.evaluation?.mode !== 'console-output') throw new Error(`Legacy ${item.id} output question lacks console-output contract`)
  if (!item.answer && migrated.publicTests.some(test => test.expected === null)) throw new Error(`Legacy ${item.id} still has a placeholder null assertion`)
}
console.log('Migration comparison passed: 19 exact IDs, preserved fields, and executable contracts')
