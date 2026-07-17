import { expect, test } from '@playwright/test'

test('worker timeout recovery uses a fresh worker without freezing the page', async ({ page }) => {
  await page.goto('/tests/browser/runner.html')
  const statuses = await page.evaluate(async () => {
    const harness = (globalThis as typeof globalThis & { runnerHarness: { runTests(request: unknown, timeout: number): Promise<{ tests: Array<{ status: string }> }> } }).runnerHarness
    const timed = await harness.runTests({ requestId: 'timeout', code: 'function answer(){while(true){}}', exportName: 'answer', tests: [{ name: 'bounded', args: [], expected: 42 }] }, 100)
    const recovered = await harness.runTests({ requestId: 'recovery', code: 'function answer(){return 42}', exportName: 'answer', tests: [{ name: 'fresh worker', args: [], expected: 42 }] }, 1000)
    return [timed.tests[0].status, recovered.tests[0].status]
  })
  expect(statuses).toEqual(['timeout', 'passed'])
})
