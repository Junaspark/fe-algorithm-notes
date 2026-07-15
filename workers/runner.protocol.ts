export type TestCase = {
  name: string
  args: unknown[]
  expected: unknown
  /** Exercise-authored guidance. The runner never invents boundary advice. */
  boundaryHint?: string
}

export type RunRequest = {
  requestId: string
  code: string
  exportName: string
  tests: TestCase[]
  complexityAssessment?: string
}

export type TestResult = {
  name: string
  status: 'passed' | 'failed' | 'error' | 'timeout'
  durationMs: number
  expected?: unknown
  actual?: unknown
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
