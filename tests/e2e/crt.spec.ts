// Monitor CRT: fosfori dallo storage, struttura del monitor, niente scorrimento orizzontale.
import { expect, test } from '@playwright/test';

test('i fosfori salvati si applicano prima del disegno', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fosforo.fosfori', 'ambra'));
  await page.goto('/chi-sono');
  await expect(page.locator('html')).toHaveAttribute('data-fosfori', 'ambra');
  const color = await page.locator('.term').evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(255, 176, 0)');
});

test('un valore sconosciuto nello storage lascia il verde', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fosforo.fosfori', 'viola'));
  await page.goto('/chi-sono');
  await expect(page.locator('html')).toHaveAttribute('data-fosfori', 'verde');
});

test('il monitor ha interruttore, LED e indicatore del suono', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Accendi' })).toBeVisible();
  await expect(page.locator('.led')).toHaveCount(1);
  await expect(page.locator('.sound-indicator')).toHaveText('suono: acceso');
  await expect(page.locator('.screen #screen .term')).toHaveCount(1);
});

test.describe('telefono a 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const url of ['/', '/post/2026-01-05-prova', '/lettura/termination-shock']) {
    test(`niente scorrimento orizzontale in ${url}`, async ({ page }) => {
      await page.goto(url);
      const { sw, cw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(sw).toBeLessThanOrEqual(cw);
      // l'interruttore c'è sempre; si chiama "Accendi" solo sulla home spenta
      const button = await page.locator('.power-button').boundingBox();
      const screen = await page.locator('.screen').boundingBox();
      expect(button!.y).toBeGreaterThan(screen!.y + screen!.height);
    });
  }
});

test.describe('senza JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('il verde è lo stile predefinito', async ({ page }) => {
    await page.goto('/chi-sono');
    await expect(page.locator('html')).toHaveAttribute('data-fosfori', 'verde');
    const color = await page.locator('.term').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(51, 255, 102)');
  });
});

test.describe('movimento ridotto', () => {
  test.use({ reducedMotion: 'reduce' });

  test('niente sfarfallio e niente lampo di accensione', async ({ page }) => {
    await page.goto('/chi-sono');
    const names = await page.evaluate(() => {
      const screen = document.querySelector('.screen')!;
      screen.classList.add('is-powering');
      return [
        getComputedStyle(screen, '::after').animationName,
        getComputedStyle(screen.querySelector('main')!).animationName,
      ];
    });
    expect(names).toEqual(['none', 'none']);
  });
});
