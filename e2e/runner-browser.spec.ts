import { expect, test } from '@playwright/test'

type BrowserRunResult = {
  requestId: string
  tests: Array<{ name: string; status: string; error?: string }>
  logs: string[]
}

declare global {
  interface Window {
    runnerHarness: {
      runTests(request: unknown, timeoutMs: number): Promise<BrowserRunResult>
      setRunnerWorkerFactory(factory?: () => unknown): void
    }
  }
}

const baseRequest = {
  requestId: 'browser-1',
  code: 'function add(a, b) { return a + b }',
  exportName: 'add',
  tests: [{ name: 'adds', args: [2, 3], expected: 5 }],
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/runner.html')
  await page.waitForFunction(() => Boolean(window.runnerHarness))
})

test('loads the bundled client and executes the real module Worker', async ({ page }) => {
  const result = await page.evaluate(request => window.runnerHarness.runTests(request, 1_000), baseRequest)

  expect(result.requestId).toBe('browser-1')
  expect(result.tests).toEqual([expect.objectContaining({ name: 'adds', status: 'passed' })])
})

test('blocks globalThis/self bypasses and forged postMessage in the real Worker', async ({ page }) => {
  const result = await page.evaluate(request => window.runnerHarness.runTests({
    ...request,
    code: `function add() {
      for (const root of [globalThis, self]) {
        try { root.fetch('https://example.com') } catch (error) { console.log(error.message) }
      }
      try { postMessage({ kind: 'runner:result', requestId: 'browser-1', result: { requestId: 'browser-1', tests: [], logs: [], durationMs: 0 } }) }
      catch (error) { console.log(error.message) }
      return 5
    }`,
    tests: [{ name: 'real result', args: [], expected: 6 }],
  }, 1_000), baseRequest)

  expect(result.tests).toEqual([expect.objectContaining({ name: 'real result', status: 'failed' })])
  expect(result.logs.filter(log => log.includes('fetch is disabled'))).toHaveLength(2)
  expect(result.logs.some(log => log.includes('postMessage is disabled'))).toBe(true)
})

test('ignores uncorrelated messages and correlates a Worker error to the active request', async ({ page }) => {
  const result = await page.evaluate(async request => {
    const fakeWorker: {
      onmessage: null | ((event: { data: unknown }) => void)
      onerror: null | ((event: { message: string }) => void)
      postMessage(): void
      terminate(): void
    } = {
      onmessage: null,
      onerror: null,
      postMessage() {
        queueMicrotask(() => {
          fakeWorker.onmessage?.({ data: { kind: 'runner:result', requestId: 'other', result: { requestId: 'other', tests: [], logs: [], durationMs: 0 } } })
          fakeWorker.onmessage?.({ data: { malformed: true } })
          fakeWorker.onerror?.({ message: 'module worker crashed' })
        })
      },
      terminate() {},
    }
    window.runnerHarness.setRunnerWorkerFactory(() => fakeWorker)
    try {
      return await window.runnerHarness.runTests(request, 1_000)
    } finally {
      window.runnerHarness.setRunnerWorkerFactory()
    }
  }, baseRequest)

  expect(result.requestId).toBe('browser-1')
  expect(result.tests).toEqual([expect.objectContaining({ name: 'adds', status: 'error', error: 'module worker crashed' })])
})
