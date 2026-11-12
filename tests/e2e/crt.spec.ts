// Monitor CRT: fosfori dallo storage, struttura del monitor, niente scorrimento orizzontale.
import { expect, test } from './fixtures';

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

test('il monitor ha interruttore, tasto del suono e tre spie', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Accendi' })).toBeVisible();
  await expect(page.locator('.panel-led')).toHaveCount(3);
  await expect(page.locator('.panel-led[aria-hidden="true"]')).toHaveCount(3);
  await expect(page.locator('.sound-state, .led')).toHaveCount(0);
  await expect(page.locator('.sound-led')).toHaveClass(/is-on/);
  await expect(page.getByRole('button', { name: 'Suono acceso' })).toBeVisible();
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

test.describe('telefono a 320 px: pannello', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('i tre tasti sono visibili su una riga e il tasto del suono funziona', async ({ page }) => {
    await page.goto('/chi-sono');
    // link già acceso: l'audio non è partito, il tasto si mostra spento
    const sound = page.getByRole('button', { name: 'Suono spento' });
    await expect(sound).toBeVisible();
    const boxes = [];
    for (const sel of ['.sound-button', '.phosphor-button', '.power-button']) {
      const box = await page.locator(sel).boundingBox();
      expect(box).not.toBeNull();
      boxes.push(box!);
    }
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(320);
      expect(Math.abs(b.y - boxes[0].y)).toBeLessThan(2);
    }
    expect(boxes[2].x).toBeGreaterThan(boxes[1].x); // l'interruttore è a destra
    // le spie sono visibili, dentro lo schermo e centrate sotto il proprio tasto
    const leds = ['.sound-led', '.phosphor-led', '.power-led'];
    for (let i = 0; i < 3; i++) {
      const led = await page.locator(leds[i]).boundingBox();
      expect(led).not.toBeNull();
      expect(led!.x).toBeGreaterThanOrEqual(0);
      expect(led!.x + led!.width).toBeLessThanOrEqual(320);
      expect(led!.y).toBeGreaterThanOrEqual(boxes[i].y + boxes[i].height);
      expect(Math.abs(led!.x + led!.width / 2 - (boxes[i].x + boxes[i].width / 2))).toBeLessThan(1.5);
    }
    await sound.click();
    await expect(page.getByRole('button', { name: 'Suono acceso' })).toBeVisible();
    const { sw, cw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(sw).toBeLessThanOrEqual(cw);
  });
});

test.describe('senza JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('i tasti del pannello sono disabilitati', async ({ page }) => {
    await page.goto('/chi-sono');
    await expect(page.locator('.sound-button')).toBeDisabled();
    await expect(page.locator('.phosphor-button')).toBeDisabled();
    await expect(page.locator('.power-button')).toBeDisabled();
  });

  test('il verde è lo stile predefinito', async ({ page }) => {
    await page.goto('/chi-sono');
    await expect(page.locator('html')).toHaveAttribute('data-fosfori', 'verde');
    const color = await page.locator('.term').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(51, 255, 102)');
  });
});

test.describe('movimento ridotto', () => {
  test.use({ reducedMotion: 'reduce' });

  test('niente sfarfallio, niente collasso e niente alone', async ({ page }) => {
    await page.goto('/chi-sono');
    const names = await page.evaluate(() => {
      const screen = document.querySelector('.screen')!;
      screen.classList.add('is-collapsing', 'is-warming');
      const beam = screen.querySelector('.screen-beam')!;
      return [
        getComputedStyle(screen, '::after').animationName,
        getComputedStyle(screen.querySelector('main')!).animationName,
        getComputedStyle(beam, '::before').animationName,
        getComputedStyle(beam, '::after').animationName,
        getComputedStyle(screen.querySelector('.screen-glow')!).animationName,
      ];
    });
    expect(names).toEqual(['none', 'none', 'none', 'none', 'none']);
  });
});

// Collasso e alone: le classi si mettono a mano, senza passare dall'interruttore.
// Riga e colore si leggono nello stesso passo: il client ridisegna le righe all'avvio.
const phosphorOf = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('textbox', { name: 'Comando' })).toBeVisible();
  return page.evaluate(() => getComputedStyle(document.querySelector('.term-line')!).color);
};

test('collasso: riga e punto del colore dei fosfori', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fosforo.fosfori', 'ambra'));
  await page.goto('/chi-sono');
  const phosphor = await phosphorOf(page);
  expect(phosphor).toBe('rgb(255, 176, 0)');
  await page.evaluate(() => document.querySelector('.screen')!.classList.add('is-collapsing'));
  const beam = page.locator('.screen-beam');
  expect(await beam.evaluate((el) => getComputedStyle(el).color)).toBe(phosphor);
  // la riga si accende a 190 ms, il punto a 390 ms
  await expect
    .poll(() => beam.evaluate((el) => Number(getComputedStyle(el, '::before').opacity)), { timeout: 1000, intervals: [20] })
    .toBeGreaterThan(0);
  await expect
    .poll(() => beam.evaluate((el) => Number(getComputedStyle(el, '::after').opacity)), { timeout: 1000, intervals: [20] })
    .toBeGreaterThan(0);
  expect(await beam.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

test('alone: ellittico e del colore dei fosfori', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fosforo.fosfori', 'bianco'));
  await page.goto('/chi-sono');
  const phosphor = await phosphorOf(page);
  expect(phosphor).toBe('rgb(232, 240, 255)');
  await page.evaluate(() => document.querySelector('.screen')!.classList.add('is-warming'));
  const glow = page.locator('.screen-glow');
  const style = await glow.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { radius: cs.borderTopLeftRadius, color: cs.color };
  });
  expect(style).toEqual({ radius: '50%', color: phosphor });
  await expect
    .poll(() => glow.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 1000, intervals: [20] })
    .toBeGreaterThan(0);
});

test('fuori dalle animazioni riga, punto e alone non si vedono', async ({ page }) => {
  for (const url of ['/', '/chi-sono']) {
    await page.goto(url);
    const opacities = await page.evaluate(() => {
      const beam = document.querySelector('.screen-beam')!;
      return [
        getComputedStyle(beam).opacity,
        getComputedStyle(beam, '::before').opacity,
        getComputedStyle(beam, '::after').opacity,
        getComputedStyle(document.querySelector('.screen-glow')!).opacity,
      ];
    });
    expect(opacities, url).toEqual(['0', '0', '0', '0']);
  }
});
