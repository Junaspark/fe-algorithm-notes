export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type TestCase = {
  name: string
  args: JsonValue[]
  expected: JsonValue
  scenario?: AuthoredScenario
  /** Exercise-authored guidance. The runner never invents boundary advice. */
  boundaryHint?: string
}

export const AUTHORED_SCENARIOS = [
  'unique-array', 'throttle', 'debounce', 'curry', 'deep-clone', 'event-emitter',
  'promise-all', 'promise-race', 'promise-all-settled', 'promise-any', 'my-set-interval', 'lru-cache',
] as const
export type AuthoredScenario = typeof AUTHORED_SCENARIOS[number]

export type RunRequest = {
  requestId: string
  code: string
  exportName: string
  evaluationMode?: 'function' | 'console-output'
  tests: TestCase[]
  complexityAssessment?: string
}

export type TestResult = {
  name: string
  status: 'passed' | 'failed' | 'error' | 'timeout'
  durationMs: number
  expected?: JsonValue
  actual?: JsonValue
  error?: string
  boundaryHint?: string
}

export type RunResult = {
  requestId: string
  tests: TestResult[]
  logs: string[]
  durationMs: number
  complexityAssessment?: string
}

export type RunRequestEnvelope = { kind: 'runner:execute'; request: RunRequest }
export type RunResultEnvelope = { kind: 'runner:result'; requestId: string; result: RunResult }

export function normalizeJsonValue(value: unknown, path = '$', ancestors = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    throw new Error(`Unsupported JSON value at ${path}: number must be finite`)
  }
  if (typeof value !== 'object') throw new Error(`Unsupported JSON value at ${path}: ${typeof value}`)

  try {
    if (ancestors.has(value)) throw new Error(`Unsupported JSON value at ${path}: cyclic reference`)
    ancestors.add(value)
    if (Array.isArray(value)) {
      const normalized = value.map((item, index) => normalizeJsonValue(item, `${path}[${index}]`, ancestors))
      ancestors.delete(value)
      return normalized
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`Unsupported JSON value at ${path}: non-plain object`)
    }
    const normalized = Object.create(null) as { [key: string]: JsonValue }
    for (const key of Object.keys(value)) {
      normalized[key] = normalizeJsonValue((value as Record<string, unknown>)[key], `${path}.${key}`, ancestors)
    }
    ancestors.delete(value)
    return normalized
  } catch (error) {
    ancestors.delete(value)
    if (error instanceof Error && error.message.startsWith('Unsupported JSON value')) throw error
    throw new Error(`Unsupported JSON value at ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isRunRequestEnvelope(value: unknown): value is RunRequestEnvelope {
  if (!isRecord(value) || value.kind !== 'runner:execute' || !isRecord(value.request)) return false
  const request = value.request
  return typeof request.requestId === 'string'
    && typeof request.code === 'string'
    && typeof request.exportName === 'string'
    && (request.evaluationMode === undefined || request.evaluationMode === 'function' || request.evaluationMode === 'console-output')
    && Array.isArray(request.tests)
    && request.tests.every(test => isRecord(test)
      && typeof test.name === 'string'
      && Array.isArray(test.args)
      && 'expected' in test
      && (test.scenario === undefined || AUTHORED_SCENARIOS.includes(test.scenario as AuthoredScenario))
      && (test.boundaryHint === undefined || typeof test.boundaryHint === 'string'))
    && (request.complexityAssessment === undefined || typeof request.complexityAssessment === 'string')
}

export function isRunResultEnvelope(value: unknown, requestId: string): value is RunResultEnvelope {
  if (!isRecord(value) || value.kind !== 'runner:result' || value.requestId !== requestId || !isRecord(value.result)) return false
  const result = value.result
  if (result.requestId !== requestId || !Array.isArray(result.tests) || !Array.isArray(result.logs)) return false
  if (typeof result.durationMs !== 'number' || !Number.isFinite(result.durationMs) || !result.logs.every(log => typeof log === 'string')) return false
  if (result.complexityAssessment !== undefined && typeof result.complexityAssessment !== 'string') return false
  return result.tests.every(test => {
    if (!isRecord(test)
      || typeof test.name !== 'string'
      || !['passed', 'failed', 'error', 'timeout'].includes(String(test.status))
      || typeof test.durationMs !== 'number'
      || !Number.isFinite(test.durationMs)
      || (test.error !== undefined && typeof test.error !== 'string')
      || (test.boundaryHint !== undefined && typeof test.boundaryHint !== 'string')) return false
    try {
      if ('expected' in test) normalizeJsonValue(test.expected, 'result.expected')
      if ('actual' in test) normalizeJsonValue(test.actual, 'result.actual')
      return true
    } catch {
      return false
    }
  })
}
