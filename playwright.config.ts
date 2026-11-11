import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4329' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4329',
    url: 'http://localhost:4329',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
