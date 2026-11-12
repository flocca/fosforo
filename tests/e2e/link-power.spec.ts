// Link profondo aperto la prima volta del giorno: monitor spento, contenuto leggibile sotto il velo.
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

test.use({ poweredToday: false, viewport: { width: 1280, height: 800 } });

// una canzone senza alias, dai contenuti di esempio
const SONG = '/canzoni/2026-11-10';
const SONG_TITLE = 'Un giorno qualunque';

const screenEl = (page: Page) => page.locator('.screen');
const offText = (page: Page) =>
  page.locator('.screen-off').evaluate((el) => getComputedStyle(el, '::before').content);

// Lo scatto del monitor a font caricati, senza animazioni.
async function monitorShot(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.load('400 16px "Fira Mono"', 'M');
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  return page.locator('.monitor').screenshot({ animations: 'disabled' });
}

test('il link si apre spento, con la scritta della home', async ({ page }) => {
  await page.goto('/');
  await expect(screenEl(page)).toHaveClass(/is-off/);
  const homeText = await offText(page);
  await page.goto(SONG);
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await expect(page.locator('.power-led')).not.toHaveClass(/is-on/);
  expect(await offText(page)).toBe(homeText);
});

test('spento ma leggibile', async ({ page }) => {
  await page.goto(SONG);
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await expect(page.locator('#screen')).toBeVisible();
  await expect(page.locator('#screen').getByText(SONG_TITLE).first()).toBeAttached();
  const name = await page.locator('.power-button').getAttribute('aria-label');
  expect(name).toMatch(/^Accendi il monitor: /);
  await expect(page.locator('.power-button')).toBeEnabled();
});

test('deciso prima del primo disegno', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as { pendingAtDcl?: boolean }).pendingAtDcl = document.documentElement.classList.contains('power-pending');
    });
  });
  await page.goto(SONG, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => (window as { pendingAtDcl?: boolean }).pendingAtDcl)).toBe(true);
});

test('stesso aspetto della home spenta', async ({ page }) => {
  await page.goto('/');
  await expect(screenEl(page)).toHaveClass(/is-off/);
  const home = await monitorShot(page);
  await page.goto(SONG);
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await expect(page.locator('.power-button')).toBeEnabled();
  const item = await monitorShot(page);
  expect(Buffer.compare(home, item)).toBe(0);
});

test('acceso oggi: si apre acceso', async ({ page }) => {
  await page.addInitScript(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    localStorage.setItem('fosforo.ultimaAccensione', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  });
  await page.goto(SONG);
  await expect(page.getByRole('textbox', { name: 'Comando' })).toBeVisible();
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
});

test('la 404 resta accesa', async ({ page }) => {
  await page.goto('/non-esiste');
  await expect(page.getByRole('textbox', { name: 'Comando' })).toBeVisible();
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
  await expect(page.locator('html')).not.toHaveClass(/power-pending/);
});

test('senza storage parte spento', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('storage bloccato');
    };
  });
  await page.goto(SONG);
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await screenEl(page).click();
  await expect(page.locator('.power-led')).toHaveClass(/is-on/);
});

test('Review Focus 2: senza indice si riaccende', async ({ page }) => {
  await page.route('**/_fs/index.json', (r) => r.abort());
  await page.goto(SONG);
  await page.waitForLoadState('load');
  await expect(page.locator('html')).not.toHaveClass(/power-pending/);
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
  await expect(page.locator('#screen').getByText(SONG_TITLE).first()).toBeVisible();
});
