import { Worker as NodeWorker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { runTests, setRunnerWorkerFactory, type RunnerWorker } from '@/workers/runner-client'
import type { JsonValue, RunRequest } from '@/workers/runner.protocol'

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

  postMessage(message: unknown) {
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

  it('supports a bounded console-output contract for Event Loop questions', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({
      evaluationMode: 'console-output', exportName: '',
      code: `console.log(1); Promise.resolve().then(() => console.log(3)); console.log(2)`,
      tests: [{ name: 'event order', args: [], expected: '1 → 2 → 3' }],
    }), 1_000)
    expect(result.tests[0]).toMatchObject({ status: 'passed', actual: '1 → 2 → 3' })
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

  it('shadows globalThis, self, and postMessage with the restricted facade', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({
      code: `function add() {
        return [globalThis.fetch === fetch, self.fetch === fetch, globalThis.postMessage === postMessage]
      }`,
      tests: [{ name: 'restricted roots', args: [], expected: [true, true, true] }],
    }), 1_000)

    expect(result.tests[0].status).toBe('passed')
  })

  it('prevents learner code from forging a correlated worker result', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({
      code: `function add() {
        try { postMessage({ kind: 'runner:result', requestId: 'run-1', result: { requestId: 'run-1', tests: [], logs: [], durationMs: 0 } }) }
        catch (error) { console.log(error.message) }
        return 5
      }`,
      tests: [{ name: 'real assertion wins', args: [], expected: 6 }],
    }), 1_000)

    expect(result.tests).toEqual([expect.objectContaining({ name: 'real assertion wins', status: 'failed' })])
    expect(result.logs.some(log => log.includes('postMessage is disabled'))).toBe(true)
  })

  it('ignores malformed and uncorrelated worker messages', async () => {
    class CorrelationHarness implements RunnerWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage() {
        queueMicrotask(() => {
          this.onmessage?.({ data: { requestId: 'run-1', tests: [], logs: [], durationMs: 0 } } as MessageEvent)
          this.onmessage?.({ data: { kind: 'runner:result', requestId: 'other', result: { requestId: 'other', tests: [], logs: [], durationMs: 0 } } } as MessageEvent)
          this.onmessage?.({ data: {
            kind: 'runner:result', requestId: 'run-1',
            result: { requestId: 'run-1', tests: [{ name: 'forged', status: 'passed', durationMs: 0, actual: () => 5 }], logs: [], durationMs: 0 },
          } } as MessageEvent)
          this.onmessage?.({ data: {
            kind: 'runner:result', requestId: 'run-1',
            result: { requestId: 'run-1', tests: [{ name: 'adds', status: 'passed', durationMs: 1, expected: 5, actual: 5 }], logs: [], durationMs: 1 },
          } } as MessageEvent)
        })
      }
      terminate() {}
    }
    setRunnerWorkerFactory(() => new CorrelationHarness())

    const result = await runTests(request(), 1_000)

    expect(result.tests).toEqual([expect.objectContaining({ name: 'adds', status: 'passed' })])
  })

  it.each([
    ['function', 'function add() { return function nope() {} }'],
    ['symbol', 'function add() { return Symbol("nope") }'],
    ['proxy', 'function add() { return new Proxy({}, { ownKeys() { throw new Error("proxy trap") } }) }'],
  ])('reports a clone-safe serialization error for a %s result', async (_label, code) => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({ code }), 1_000)

    expect(result.tests[0]).toMatchObject({ status: 'error' })
    expect(result.tests[0].error).toContain('Unsupported JSON value')
  })

  it('captures non-cloneable log values without breaking worker delivery', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const result = await runTests(request({
      code: `function add() {
        console.log(function logged() {}, Symbol('logged'), new Proxy({}, { ownKeys() { throw new Error('log proxy') } }))
        return 5
      }`,
    }), 1_000)

    expect(result.tests[0].status).toBe('passed')
    expect(result.logs[0]).toContain('[unsupported function]')
    expect(result.logs[0]).toContain('[unsupported symbol]')
    expect(result.logs[0]).toContain('[unserializable value]')
  })

  it('rejects request values outside the JSON-like protocol', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const invalid = request({ tests: [{ name: 'invalid expected', args: [], expected: (() => 5) as unknown as JsonValue }] })
    const result = await runTests(invalid, 1_000)

    expect(result.tests[0]).toMatchObject({ name: 'invalid expected', status: 'error' })
    expect(result.tests[0].error).toContain('Unsupported JSON value')
  })

  it('turns a transport DataCloneError into a correlated runtime result', async () => {
    class CloneFailureHarness implements RunnerWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(): void { throw new DOMException('payload could not be cloned', 'DataCloneError') }
      terminate() {}
    }
    setRunnerWorkerFactory(() => new CloneFailureHarness())

    const result = await runTests(request(), 1_000)

    expect(result.tests[0]).toMatchObject({ name: 'adds', status: 'error' })
    expect(result.tests[0].error).toContain('could not be cloned')
  })

  it('compares and delivers objects with prototype-sensitive JSON keys', async () => {
    setRunnerWorkerFactory(() => new WorkerHarness())
    const special = JSON.parse('{"__proto__":{"polluted":true},"constructor":"ctor","prototype":"proto"}')
    const result = await runTests(request({
      code: `function add() { return JSON.parse('{"__proto__":{"polluted":true},"constructor":"ctor","prototype":"proto"}') }`,
      tests: [{ name: 'special keys', args: [], expected: special }],
    }), 1_000)

    expect(result.tests[0]).toMatchObject({ status: 'passed', expected: special, actual: special })
    expect(Object.keys(result.tests[0].actual as object)).toEqual(['__proto__', 'constructor', 'prototype'])
  })

  it('returns a correlated clone-safe error when Worker construction throws', async () => {
    setRunnerWorkerFactory(() => { throw new DOMException('Worker construction blocked', 'SecurityError') })

    const result = await runTests(request(), 1_000)

    expect(result).toMatchObject({
      requestId: 'run-1',
      tests: [{ name: 'adds', status: 'error', error: 'Worker construction blocked' }],
      logs: [],
    })
  })
})
