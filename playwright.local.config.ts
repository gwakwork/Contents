import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests/local',
  workers: 1,
  reporter: 'list',
  use: {
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'local-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'local-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node scripts/serve-local.mjs',
    url: 'http://127.0.0.1:4174/moa-local.html',
    reuseExistingServer: false,
  },
});
