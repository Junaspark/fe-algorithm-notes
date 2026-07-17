import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4174', headless: true },
  webServer: {
    command: 'E2E_TEST_MODE=1 AUTH_SECRET=e2e AUTH_GITHUB_ID=e2e AUTH_GITHUB_SECRET=e2e DATABASE_URL=http://unused.invalid CRON_SECRET=e2e-cron OWNER_USER_ID=00000000-0000-4000-8000-000000000001 ./node_modules/.bin/next start --hostname 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174/login',
    reuseExistingServer: false,
  },
})
