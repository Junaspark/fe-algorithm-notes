import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'tests/e2e/**/*.spec.ts'],
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4174', headless: true },
  webServer: {
    command: './node_modules/.bin/vite --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174/tests/browser/runner.html',
    reuseExistingServer: true,
  },
})
