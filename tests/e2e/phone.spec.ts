// Telefono: tocchi, comandi rapidi, tastiera solo su richiesta, nessuno scroll orizzontale.
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';

const { defaultBrowserType: _b, ...iphone } = devices['iPhone 13'];
test.use(iphone);

const prompt = (page: Page) => page.getByRole('textbox', { name: 'Comando' });
const chips = (page: Page) => page.locator('.chips');
const chip = (page: Page, name: string) => chips(page).getByRole('button', { name, exact: true });
const output = (page: Page) => page.locator('#screen .term-out');
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function powerOn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Accendi' }).tap();
  await expect(output(page)).toContainText('Benvenuto. Tocca un nome oppure scrivi help.', { timeout: 15_000 });
}

test('accensione, comandi rapidi e navigazione a tocchi', async ({ page }) => {
  await powerOn(page);
  await expect(prompt(page)).not.toBeFocused();
  await expect(chips(page)).toBeVisible();
  await expect(chips(page).getByRole('button')).toHaveText(['ls', 'cd ..', 'help', 'suono', 'scrivi']);

  await chip(page, 'ls').tap();
  await expect(output(page)).toContainText('$ ls');
  await page.locator('#screen a[data-cmd]', { hasText: /^canzoni\/$/ }).last().tap();
  await expect(page).toHaveURL(/\/canzoni$/);
  await expect(prompt(page)).not.toBeFocused();
  await page.locator('#screen a[data-cmd^="cat /canzoni/"]').last().tap();
  await expect(page).toHaveURL(/\/canzoni\/\d{4}-\d{2}-\d{2}$/);
  await expect(prompt(page)).not.toBeFocused();

  await chip(page, 'cd ..').tap();
  await expect(page.locator('#screen .term-prompt')).toContainText('~ $'); // dalla canzone si sale alla radice
  await chip(page, 'help').tap();
  await expect(output(page)).toContainText('questo elenco');
  await chip(page, 'suono').tap();
  await expect(page.getByRole('button', { name: 'Suono spento' })).toBeVisible();
  await expect(prompt(page)).not.toBeFocused();
});

test('"scrivi" apre la tastiera, toccare lo schermo no', async ({ page }) => {
  await powerOn(page);
  await page.locator('#screen .term-out').tap({ position: { x: 20, y: 5 } });
  await expect(prompt(page)).not.toBeFocused();
  await chip(page, 'scrivi').tap();
  await expect(prompt(page)).toBeFocused();
  const size = await prompt(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16); // iOS non ingrandisce la pagina al focus
});

test('un tocco sul chip durante il boot salta il boot e non esegue il comando', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Accendi' }).tap();
  await expect(chips(page)).toBeVisible();
  // durante l'alone il tocco non fa niente; con la prima riga della ROM salta alla fine
  await expect(output(page).locator('.term-line', { hasText: 'FOSFORO VT-78' })).toHaveCount(1);
  await chip(page, 'help').tap();
  await expect(output(page)).toContainText('Benvenuto. Tocca un nome oppure scrivi help.');
  await expect(output(page)).not.toContainText('$ help');
});

test('chip nascosti a monitor spento', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.screen')).toHaveClass(/is-off/);
  await expect(chips(page)).toBeHidden();
});

test('dopo il caricamento di un link profondo il campo non ha il fuoco', async ({ page }) => {
  await page.goto('/chi-sono');
  await expect(output(page)).toContainText('$ cat /chi-sono');
  await expect(chips(page)).toBeVisible();
  await expect(prompt(page)).not.toBeFocused();
});

test.describe('320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('post con URL lungo: nessuno scroll orizzontale, URL spezzato', async ({ page }) => {
    await page.goto('/messaggi/2026-01-05-prova');
    await expect(output(page)).toContainText('$ cat /messaggi/2026-01-05-prova');
    expect(await noHScroll(page)).toBe(true);
    const termOverflow = await page.locator('.term').evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(termOverflow).toBe(true);
  });

  test('il boot ROM non va a capo e non scrolla in orizzontale', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Accendi' }).tap();
    await expect(output(page)).toContainText('Benvenuto', { timeout: 15_000 });
    expect(await noHScroll(page)).toBe(true);
    // ogni riga ROM è una sola riga visiva: altezza pari a una riga di testo
    const heights = await output(page)
      .locator('.term-line.rom')
      .evaluateAll((els) => els.map((e) => ({ t: e.textContent, h: e.getBoundingClientRect().height, w: e.scrollWidth - e.clientWidth })));
    expect(heights.length).toBeGreaterThan(3);
    const one = Math.min(...heights.map((x) => x.h));
    for (const x of heights) expect(x.h, x.t ?? '').toBeLessThan(one * 1.5);
    // il logo di esempio sta intero a 320 px
    for (const x of heights) expect(x.w, x.t ?? '').toBeLessThanOrEqual(0);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });

  test('niente chip e fuoco sul campo', async ({ page }) => {
    await page.goto('/chi-sono');
    await expect(prompt(page)).toBeFocused();
    await expect(chips(page)).toBeHidden();
  });
});
