// Il banco dei suoni esiste solo con `astro dev`: nella build non deve esserci niente.
import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('la build non contiene il banco dei suoni', async ({ request }) => {
  const files = readdirSync('dist', { recursive: true }).map(String);
  expect(files.length).toBeGreaterThan(0);
  expect(files.filter((f) => f.includes('suoni'))).toEqual([]);
  expect((await request.get('/_suoni')).status()).toBe(404);
  expect((await request.get('/_suoni/registrazioni/crt-pal-accensione.webm')).status()).toBe(404);
});
