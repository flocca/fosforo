// Link profondo aperto la prima volta del giorno: monitor spento, contenuto leggibile sotto il velo.
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { FIRST_ROM, output, prompt, romLines, SECOND_ROM, today, WELCOME } from './helpers';

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
  // la bozza resta solo nel nome accessibile: il tooltip è quello della home
  expect(await page.locator('.power-button').getAttribute('title')).toBe('Accendi');
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

// ── dopo il gesto: prima riga della ROM, poi il comando e il contenuto ─────

test('un clic: ROM, comando, contenuto', async ({ page }) => {
  await today(page);
  await page.goto(SONG);
  await expect(page.locator('.power-button')).toBeEnabled();
  const t0 = Date.now();
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible({ timeout: 3000 });
  await expect(output(page)).toContainText(SONG_TITLE, { timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3000);
  const text = (await output(page).textContent()) ?? '';
  const rom = text.indexOf(FIRST_ROM);
  const cmd = text.indexOf(`cat ${SONG}`);
  const title = text.indexOf(SONG_TITLE);
  expect(rom).toBeGreaterThanOrEqual(0);
  expect(cmd).toBeGreaterThan(rom);
  // una riga vuota fra la riga della ROM e quella del comando
  const lines = await output(page).locator('.term-line').allTextContents();
  const romAt = lines.findIndex((l) => l.includes(FIRST_ROM));
  expect(lines[romAt + 1].trim()).toBe('');
  expect(lines[romAt + 2]).toContain(`cat ${SONG}`);
  expect(title).toBeGreaterThan(cmd);
  expect(text).not.toContain(WELCOME);
  expect(text).not.toContain(SECOND_ROM);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`${SONG}$`));
});

test("scrive il giorno dell'accensione, non quello del boot", async ({ page }) => {
  await today(page);
  await page.goto(SONG);
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible();
  const keys = await page.evaluate(() => ({
    powerOn: localStorage.getItem('fosforo.ultimaAccensione'),
    boot: localStorage.getItem('fosforo.ultimoBoot'),
  }));
  expect(keys).toEqual({ powerOn: '2026-11-11', boot: null });
});

test('Review Focus 5: ricaricando resta acceso', async ({ page }) => {
  await today(page);
  await page.goto(SONG);
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible();
  await page.reload();
  await expect(prompt(page)).toBeVisible();
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
});

test('canzone-del-giorno', async ({ page }) => {
  await today(page);
  await page.goto('/canzone-del-giorno');
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible();
  await expect(output(page)).toContainText(SONG_TITLE);
  await expect(page).toHaveURL(new RegExp(`${SONG}$`));
});

test('Review Focus 1: senza gemello resta il contenuto', async ({ page }) => {
  await today(page);
  await page.route(`**/_fs${SONG}.json`, (r) => r.abort());
  await page.goto(SONG);
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible();
  await expect(output(page).getByText(SONG_TITLE).first()).toBeVisible();
  await expect(output(page)).toContainText(FIRST_ROM);
  await expect(output(page)).not.toContainText('impossibile leggere il file');
  await expect(page.locator('#screen .term-prompt')).toContainText('~/canzoni $');
});

test('Review Focus 3: INVIO su un link sotto il velo accende', async ({ page }) => {
  await today(page);
  await page.goto(SONG);
  await expect(page.locator('.power-button')).toBeEnabled();
  let onLink = false;
  for (let i = 0; i < 30 && !onLink; i++) {
    await page.keyboard.press('Tab');
    onLink = await page.evaluate(() => !!document.activeElement?.closest('#screen a'));
  }
  expect(onLink).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('.power-led')).toHaveClass(/is-on/);
  await expect(prompt(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${SONG}$`));
});

test('Review Focus 4: spento e riacceso, si comporta come la home', async ({ page }) => {
  await today(page);
  await page.goto(SONG);
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible();
  await prompt(page).fill('shutdown');
  await prompt(page).press('Enter');
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await expect(page.locator('.power-button')).toBeEnabled();
  await screenEl(page).click();
  await expect(romLines(page, SECOND_ROM)).toHaveCount(1);
  await expect(output(page)).toContainText(WELCOME);
  await expect(output(page)).not.toContainText(SONG_TITLE);
});

test('movimento ridotto', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await today(page);
  await page.goto(SONG);
  await expect(page.locator('.power-button')).toBeEnabled();
  await page.evaluate(() => {
    const el = document.querySelector('.screen')!;
    new MutationObserver(() => {
      if (el.classList.contains('is-warming')) (window as { warmed?: boolean }).warmed = true;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  const t0 = Date.now();
  await screenEl(page).click();
  // sotto i 1500 ms che l'accensione senza movimento ridotto non può battere (alone di 1200 ms)
  await expect(output(page)).toContainText(SONG_TITLE, { timeout: 1400 });
  expect(Date.now() - t0).toBeLessThan(1400);
  await expect(output(page)).toContainText(FIRST_ROM);
  expect(await page.evaluate(() => (window as { warmed?: boolean }).warmed ?? false)).toBe(false);
});

test('Review Focus 1: gemello che non arriva, resta il contenuto', async ({ page }) => {
  await today(page);
  // la richiesta resta appesa: non si risponde mai
  await page.route(`**/_fs${SONG}.json`, () => {});
  await page.goto(SONG);
  await expect(page.locator('.power-button')).toBeEnabled();
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible({ timeout: 5000 });
  await expect(output(page).getByText(SONG_TITLE).first()).toBeVisible();
  await expect(output(page)).toContainText(FIRST_ROM);
  await expect(output(page)).not.toContainText('impossibile leggere il file');
});

test('nome del pulsante su una cartella, senza il nome del sito', async ({ page }) => {
  await today(page);
  await page.goto('/canzoni');
  await expect(screenEl(page)).toHaveClass(/is-off/);
  const name = await page.locator('.power-button').getAttribute('aria-label');
  expect(name).toMatch(/^Accendi il monitor: /);
  expect(name).not.toContain('·');
  expect(name).not.toContain('example.com');
});

test('indice che non arriva: il contenuto torna visibile', async ({ page }) => {
  await page.route('**/_fs/index.json', () => {});
  await page.goto(SONG);
  await expect(page.locator('html')).not.toHaveClass(/power-pending/, { timeout: 6000 });
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
  await expect(page.locator('#screen').getByText(SONG_TITLE).first()).toBeVisible();
});

test('acceso dalla home, il link dello stesso giorno si apre acceso', async ({ page }) => {
  await today(page);
  await page.goto('/');
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await screenEl(page).click();
  await expect(prompt(page)).toBeVisible({ timeout: 15000 });
  await page.goto(SONG);
  await expect(prompt(page)).toBeVisible();
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
});
