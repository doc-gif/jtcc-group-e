import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/jtcc-group-e/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-test-site.mjs',
    url: 'http://127.0.0.1:4173/jtcc-group-e/',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'small-mobile', use: { browserName: 'chromium', viewport: { width: 320, height: 740 } } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'landscape', use: { ...devices['iPhone 13 landscape'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
})
