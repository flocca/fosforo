// Link già acceso (il visitatore ha acceso il monitor oggi): l'audio parte solo dal tasto del suono.
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { audioContexts, countAudioContexts, output, powerButton, prompt } from './helpers';

test.use({ viewport: { width: 1280, height: 800 } });

const SONG = '/canzoni/2026-11-10';
const soundLed = (page: Page) => page.locator('.sound-led');
const soundButton = (page: Page) => page.locator('.sound-button');
const savedSound = (page: Page) => page.evaluate(() => localStorage.getItem('fosforo.suono'));

async function expectShownOff(page: Page) {
  await expect(soundLed(page)).not.toHaveClass(/is-on/);
  await expect(soundButton(page)).toHaveAccessibleName('Suono spento');
  await expect(soundButton(page)).toHaveAttribute('aria-pressed', 'false');
}

async function expectShownOn(page: Page) {
  await expect(soundLed(page)).toHaveClass(/is-on/);
  await expect(soundButton(page)).toHaveAccessibleName('Suono acceso');
  await expect(soundButton(page)).toHaveAttribute('aria-pressed', 'true');
}

test.beforeEach(async ({ page }) => {
  await countAudioContexts(page);
});

test('clic sullo schermo e tasti non fanno partire l\'audio; spia e tasto spenti', async ({ page }) => {
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await expectShownOff(page);
  await page.locator('.screen').click();
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');
  await expect(output(page)).toContainText('$ pwd');
  await page.mouse.click(5, 5);
  expect(await audioContexts(page)).toBe(0);
  await expectShownOff(page);
});

test('preferenza accesa: il tasto fa partire l\'audio e non salva niente', async ({ page }) => {
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await soundButton(page).click();
  await expectShownOn(page);
  expect(await audioContexts(page)).toBe(1);
  expect(await savedSound(page)).toBeNull();
  // dopo la partenza il tasto alterna come sempre
  await soundButton(page).click();
  await expectShownOff(page);
  expect(await savedSound(page)).toBe('spento');
  await soundButton(page).click();
  await expectShownOn(page);
  expect(await savedSound(page)).toBeNull();
  expect(await audioContexts(page)).toBe(1);
});

test('preferenza spenta: il tasto fa partire l\'audio e salva acceso', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fosforo.suono', 'spento'));
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await expectShownOff(page);
  await page.keyboard.press('x');
  expect(await audioContexts(page)).toBe(0);
  await soundButton(page).click();
  await expectShownOn(page);
  expect(await audioContexts(page)).toBe(1);
  expect(await savedSound(page)).toBeNull();
});

test('il tasto funziona anche da tastiera', async ({ page }) => {
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await soundButton(page).focus();
  await page.keyboard.press(' ');
  await expectShownOn(page);
  expect(await audioContexts(page)).toBe(1);
});

test('il comando suono si comporta come il tasto', async ({ page }) => {
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await prompt(page).fill('suono spento');
  await prompt(page).press('Enter');
  await expect(output(page)).toContainText('Suono spento.');
  await expectShownOff(page);
  expect(await savedSound(page)).toBe('spento');
  expect(await audioContexts(page)).toBe(0);

  await prompt(page).fill('suono');
  await prompt(page).press('Enter');
  await expect(output(page)).toContainText('Suono acceso.');
  await expectShownOn(page);
  expect(await savedSound(page)).toBeNull();
  expect(await audioContexts(page)).toBe(1);
});

test('spento e riacceso dall\'interruttore: l\'audio parte con l\'accensione', async ({ page }) => {
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await powerButton(page, 'Spegni').click();
  await expect(page.locator('.screen')).toHaveClass(/is-off/);
  expect(await audioContexts(page)).toBe(0);
  await expect(powerButton(page)).toBeEnabled();
  await powerButton(page).click();
  expect(await audioContexts(page)).toBe(1);
  await expectShownOn(page);
});

test('a monitor spento il tasto del suono non fa partire l\'audio, come sulla home', async ({ page }) => {
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await prompt(page).fill('shutdown');
  await prompt(page).press('Enter');
  await expect(page.locator('.screen')).toHaveClass(/is-off/);
  // spento, spia e tasto mostrano la preferenza come sulla home
  await expectShownOn(page);
  await soundButton(page).click();
  await expectShownOff(page);
  expect(await savedSound(page)).toBe('spento');
  expect(await audioContexts(page)).toBe(0);
});

test('la 404 fa partire l\'audio al primo gesto', async ({ page }) => {
  await page.goto('/non-esiste');
  await expect(prompt(page)).toBeFocused();
  await expectShownOn(page);
  expect(await audioContexts(page)).toBe(0);
  await page.keyboard.press('x');
  expect(await audioContexts(page)).toBe(1);
});

// Il primo disegno lo decide lo script in testa: senza il client resta quello.
const ledLit = (page: Page) => page.locator('.sound-led').evaluate((el) => getComputedStyle(el).backgroundImage.includes('gradient'));

test.describe('prima del client', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/_astro/*.js', (r) => r.abort());
  });

  test('link già acceso: la spia del suono è spenta dal primo disegno', async ({ page }) => {
    await page.goto(SONG);
    expect(await ledLit(page)).toBe(false);
  });

  test('preferenza spenta: la spia del suono è spenta dal primo disegno, anche sulla home', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fosforo.suono', 'spento'));
    await page.goto('/');
    expect(await ledLit(page)).toBe(false);
  });

  test('home e 404 con il suono acceso: la spia è accesa', async ({ page }) => {
    await page.goto('/');
    expect(await ledLit(page)).toBe(true);
    await page.goto('/non-esiste');
    expect(await ledLit(page)).toBe(true);
  });
});

test.describe('primo giorno', () => {
  test.use({ poweredToday: false });

  test('prima del client la spia del suono è accesa', async ({ page }) => {
    await page.route('**/_astro/*.js', (r) => r.abort());
    await page.goto(SONG);
    expect(await ledLit(page)).toBe(true);
  });
});

test('con il client la spia segue lo stato: il segno dello script in testa non resta', async ({ page }) => {
  await page.goto(SONG);
  await expect(prompt(page)).toBeFocused();
  await expect(page.locator('html')).not.toHaveClass(/sound-pending/);
  await soundButton(page).click();
  await expectShownOn(page);
  expect(await ledLit(page)).toBe(true);
});

test.describe('primo giorno con l\'indice in ritardo', () => {
  test.use({ poweredToday: false });

  test('il contenuto torna acceso e il primo gesto fa partire l\'audio', async ({ page }) => {
    await page.route('**/_fs/index.json', async (r) => {
      await new Promise((ok) => setTimeout(ok, 3500));
      await r.continue();
    });
    await page.goto(SONG);
    await expect(prompt(page)).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.screen')).not.toHaveClass(/is-off/);
    await expectShownOn(page);
    expect(await audioContexts(page)).toBe(0);
    await page.keyboard.press('x');
    expect(await audioContexts(page)).toBe(1);
  });
});

test.describe('telefono', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

  test('un tocco sullo schermo non fa partire l\'audio, il tasto sì', async ({ page }) => {
    await page.goto(SONG);
    await expect(prompt(page)).toBeVisible();
    await page.locator('.screen').tap();
    expect(await audioContexts(page)).toBe(0);
    await expectShownOff(page);
    await soundButton(page).tap();
    await expectShownOn(page);
    expect(await audioContexts(page)).toBe(1);
  });
});
