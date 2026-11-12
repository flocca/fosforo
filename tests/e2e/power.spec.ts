// Spegnimento: pulsante, comando shutdown, collasso, ritorno a / e riaccensione.
import { expect, test, type Page } from '@playwright/test';
import { FIRST_ROM, output, powerButton, prompt, romLines, SECOND_ROM, today, WELCOME } from './helpers';

test.use({ viewport: { width: 1280, height: 800 } });

const screenEl = (page: Page) => page.locator('.screen');

// Prima del collasso completo lo schermo non è spento; dopo sì.
async function expectOffBetween(page: Page, minMs: number, maxMs: number, since: number) {
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: maxMs });
  expect(Date.now() - since).toBeGreaterThanOrEqual(minMs);
}

async function shutdown(page: Page) {
  await expect(prompt(page)).toBeFocused();
  // fill: il tasto che salta il boot finisce anche nel campo
  await prompt(page).fill('shutdown');
  await prompt(page).press('Enter');
}

test('dal link profondo il pulsante spegne: spia subito, collasso, poi /', async ({ page }) => {
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await expect(powerButton(page, 'Spegni')).toBeEnabled();
  await powerButton(page, 'Spegni').click();
  const clicked = Date.now();
  await expect(page.locator('.power-led')).not.toHaveClass(/is-on/, { timeout: 100 });
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
  await expectOffBetween(page, 1500, 2500, clicked);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.screen-off')).toBeVisible();
  await expect(powerButton(page, 'Accendi')).toBeEnabled();
  await expect(powerButton(page, 'Accendi')).toHaveAttribute('title', 'Accendi');
});

test('shutdown: SYSTEM HALTED, poi spento; INVIO riaccende', async ({ page }) => {
  await today(page);
  await page.goto('/chi-sono');
  await shutdown(page);
  await expect(output(page)).toContainText('SYSTEM HALTED');
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 3000 });
  await page.keyboard.press('Enter');
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
});

test('il pulsante durante il boot completo spegne, e il boot del giorno si rifà', async ({ page }) => {
  await today(page, '2026-11-10');
  await page.goto('/');
  await powerButton(page).click();
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await expect(powerButton(page, 'Spegni')).toBeEnabled();
  await powerButton(page, 'Spegni').click();
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 2500 });
  await expect(romLines(page, SECOND_ROM)).toHaveCount(0);
  await powerButton(page).click();
  await expect(romLines(page, SECOND_ROM)).toHaveCount(1, { timeout: 4000 });
});

test('pulsante bloccato durante l\'alone e il collasso', async ({ page }) => {
  await today(page);
  await page.goto('/');
  await powerButton(page).click();
  await expect(powerButton(page, 'Spegni')).toBeDisabled();
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await expect(powerButton(page, 'Spegni')).toBeEnabled();
  await powerButton(page, 'Spegni').click();
  await expect(powerButton(page, 'Accendi')).toBeDisabled();
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 2500 });
  await expect(powerButton(page, 'Accendi')).toBeEnabled();
});

test('indietro a monitor spento riapre la pagina', async ({ page }) => {
  await page.goto('/chi-sono');
  await shutdown(page);
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 3000 });
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/chi-sono$/);
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
  await expect(page.locator('.power-led')).toHaveClass(/is-on/);
  await expect(output(page)).toContainText('Sono una persona di esempio.');
  await expect(powerButton(page, 'Spegni')).toBeEnabled();
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toBeFocused();
});

test('spegnere dalla home non allunga la cronologia', async ({ page }) => {
  await today(page);
  await page.goto('/');
  await powerButton(page).click();
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
  await page.keyboard.press('x');
  const before = await page.evaluate(() => history.length);
  await shutdown(page);
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 3000 });
  expect(await page.evaluate(() => history.length)).toBe(before);
  await expect(page).toHaveURL(/\/$/);
});

test('movimento ridotto: spento subito', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await powerButton(page, 'Spegni').click();
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 300 });
});

test('Review Focus 2: INVIO ripetuto durante il collasso non riaccende', async ({ page }) => {
  await today(page);
  await page.goto('/chi-sono');
  await shutdown(page);
  await expect(output(page)).toContainText('SYSTEM HALTED');
  await expect(screenEl(page)).toHaveClass(/is-collapsing/, { timeout: 1000 });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  }
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 3000 });
  await page.waitForTimeout(1500);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(0);
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await page.keyboard.press('Enter');
  await expect(romLines(page, FIRST_ROM)).toHaveCount(1);
});

test('Review Focus 3: doppio clic sul pulsante acceso, un solo spegnimento', async ({ page }) => {
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await powerButton(page, 'Spegni').dblclick();
  await page.waitForTimeout(3000);
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(0);
});

test('Review Focus 4: spegnere mentre cat aspetta la rete, niente stampato a monitor spento', async ({ page }) => {
  await page.goto('/canzoni');
  await expect(prompt(page)).toBeFocused();
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/_fs/chi-sono.json', async (route) => {
    await held;
    await route.continue();
  });
  await page.keyboard.type('cat /chi-sono');
  await page.keyboard.press('Enter');
  await expect(output(page)).toContainText('$ cat /chi-sono');
  await powerButton(page, 'Spegni').click();
  // il collasso parte allo scatto, senza aspettare il comando in corso
  await expect(screenEl(page)).toHaveClass(/is-collapsing/, { timeout: 100 });
  await page.waitForTimeout(1000);
  release();
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 3000 });
  await page.waitForTimeout(500);
  await expect(output(page)).toHaveText('');
  await expect(page).toHaveURL(/\/$/);
});

test('Review Focus 5: dopo lo spegnimento il campo è vuoto e senza fuoco', async ({ page }) => {
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await page.keyboard.type('abc');
  await powerButton(page, 'Spegni').click();
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 2500 });
  const input = page.locator('#screen .term-prompt input');
  await expect(input).toHaveValue('');
  await expect(input).not.toBeFocused();
});

test('movimento ridotto: il doppio clic che accende resta un\'accensione sola', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await powerButton(page).dblclick();
  await expect(output(page)).toContainText(WELCOME);
  await expect(screenEl(page)).not.toHaveClass(/is-off/);
  await expect(powerButton(page, 'Spegni')).toBeEnabled();
});

test('movimento ridotto: il doppio clic che spegne resta uno spegnimento solo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await powerButton(page, 'Spegni').dblclick();
  await page.waitForTimeout(1000);
  await expect(screenEl(page)).toHaveClass(/is-off/);
  await expect(romLines(page, FIRST_ROM)).toHaveCount(0);
});

test('Indietro durante la pausa di SYSTEM HALTED: spento su /, niente stampato', async ({ page }) => {
  await page.goto('/chi-sono');
  await expect(prompt(page)).toBeFocused();
  await prompt(page).fill('cd /canzoni');
  await prompt(page).press('Enter');
  await expect(page).toHaveURL(/\/canzoni$/);
  await shutdown(page);
  await expect(output(page)).toContainText('SYSTEM HALTED');
  await page.goBack();
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 3000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/$/);
  await expect(output(page)).toHaveText('');
  await expect(screenEl(page)).toHaveClass(/is-off/);
});

test('movimento ridotto: spegnere mentre cat aspetta la rete spegne subito lo schermo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/canzoni');
  await expect(prompt(page)).toBeFocused();
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/_fs/chi-sono.json', async (route) => {
    await held;
    await route.continue();
  });
  await page.keyboard.type('cat /chi-sono');
  await page.keyboard.press('Enter');
  await expect(output(page)).toContainText('$ cat /chi-sono');
  await powerButton(page, 'Spegni').click();
  await expect(screenEl(page)).toHaveClass(/is-off/, { timeout: 300 });
  release();
  await expect(powerButton(page, 'Accendi')).toBeEnabled();
  await expect(output(page)).toHaveText('');
});
