import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  testDir: './tests/ai-browser',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3102' },
  webServer: {
    command: 'node tests/fixtures/ai-browser-server.mjs',
    url: 'http://127.0.0.1:3102/api/health',
    reuseExistingServer: false,
  },
});
