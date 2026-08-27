import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-app',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3001',
    channel: undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3001/login',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'development',
      JWT_SECRET_KEY: 'e2e-only-session-secret-not-for-production',
      ADMIN_JWT_SECRET: 'e2e-only-admin-secret-not-for-production',
      ADMIN_SECRET_KEY: 'e2e-only-admin-login-key',
      NEXT_PUBLIC_TESTING_OPEN_ACCESS: 'false',
      NEXT_PUBLIC_PRO_UI_ENABLED: 'false',
      REDIS_URL: '',
      DATABASE_URL: '',
    },
  },
  projects: [{ name: 'chromium-app', use: { ...devices['Desktop Chrome'] } }],
});
