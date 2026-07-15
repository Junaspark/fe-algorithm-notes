/// <reference lib="webworker" />

import type { RunRequest, RunResult, TestResult } from './runner.protocol'

const MAX_LOGS = 50
const disabledMessage = 'disabled in the exercise runner'

function blocked(name: string): never {
  throw new Error(`${name} is ${disabledMessage}`)
}

function BlockedConstructor(name: string) {
  return function () { blocked(name) }
}

function formatLogValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((value, index) => valuesEqual(value, expected[index]))
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const actualRecord = actual as Record<string, unknown>
    const expectedRecord = expected as Record<string, unknown>
    const actualKeys = Object.keys(actualRecord)
    const expectedKeys = Object.keys(expectedRecord)
    return actualKeys.length === expectedKeys.length
      && actualKeys.every(key => Object.hasOwn(expectedRecord, key) && valuesEqual(actualRecord[key], expectedRecord[key]))
  }
  return false
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

export async function executeRun(request: RunRequest): Promise<RunResult> {
  const startedAt = performance.now()
  const logs: string[] = []
  const capturedConsole = Object.freeze({
    log: (...values: unknown[]) => {
      if (logs.length < MAX_LOGS) logs.push(values.map(formatLogValue).join(' '))
    },
    info: (...values: unknown[]) => {
      if (logs.length < MAX_LOGS) logs.push(values.map(formatLogValue).join(' '))
    },
    warn: (...values: unknown[]) => {
      if (logs.length < MAX_LOGS) logs.push(values.map(formatLogValue).join(' '))
    },
    error: (...values: unknown[]) => {
      if (logs.length < MAX_LOGS) logs.push(values.map(formatLogValue).join(' '))
    },
  })

  let submittedFunction: (...args: unknown[]) => unknown
  try {
    const evaluate = new Function(
      'console', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'localStorage',
      `"use strict";\n${request.code}\nreturn typeof ${request.exportName} === "function" ? ${request.exportName} : undefined`,
    )
    submittedFunction = evaluate(
      capturedConsole,
      () => blocked('fetch'),
      BlockedConstructor('XMLHttpRequest'),
      BlockedConstructor('WebSocket'),
      () => blocked('importScripts'),
      new Proxy({}, { get: () => blocked('indexedDB') }),
      new Proxy({}, { get: () => blocked('localStorage') }),
    ) as (...args: unknown[]) => unknown
    if (typeof submittedFunction !== 'function') throw new Error(`Export "${request.exportName}" is not a function`)
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt)
    return {
      requestId: request.requestId,
      tests: request.tests.map(test => ({
        name: test.name, status: 'error', durationMs, error: serializeError(error), boundaryHint: test.boundaryHint,
      })),
      logs,
      durationMs,
      complexityAssessment: request.complexityAssessment,
    }
  }

  const tests: TestResult[] = []
  for (const test of request.tests) {
    const testStartedAt = performance.now()
    try {
      const actual = await submittedFunction(...test.args)
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
workerScope.onmessage = event => {
  void executeRun(event.data as RunRequest).then(result => workerScope.postMessage(result))
}
