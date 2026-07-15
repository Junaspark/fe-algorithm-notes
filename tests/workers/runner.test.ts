import { Worker as NodeWorker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { runTests, setRunnerWorkerFactory, type RunnerWorker } from '@/workers/runner-client'
import type { RunRequest } from '@/workers/runner.protocol'

class WorkerHarness implements RunnerWorker {
  readonly worker: NodeWorker
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false

  constructor() {
    const workerModule = fileURLToPath(new URL('../../workers/runner.worker.ts', import.meta.url))
    this.worker = new NodeWorker(`
      const { parentPort, workerData } = require('node:worker_threads')
      globalThis.self = globalThis
      globalThis.postMessage = value => parentPort.postMessage(value)
      parentPort.on('message', data => globalThis.onmessage({ data }))
      import(workerData.workerModule)
    `, {
      eval: true,
      execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', 'tsx'],
      workerData: { workerModule },
    })
    this.worker.on('message', data => this.onmessage?.({ data } as MessageEvent))
    this.worker.on('error', (error: Error) => this.onerror?.({ message: error.message, error } as ErrorEvent))
  }

  postMessage(message: RunRequest) {
    this.worker.postMessage(message)
  }

  terminate() {
    this.terminated = true
    void this.worker.terminate()
  }
}

const request = (overrides: Partial<RunRequest> = {}): RunRequest => ({
  requestId: 'run-1',
  code: 'function add(a, b) { return a + b }',
  exportName: 'add',
  tests: [{ name: 'adds', args: [2, 3], expected: 5 }],
  ...overrides,
})

describe('browser worker runner', () => {
  afterEach(() => setRunnerWorkerFactory())

  it('runs successful code in the actual worker logic', async () => {
    const harness = new WorkerHarness()
    setRunnerWorkerFactory(() => harness)
    const result = await runTests(request(), 1_000)

    expect(result.tests).toEqual([
      expect.objectContaining({ name: 'adds', status: 'passed', actual: 5, expected: 5 }),
    ])
    expect(harness.terminated).toBe(true)
  })

  it('reports assertion mismatches', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({ tests: [{ name: 'wrong sum', args: [2, 3], expected: 6 }] }), 1_000)

    expect(result.tests[0]).toMatchObject({ name: 'wrong sum', status: 'failed', actual: 5, expected: 6 })
  })

  it.each([
    ['syntax errors', 'function add( {', 'SyntaxError'],
    ['thrown errors', 'function add() { throw new Error("boom") }', 'boom'],
    ['rejected promises', 'async function add() { throw new Error("nope") }', 'nope'],
  ])('serializes %s', async (_label, code, error) => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({ code }), 1_000)

    expect(result.tests[0]).toMatchObject({ status: 'error' })
    expect(result.tests[0].error).toContain(error)
  })

  it('hard-times out an infinite loop, terminates it, and succeeds with a fresh worker', async () => {
    const harnesses: WorkerHarness[] = []
    setRunnerWorkerFactory(() => {
      const harness = new WorkerHarness()
      harnesses.push(harness)
      return harness
    })

    const timedOut = await runTests(request({ code: 'function add() { while (true) {} }' }), 100)
    const recovered = await runTests(request({ requestId: 'run-2' }), 1_000)

    expect(timedOut.tests[0]).toMatchObject({ name: 'adds', status: 'timeout' })
    expect(recovered.tests[0].status).toBe('passed')
    expect(harnesses).toHaveLength(2)
  })

  it('bounds captured logs and blocks network and storage globals', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({
      code: `function add() {
        const blocked = [fetch, XMLHttpRequest, WebSocket, importScripts, indexedDB, localStorage]
        blocked.forEach(fn => { try { typeof fn === 'function' ? fn('https://example.com') : void fn.any } catch (error) { console.log(error.message) } })
        for (let index = 0; index < 80; index++) console.log('entry', index)
        return 5
      }`,
    }), 1_000)

    expect(result.tests[0].status).toBe('passed')
    expect(result.logs.length).toBeLessThanOrEqual(50)
    expect(result.logs.some(log => log.includes('disabled in the exercise runner'))).toBe(true)
  })
})
