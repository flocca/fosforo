// Aspetto CRT: confronti visivi. Le baseline (approvate da Giacomo) sono in look.spec.ts-snapshots/
// e valgono solo nel container di Playwright; fuori da lì il test gira solo con PW_VISUAL=1.
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';

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
  // I caratteri si scaricano alla prima comparsa nel testo: li chiediamo noi (regolare e
  // grassetto), altrimenti `fonts.ready` può risolvere prima e lo scatto cambia da una run all'altra.
  await page.evaluate(async () => {
    await Promise.all(
      ['400', '700'].map((w) => document.fonts.load(`${w} 16px "Fira Mono"`, 'aàè€│▸•')),
    );
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

// Le pagine degli elementi qui si aprono già accese (fixture `poweredToday`): l'audio aspetta
// il tasto del suono e spia e icona si mostrano spente. Le baseline approvate hanno il suono
// acceso: si preme il tasto da tastiera (niente hover né tasto abbassato del puntatore), poi
// si rimettono il fuoco e lo scorrimento com'erano.
async function startSound(page: Page) {
  const button = page.locator('.sound-button');
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    const w = window as unknown as { lookFocus: Element | null; lookScroll: [number, number] };
    w.lookFocus = document.activeElement;
    w.lookScroll = [scrollX, scrollY];
    document.querySelector<HTMLButtonElement>('.sound-button')!.focus({ preventScroll: true });
  });
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sound-led')).toHaveClass(/is-on/);
  await page.evaluate(() => {
    const w = window as unknown as { lookFocus: Element | null; lookScroll: [number, number] };
    const active = document.activeElement as HTMLElement | null;
    // se intanto il client ha spostato il fuoco (sul prompt) lo si lascia dov'è
    if (active?.classList.contains('sound-button')) {
      active.blur();
      if (w.lookFocus instanceof HTMLElement && w.lookFocus !== document.body) w.lookFocus.focus({ preventScroll: true });
    }
    scrollTo(...w.lookScroll);
  });
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const ph of PHOSPHORS) {
    test(`/chi-sono con i fosfori ${ph}`, async ({ page }) => {
      await withPhosphor(page, ph);
      await page.goto('/chi-sono');
      await expect(page.locator('html')).toHaveAttribute('data-fosfori', ph);
      await startSound(page);
      await settle(page);
      await expect(page).toHaveScreenshot(`chi-sono-${ph}.png`, { animations: 'disabled' });
    });
  }

  test('immagine di un post attraverso il fosforo', async ({ page }) => {
    await withPhosphor(page, 'verde');
    await page.goto('/post/2026-01-05-prova');
    // il terminale ridisegna la pagina statica dal gemello JSON (anche 1 s dopo, aspettando il font):
    // il prompt prende il fuoco solo a disegno finito, prima l'immagine può essere sostituita
    await expect(page.getByRole('textbox', { name: 'Comando' })).toBeFocused();
    const img = page.locator('.ph-img img');
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty('complete', true);
    await startSound(page);
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

  test('home accesa con i comandi rapidi', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Accendi' }).tap();
    await expect(page.locator('#screen .term-out')).toContainText('Benvenuto', { timeout: 15_000 });
    await expect(page.locator('.chips')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('home-telefono-acceso.png', { animations: 'disabled' });
  });
});

test.describe('telefono stretto (320 px)', () => {
  const { defaultBrowserType: _b, ...iphone } = devices['iPhone 13'];
  test.use({ ...iphone, viewport: { width: 320, height: 640 } });

  test('post con URL lungo', async ({ page }) => {
    await page.goto('/post/2026-01-05-prova');
    await expect(page.locator('#screen .term-out')).toContainText('$ cat /post/2026-01-05-prova');
    await startSound(page);
    await settle(page);
    await expect(page).toHaveScreenshot('post-telefono-320.png', { animations: 'disabled' });
  });
});
