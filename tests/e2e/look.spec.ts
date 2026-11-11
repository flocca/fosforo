// Aspetto CRT: confronti visivi. Le baseline si generano dopo l'approvazione di Giacomo,
// nel container di Playwright; fuori da lì il test gira solo con PW_VISUAL=1.
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.PW_VISUAL, 'confronti visivi solo con PW_VISUAL=1');

const PHOSPHORS = ['verde', 'ambra', 'bianco'] as const;

async function withPhosphor(page: Page, ph: string) {
  await page.addInitScript((v) => {
    try {
      localStorage.setItem('fosforo.fosfori', v);
    } catch {}
  }, ph);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const ph of PHOSPHORS) {
    test(`/chi-sono con i fosfori ${ph}`, async ({ page }) => {
      await withPhosphor(page, ph);
      await page.goto('/chi-sono');
      await expect(page.locator('html')).toHaveAttribute('data-fosfori', ph);
      await settle(page);
      await expect(page).toHaveScreenshot(`chi-sono-${ph}.png`, { animations: 'disabled' });
    });
  }

  test('immagine di un post attraverso il fosforo', async ({ page }) => {
    await withPhosphor(page, 'verde');
    await page.goto('/post/2026-01-05-prova');
    const img = page.locator('.ph-img img');
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty('complete', true);
    await settle(page);
    await expect(page).toHaveScreenshot('post-immagine-verde.png', { animations: 'disabled' });
  });
});

test.describe('telefono', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('home con il monitor spento', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.screen')).toHaveClass(/is-off/);
    await settle(page);
    await expect(page).toHaveScreenshot('home-telefono-spento.png', { animations: 'disabled' });
  });
});
