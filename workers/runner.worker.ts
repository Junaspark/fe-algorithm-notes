/// <reference lib="webworker" />

import {
  isRunRequestEnvelope,
  normalizeJsonValue,
  type JsonValue,
  type AuthoredScenario,
  type RunRequest,
  type RunResult,
  type RunResultEnvelope,
  type TestResult,
} from './runner.protocol.ts'

const MAX_LOGS = 50
const disabledMessage = 'disabled in the exercise runner'

function blocked(name: string): never {
  throw new Error(`${name} is ${disabledMessage}`)
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function runAuthoredScenario(scenario: AuthoredScenario, implementation: (...args: unknown[]) => unknown): Promise<boolean> {
  switch (scenario) {
    case 'unique-array': return valuesEqual(normalizeJsonValue(implementation([1, 1, 2, 3, 2]) as unknown), [1, 2, 3])
    case 'deep-clone': {
      const source = { nested: { value: 1 } }
      const clone = implementation(source) as typeof source
      return clone !== source && clone.nested !== source.nested && clone.nested.value === 1
    }
    case 'curry': {
      const curried = implementation((a: number, b: number, c: number) => a + b + c) as (...args: number[]) => unknown
      const one = curried(1) as (...args: number[]) => unknown
      const oneTwo = one(2) as (...args: number[]) => unknown
      const grouped = curried(1, 2) as (...args: number[]) => unknown
      return oneTwo(3) === 6 && grouped(3) === 6 && curried(1, 2, 3) === 6
    }
    case 'debounce': {
      const calls: Array<[unknown, number]> = []
      const receiver = { value: 7, invoke: implementation(function (this: unknown, value: number) { calls.push([this, value]) }, 20) as (value: number) => void }
      receiver.invoke(1); receiver.invoke(2); await wait(35)
      return calls.length === 1 && calls[0][0] === receiver && calls[0][1] === 2
    }
    case 'throttle': {
      const calls: number[] = []; const invoke = implementation((value: number) => calls.push(value), 20) as (value: number) => void
      invoke(1); invoke(2); await wait(30); invoke(3); await wait(30)
      return valuesEqual(calls, [1, 3]) || valuesEqual(calls, [2, 3])
    }
    case 'event-emitter': {
      type Emitter = { on: (type: string, fn: (value: number) => void) => Emitter; off: (type: string, fn: (value: number) => void) => Emitter; emit: (type: string, value: number) => Emitter }
      const emitter = new (implementation as unknown as new () => Emitter)(); const calls: number[] = []
      const first = (value: number) => { calls.push(value); emitter.off('tick', first) }; const second = (value: number) => calls.push(value * 10)
      const chained = emitter.on('tick', first).on('tick', second); emitter.emit('tick', 2).emit('tick', 3)
      return chained === emitter && valuesEqual(calls, [2, 20, 30])
    }
    case 'lru-cache': {
      const Cache = implementation as unknown as new (capacity: number) => { put: (key: string, value: number) => void; get: (key: string) => number }; const cache = new Cache(2)
      cache.put('a', 1); cache.put('b', 2); if (cache.get('a') !== 1) return false; cache.put('c', 3)
      return cache.get('b') === -1 && cache.get('a') === 1 && cache.get('c') === 3
    }
    case 'my-set-interval': {
      let calls = 0; const handle = implementation(() => { calls++ }, 15) as { cancel: () => void }
      await wait(42); handle.cancel(); const atCancel = calls; await wait(30)
      return atCancel >= 2 && calls === atCancel
    }
    case 'promise-any': {
      const result = await implementation([Promise.reject('first'), Promise.resolve('winner')]); if (result !== 'winner') return false
      try { await implementation([Promise.reject('a'), Promise.reject('b')]); return false } catch (error) { return error instanceof AggregateError && valuesEqual(normalizeJsonValue(error.errors), ['a', 'b']) }
    }
    case 'promise-all': return valuesEqual(normalizeJsonValue(await implementation([Promise.resolve(1), 2])), [1, 2])
    case 'promise-race': return await implementation([Promise.resolve('first'), Promise.resolve('second')]) === 'first'
    case 'promise-all-settled': return valuesEqual(normalizeJsonValue(await implementation([Promise.resolve(1), Promise.reject('bad')])), [{ status: 'fulfilled', value: 1 }, { status: 'rejected', reason: 'bad' }])
  }
}

function blockedFunction(name: string) {
  return function () { blocked(name) }
}

function createRestrictedFacade() {
  const facade: Record<string, unknown> = {
    fetch: blockedFunction('fetch'),
    XMLHttpRequest: blockedFunction('XMLHttpRequest'),
    WebSocket: blockedFunction('WebSocket'),
    importScripts: blockedFunction('importScripts'),
    indexedDB: new Proxy({}, { get: () => blocked('indexedDB') }),
    localStorage: new Proxy({}, { get: () => blocked('localStorage') }),
    postMessage: blockedFunction('postMessage'),
    Worker: blockedFunction('Worker'),
    SharedWorker: blockedFunction('SharedWorker'),
    EventSource: blockedFunction('EventSource'),
    BroadcastChannel: blockedFunction('BroadcastChannel'),
    navigator: Object.freeze({ sendBeacon: blockedFunction('navigator.sendBeacon') }),
    Function: blockedFunction('Function'),
  }
  facade.globalThis = facade
  facade.self = facade
  return Object.freeze(facade)
}

function formatLogValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'function') return '[unsupported function]'
  if (typeof value === 'symbol') return '[unsupported symbol]'
  if (typeof value === 'undefined') return '[unsupported undefined]'
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? `[unsupported ${typeof value}]` : serialized
  } catch {
    return '[unserializable value]'
  }
}

function valuesEqual(actual: JsonValue, expected: JsonValue): boolean {
  if (Object.is(actual, expected)) return true
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((value, index) => valuesEqual(value, expected[index]))
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object'
    && !Array.isArray(actual) && !Array.isArray(expected)) {
    const actualKeys = Object.keys(actual)
    const expectedKeys = Object.keys(expected)
    return actualKeys.length === expectedKeys.length
      && actualKeys.every(key => Object.hasOwn(expected, key) && valuesEqual(actual[key], expected[key]))
  }
  return false
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

function evaluationErrorResult(request: RunRequest, startedAt: number, logs: string[], error: unknown): RunResult {
  const durationMs = Math.round(performance.now() - startedAt)
  return {
    requestId: request.requestId,
    tests: request.tests.map(test => ({
      name: test.name, status: 'error', durationMs, error: serializeError(error), boundaryHint: test.boundaryHint,
    })),
    logs, durationMs, complexityAssessment: request.complexityAssessment,
  }
}

export async function executeRun(request: RunRequest): Promise<RunResult> {
  const startedAt = performance.now()
  const logs: string[] = []
  const capture = (...values: unknown[]) => {
    if (logs.length < MAX_LOGS) logs.push(values.map(formatLogValue).join(' '))
  }
  const capturedConsole = Object.freeze({ log: capture, info: capture, warn: capture, error: capture })
  const facade = createRestrictedFacade()

  if (request.evaluationMode === 'console-output') {
    try {
      const evaluate = new Function(
        'console', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'localStorage',
        'globalThis', 'self', 'postMessage', 'Worker', 'SharedWorker', 'EventSource', 'BroadcastChannel', 'navigator', 'Function',
        `"use strict"; return (async () => { ${request.code}\nawait Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 10)); })()`,
      )
      await evaluate(capturedConsole, facade.fetch, facade.XMLHttpRequest, facade.WebSocket, facade.importScripts, facade.indexedDB, facade.localStorage, facade, facade, facade.postMessage, facade.Worker, facade.SharedWorker, facade.EventSource, facade.BroadcastChannel, facade.navigator, facade.Function)
      const actual = logs.join(' → ')
      return { requestId: request.requestId, logs, durationMs: Math.round(performance.now() - startedAt), tests: request.tests.map(test => ({ name: test.name, status: valuesEqual(actual, test.expected) ? 'passed' : 'failed', durationMs: Math.round(performance.now() - startedAt), expected: test.expected, actual })) }
    } catch (error) {
      return evaluationErrorResult(request, startedAt, logs, error)
    }
  }

  let submittedFunction: (...args: JsonValue[]) => unknown
  try {
    if (!/^[A-Za-z_$][\w$]*$/.test(request.exportName)) throw new Error('Export name must be a JavaScript identifier')
    const evaluate = new Function(
      'console', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'localStorage',
      'globalThis', 'self', 'postMessage', 'Worker', 'SharedWorker', 'EventSource', 'BroadcastChannel', 'navigator', 'Function',
      `"use strict";\n${request.code}\nreturn typeof ${request.exportName} === "function" ? ${request.exportName} : undefined`,
    )
    submittedFunction = evaluate(
      capturedConsole,
      facade.fetch, facade.XMLHttpRequest, facade.WebSocket, facade.importScripts, facade.indexedDB, facade.localStorage,
      facade, facade, facade.postMessage, facade.Worker, facade.SharedWorker, facade.EventSource, facade.BroadcastChannel,
      facade.navigator, facade.Function,
    ) as (...args: JsonValue[]) => unknown
    if (typeof submittedFunction !== 'function') throw new Error(`Export "${request.exportName}" is not a function`)
  } catch (error) {
    return evaluationErrorResult(request, startedAt, logs, error)
  }

  const tests: TestResult[] = []
  for (const test of request.tests) {
    const testStartedAt = performance.now()
    try {
      const actual = test.scenario
        ? await runAuthoredScenario(test.scenario, submittedFunction as (...args: unknown[]) => unknown)
        : normalizeJsonValue(await submittedFunction(...test.args), `result.${test.name}`)
      tests.push({
        name: test.name,
        status: valuesEqual(actual, test.expected) ? 'passed' : 'failed',
        durationMs: Math.round(performance.now() - testStartedAt),
        expected: test.expected,
        actual,
        boundaryHint: test.boundaryHint,
      })
    } catch (error) {
      tests.push({
        name: test.name,
        status: 'error',
        durationMs: Math.round(performance.now() - testStartedAt),
        error: serializeError(error),
        boundaryHint: test.boundaryHint,
      })
    }
  }

  return {
    requestId: request.requestId,
    tests,
    logs,
    durationMs: Math.round(performance.now() - startedAt),
    complexityAssessment: request.complexityAssessment,
  }
}

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope
const sendMessage = workerScope.postMessage.bind(workerScope)

function sendResult(requestId: string, result: RunResult) {
  const envelope: RunResultEnvelope = { kind: 'runner:result', requestId, result }
  try {
    sendMessage(envelope)
  } catch (error) {
    const message = `DataCloneError: ${error instanceof Error ? error.message : String(error)}`
    const fallback: RunResult = {
      ...result,
      tests: result.tests.map(test => ({
        name: test.name, status: 'error', durationMs: test.durationMs, error: message, boundaryHint: test.boundaryHint,
      })),
      logs: [],
    }
    sendMessage({ kind: 'runner:result', requestId, result: fallback } satisfies RunResultEnvelope)
  }
}

workerScope.onmessage = event => {
  if (!isRunRequestEnvelope(event.data)) return
  const { request } = event.data
  try {
    for (const [index, test] of request.tests.entries()) {
      normalizeJsonValue(test.args, `tests[${index}].args`)
      normalizeJsonValue(test.expected, `tests[${index}].expected`)
    }
  } catch (error) {
    sendResult(request.requestId, evaluationErrorResult(request, performance.now(), [], error))
    return
  }
  void executeRun(request).then(result => sendResult(request.requestId, result))
}

/**
 * UX isolation only: shadowing blocks ordinary ambient access, including globalThis/self.
 * JavaScript can still recover the intrinsic Function constructor through constructor chains;
 * therefore this Worker must never be treated as a security or server trust boundary.
 */
