import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  testDir: './tests/planning-browser',
  outputDir: './test-results-planning',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3103' },
  webServer: {
    command: 'node tests/fixtures/ai-browser-server.mjs',
    url: 'http://127.0.0.1:3103/api/health',
    reuseExistingServer: false,
    env: { PORT: '3103' },
  },
});
