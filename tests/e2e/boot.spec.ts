// Accensione: interruttore, boot giornaliero, avvio rapido, preferenze e selettore dei fosfori.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

const FIRST_ROM = 'FOSFORO VT-78  ROM v1.3';
const SECOND_ROM = 'MEMORY TEST ........ 65536 BYTES OK';
const WELCOME = 'Benvenuto. Scrivi help oppure clicca un nome.';
const prompt = (page: Page) => page.getByRole('textbox', { name: 'Comando' });
const powerButton = (page: Page) => page.getByRole('button', { name: 'Accendi' });
const output = (page: Page) => page.locator('#screen .term-out');
const romLines = (page: Page, text: string) => output(page).locator('.term-line', { hasText: text });

const welcomeLines = (page: Page) => output(page).locator('.term-line', { hasText: WELCOME });

// Conta i boot: ognuno scrive fosforo.ultimoBoot all'inizio.
async function countBoots(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { bootWrites: number };
    w.bootWrites = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'fosforo.ultimoBoot') w.bootWrites++;
      return set.call(this, k, v);
    };
  });
}
const bootWrites = (page: Page) => page.evaluate(() => (window as unknown as { bootWrites: number }).bootWrites);

// Il giorno del visitatore lo decide l'orologio della pagina.
async function today(page: Page, lastBoot?: string) {
  await page.clock.install({ time: new Date('2026-11-11T10:00:00') });
  if (lastBoot) await page.addInitScript((d) => localStorage.setItem('fosforo.ultimoBoot', d), lastBoot);
}

test('la home parte spenta, con l\'interruttore e senza prompt', async ({ page }) => {
  await today(page);
  await page.goto('/');
  await expect(page.locator('.screen')).toHaveClass(/is-off/);
  await expect(page.locator('.led')).not.toHaveClass(/is-on/);
  await expect(powerButton(page)).toBeEnabled();
  await expect(prompt(page)).toHaveCount(0);
  // il livello 0 resta nella pagina ma non si vede
  await expect(page.locator('#screen')).toBeHidden();
});

test('Review Focus 4: doppio clic, un solo boot; un tasto salta alla fine', async ({ page }) => {
  await today(page, '2026-11-10');
  await countBoots(page);
  await page.goto('/');
  await powerButton(page).dblclick();
  await expect(page.locator('.led')).toHaveClass(/is-on/);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await page.keyboard.press('x');
  await expect(output(page)).toContainText(WELCOME, { timeout: 300 });
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  // il boot completo ha stampato tutte le righe, data della canzone compresa
  await expect(output(page)).toContainText(SECOND_ROM);
  await expect(output(page)).toContainText('LOADING CANZONE .... 10/11/2026');
  await expect(prompt(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Accendi' })).toHaveCount(0);
  // oltre la durata di un boot completo: nessun secondo boot in coda
  await page.clock.runFor(8000);
  await expect(welcomeLines(page)).toHaveCount(1);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  expect(await bootWrites(page)).toBe(1);
  // dopo il benvenuto solo il prompt, con help cliccabile
  await expect(output(page).locator('a[data-cmd]')).toHaveCount(1);
  await output(page).locator('a[data-cmd="help"]').click();
  await expect(output(page)).toContainText('questo elenco');
});

test('Review Focus 4: doppio clic sullo schermo spento, un solo boot e niente salto', async ({ page }) => {
  await today(page, '2026-11-10');
  await countBoots(page);
  await page.goto('/');
  await expect(powerButton(page)).toBeEnabled();
  // orologio fermo: il tempo avanza solo con runFor
  await page.clock.pauseAt(new Date('2026-11-11T10:00:10'));
  await page.locator('.screen').dblclick();
  // il secondo clic non salta il boot: dopo lampo e attesa c'è solo la prima riga
  await page.clock.runFor(1450);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await expect(romLines(page, SECOND_ROM)).toHaveCount(0);
  await expect(welcomeLines(page)).toHaveCount(0);
  await page.clock.runFor(8000);
  await expect(welcomeLines(page)).toHaveCount(1);
  await expect(output(page)).toContainText(SECOND_ROM);
  expect(await bootWrites(page)).toBe(1);
});

test('INVIO a monitor spento accende', async ({ page }) => {
  await today(page);
  await page.goto('/');
  await expect(powerButton(page)).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
});

test('seconda visita nello stesso giorno: avvio rapido', async ({ page }) => {
  await today(page);
  await page.goto('/');
  await powerButton(page).click();
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await page.keyboard.press('x');
  await expect(prompt(page)).toBeFocused();

  await page.reload();
  await powerButton(page).click();
  const clicked = Date.now();
  await expect(output(page)).toContainText(WELCOME, { timeout: 1500 });
  expect(Date.now() - clicked).toBeLessThan(1500);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await expect(romLines(page, SECOND_ROM)).toHaveCount(0);
});

test('movimento ridotto: avvio rapido anche in un giorno nuovo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await today(page, '2026-11-10');
  await page.goto('/');
  await powerButton(page).click();
  await expect(output(page)).toContainText(WELCOME, { timeout: 1500 });
  await expect(romLines(page, SECOND_ROM)).toHaveCount(0);
  await expect(page.locator('.screen')).not.toHaveClass(/is-powering/);
});

test('link profondo: nessun interruttore, prompt subito', async ({ page }) => {
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accendi' })).toHaveCount(0);
  await expect(page.locator('.screen')).not.toHaveClass(/is-off/);
  await expect(page.locator('.led')).toHaveClass(/is-on/);
});

test('reboot: schermo spento, boot completo dalla radice anche nello stesso giorno', async ({ page }) => {
  await today(page, '2026-11-11');
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await page.keyboard.type('reboot');
  await page.keyboard.press('Enter');
  await expect(page.locator('.screen')).toHaveClass(/is-off/);
  await expect(page.locator('.led')).not.toHaveClass(/is-on/);
  await expect(romLines(page, SECOND_ROM)).toHaveCount(1, { timeout: 4000 });
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press('x');
  await expect(output(page)).toContainText(WELCOME);
  await expect(page.locator('#screen .term-prompt')).toContainText('guest@example.com ~ $');
});

test('reboot con il movimento ridotto: avvio rapido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await today(page, '2026-11-10');
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await page.keyboard.type('reboot');
  await page.keyboard.press('Enter');
  await expect(output(page)).toContainText(WELCOME, { timeout: 2000 });
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await expect(romLines(page, SECOND_ROM)).toHaveCount(0);
});

test('Review Focus 2: senza storage la home si accende lo stesso', async ({ page }) => {
  await page.addInitScript(() => {
    const fail = () => {
      throw new DOMException('bloccato', 'SecurityError');
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: fail });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await powerButton(page).click();
  await page.locator('.screen').click({ position: { x: 20, y: 20 }, delay: 300 });
  await expect(output(page)).toContainText(WELCOME, { timeout: 6000 });
  await page.getByRole('button', { name: 'Cambia colore dei fosfori' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-fosfori', 'ambra');
  expect(errors).toEqual([]);
});

test('il selettore dei fosfori: verde, ambra, bianco, verde, e resta dopo il ricaricamento', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const button = page.getByRole('button', { name: 'Cambia colore dei fosfori' });
  await expect(html).toHaveAttribute('data-fosfori', 'verde');
  // funziona a monitor spento
  await button.click();
  await expect(html).toHaveAttribute('data-fosfori', 'ambra');
  await expect(button).toHaveAttribute('title', 'Fosfori: ambra');
  await page.reload();
  await expect(html).toHaveAttribute('data-fosfori', 'ambra');
  await button.click();
  await expect(html).toHaveAttribute('data-fosfori', 'bianco');
  await button.click();
  await expect(html).toHaveAttribute('data-fosfori', 'verde');
  await page.reload();
  await expect(html).toHaveAttribute('data-fosfori', 'verde');
  expect(await page.evaluate(() => localStorage.getItem('fosforo.fosfori'))).toBe('verde');

  // e a monitor acceso, con lo stesso effetto del comando
  await page.goto('/chi-sono');
  await button.click();
  await expect(html).toHaveAttribute('data-fosfori', 'ambra');
  await prompt(page).fill('fosfori');
  await prompt(page).press('Enter');
  await expect(output(page)).toContainText('Fosfori: ambra.');
});

test.describe('telefono a 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

  test('i due tasti sotto lo schermo, niente scorrimento orizzontale, benvenuto da touch', async ({ page }) => {
    await page.goto('/');
    const screen = (await page.locator('.screen').boundingBox())!;
    for (const name of ['Accendi', 'Cambia colore dei fosfori']) {
      const box = (await page.getByRole('button', { name }).boundingBox())!;
      expect(box.y).toBeGreaterThan(screen.y + screen.height);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    const { sw, cw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(sw).toBeLessThanOrEqual(cw);
    await page.getByRole('button', { name: 'Cambia colore dei fosfori' }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-fosfori', 'ambra');
    await page.getByRole('button', { name: 'Accendi' }).tap();
    await page.waitForTimeout(400);
    await page.locator('.screen').tap();
    await expect(page.locator('#screen .term-out')).toContainText('Benvenuto. Tocca un nome oppure scrivi help.');
  });
});

test.describe('senza JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('la home mostra il livello 0 e i tasti non si possono premere', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#screen')).toBeVisible();
    await expect(page.locator('#screen a[href="/chi-sono"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accendi' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cambia colore dei fosfori' })).toBeDisabled();
  });
});
