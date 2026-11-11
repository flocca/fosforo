import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4329' },
  webServer: {
    // Astro 7 manda `astro preview` in background quando lo lancia un agente:
    // `--ignore-lock` lo tiene in primo piano, così Playwright lo vede vivo e lo chiude alla fine.
    // Mai riusare un server già acceso: proverebbe una build vecchia.
    command: 'npm run build && npx astro preview --port 4329 --ignore-lock',
    url: 'http://localhost:4329',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
