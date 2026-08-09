import { Worker as NodeWorker } from 'node:worker_threads'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ExerciseSchema } from '@/domain/exercises/schema'
import { normalizeJsonValue, type RunRequest, type TestCase } from '@/workers/runner.protocol'
import { runTests, setRunnerWorkerFactory, type RunnerWorker } from '@/workers/runner-client'

class ExerciseWorker implements RunnerWorker {
  private readonly worker: NodeWorker
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  constructor() {
    const workerModule = fileURLToPath(new URL('../../workers/runner.worker.ts', import.meta.url))
    this.worker = new NodeWorker(`
      const { parentPort, workerData } = require('node:worker_threads')
      globalThis.self = globalThis; globalThis.postMessage = value => parentPort.postMessage(value)
      parentPort.on('message', data => globalThis.onmessage({ data })); import(workerData.workerModule)
    `, { eval: true, execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', 'tsx'], workerData: { workerModule } })
    this.worker.on('message', data => this.onmessage?.({ data } as MessageEvent))
    this.worker.on('error', error => this.onerror?.({ message: error instanceof Error ? error.message : String(error), error } as ErrorEvent))
  }
  postMessage(message: unknown) { this.worker.postMessage(message) }
  terminate() { void this.worker.terminate() }
}

const exportName = (code: string) => code.match(/(?:function|class)\s+([\w$]+)/)?.[1]
  ?? code.match(/(?:const|let|var)\s+([\w$]+)\s*=/)?.[1] ?? ''
const runnerTests = (tests: Array<{ name: string; args: unknown[]; expected: unknown; scenario?: TestCase['scenario'] }>): TestCase[] => tests.map(test => ({
  ...test, args: test.args.map(value => normalizeJsonValue(value)), expected: normalizeJsonValue(test.expected),
}))

describe('canonical exercise behavior readiness', async () => {
  afterEach(() => setRunnerWorkerFactory())
  const files = (await readdir('exercises')).filter(file => file.endsWith('.json')).sort()
  const exercises = await Promise.all(files.map(async file => ExerciseSchema.parse(JSON.parse(await readFile(path.join('exercises', file), 'utf8')))))

  it('references every one of the 19 stable canonical exercises', () => {
    expect(exercises).toHaveLength(19)
    expect(new Set(exercises.map(item => item.id)).size).toBe(19)
  })

  it.each(exercises)('$id starter passes and a wrong implementation fails its authored contract', async exercise => {
    const tests = runnerTests(exercise.publicTests)
    const request = (code: string, suffix: string): RunRequest => ({
      requestId: `${exercise.id}-${suffix}`, code, exportName: exportName(exercise.starterCode),
      evaluationMode: exercise.evaluation?.mode, tests,
    })
    setRunnerWorkerFactory(() => new ExerciseWorker())
    const correct = await runTests(request(exercise.starterCode, 'correct'), 4_000)
    const wrongCode = exercise.evaluation?.mode === 'console-output'
      ? `console.log('definitely wrong: ${exercise.id}')`
      : `function ${exportName(exercise.starterCode)}() { return null }`
    const wrong = await runTests(request(wrongCode, 'wrong'), 4_000)
    expect(correct.tests.every(test => test.status === 'passed'), JSON.stringify(correct)).toBe(true)
    expect(wrong.tests.some(test => test.status !== 'passed'), JSON.stringify(wrong)).toBe(true)
  }, 10_000)
})
