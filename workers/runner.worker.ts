/// <reference lib="webworker" />

import {
  isRunRequestEnvelope,
  normalizeJsonValue,
  type JsonValue,
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
      const actual = normalizeJsonValue(await submittedFunction(...test.args), `result.${test.name}`)
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
