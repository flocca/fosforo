// Livello 0: HTML statico senza JavaScript, come lo vedono crawler e visitatori senza JS.
import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('la pagina di una canzone ha artista e link ad Apple Music', async ({ page }) => {
  await page.goto('/canzoni/2026-11-10');
  await expect(page.locator('#screen')).toContainText('Drew');
  const href = await page.locator('#screen a[href^="https://music.apple.com/"]').first().getAttribute('href');
  expect(href).toMatch(/^https:\/\/music\.apple\.com\//);
  await expect(page.locator('body')).toHaveAttribute('data-page', 'item');
});

test('la home linka le sezioni', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-page', 'home');
  for (const href of ['/canzoni', '/lettura', '/chi-sono']) {
    await expect(page.locator(`#screen a[href="${href}"]`)).toHaveCount(1);
  }
});

test('canzone-del-giorno ha il canonical sulla canzone più recente', async ({ page }) => {
  await page.goto('/canzone-del-giorno');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', '/canzoni/2026-11-10');
  await expect(page.locator('body')).toHaveAttribute('data-alias-target', 'canzoni/2026-11-10');
});

test('il gemello JSON della radice', async ({ request }) => {
  const res = await request.get('/_fs/index.json');
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.root.children[0].name).toBe('canzone-del-giorno');
  expect(json.site.host).toBe('example.com');
  expect(json.latestSong.path).toBe('canzoni/2026-11-10');
  const item = await (await request.get('/_fs/canzoni/2026-11-10.json')).json();
  expect(item.path).toBe('canzoni/2026-11-10');
  expect(Array.isArray(item.blocks)).toBe(true);
  expect((await request.get('/_fs/root.json')).status()).toBe(200);
});

test('la pagina 404 spiega che il percorso non esiste', async ({ page }) => {
  await page.goto('/404');
  await expect(page.locator('body')).toHaveAttribute('data-page', '404');
  await expect(page.locator('#screen')).toContainText('file o cartella inesistente');
  await expect(page.locator('#screen a[href="/"]')).toHaveCount(1);
});

test('percorso inesistente risponde 404 con il contenuto del terminale', async ({ request }) => {
  const res = await request.get('/lettura/libro-che-non-esiste');
  // astro preview serve 404.html con stato 404
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain('file o cartella inesistente');
});

test('immagine OG e immagine della canzone', async ({ request }) => {
  const og = await request.get('/og/canzoni/2026-11-10.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toContain('image/png');
  const img = await request.get('/_img/post/2026-01-05-prova/foto.png');
  expect(img.status()).toBe(200);
  expect((await request.get('/og/home.png')).status()).toBe(200);
});

test('meta Open Graph nell HTML statico', async ({ page }) => {
  await page.goto('/canzoni/2026-11-10');
  const og = (p: string) => page.locator(`meta[property="${p}"]`).getAttribute('content');
  expect(await og('og:image')).toMatch(/^https:\/\/.+\/og\/canzoni\/2026-11-10\.png$/);
  expect(await og('og:url')).toMatch(/^https:\/\//);
  expect(await og('og:image:width')).toBe('1200');
  expect(await og('og:image:height')).toBe('630');
  expect(await og('og:locale')).toBe('it_IT');
  expect(await og('og:description')).toBe('Una canzone al giorno, 10/11/2026: Un giorno qualunque (Drew Example)');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
});
