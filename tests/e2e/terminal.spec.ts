// Terminale vivo (livello 1): comandi, link cliccabili, indirizzi, completamento, cronologia.
import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

const NEWEST = '2026-11-10';
const prompt = (page: Page) => page.getByRole('textbox', { name: 'Comando' });
const output = (page: Page) => page.locator('#screen .term-out');
const lastLine = (page: Page) => page.locator('#screen .term-out .term-line').last();

async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(prompt(page)).toBeFocused();
}

test('dal link profondo: ls, clic su una cartella e su una canzone, avanti e indietro', async ({ page }) => {
  await ready(page, '/chi-sono');
  await expect(output(page)).toContainText('$ cat /chi-sono');
  await page.keyboard.type('ls');
  await page.keyboard.press('Enter');
  const dir = page.locator('#screen a[data-cmd]', { hasText: /^canzoni\/$/ }).last();
  await expect(dir).toBeVisible();

  await dir.click();
  await expect(page).toHaveURL(/\/canzoni$/);
  await expect(page).toHaveTitle('canzoni · example.com');
  await expect(output(page)).toContainText('$ cd /canzoni && ls');
  await expect(lastLine(page)).toContainText('2026-11-08');
  await expect(page.locator('#screen .term-prompt')).toContainText('~/canzoni $');

  await page.locator(`#screen a[data-cmd="cat /canzoni/${NEWEST}"]`).last().click();
  await expect(page).toHaveURL(new RegExp(`/canzoni/${NEWEST}$`));
  await expect(page).toHaveTitle('Un giorno qualunque · example.com');
  await expect(output(page)).toContainText('Un giorno qualunque');
  await expect(page.locator('#screen a[href^="https://music.apple.com/"]').last()).toBeVisible();

  // Review Focus 5: indietro e avanti mostrano l'elemento dell'indirizzo attuale
  await page.goBack();
  await expect(page).toHaveURL(/\/canzoni$/);
  await expect(lastLine(page)).toContainText('2026-11-08');
  await expect(page.locator('#screen a[href^="https://music.apple.com/"]')).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/canzoni/${NEWEST}$`));
  await expect(page.locator('#screen a[href^="https://music.apple.com/"]').last()).toBeVisible();

  // fino al link profondo iniziale
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/chi-sono$/);
  await expect(output(page)).toContainText('$ cat /chi-sono');
  await expect(output(page)).toContainText('Sono una persona di esempio.');
});

test('il clic con ctrl/cmd lascia il link nativo', async ({ page }) => {
  await ready(page, '/canzoni');
  const link = page.locator(`#screen a[data-cmd="cat /canzoni/${NEWEST}"]`).last();
  await expect(link).toHaveAttribute('href', `/canzoni/${NEWEST}`);
  const popup = page.context().waitForEvent('page');
  await link.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await (await popup).close();
  await expect(page).toHaveURL(/\/canzoni$/);
});

test('completamento con Tab', async ({ page }) => {
  await ready(page, '/chi-sono');
  await page.keyboard.type('cat chi');
  await page.keyboard.press('Tab');
  await expect(prompt(page)).toHaveValue('cat chi-sono');
});

test('freccia su richiama il comando precedente', async ({ page }) => {
  await ready(page, '/chi-sono');
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');
  await expect(lastLine(page)).toHaveText('/\n');
  await page.keyboard.press('ArrowUp');
  await expect(prompt(page)).toHaveValue('pwd');
});

test('help e comando sconosciuto, con help cliccabile', async ({ page }) => {
  await ready(page, '/chi-sono');
  await page.keyboard.type('foo');
  await page.keyboard.press('Enter');
  await expect(lastLine(page)).toContainText('foo: comando non trovato. Prova help.');
  await lastLine(page).locator('a[data-cmd="help"]').click();
  await expect(lastLine(page)).toContainText('questo elenco');
});

test('fosfori cambia colore', async ({ page }) => {
  await ready(page, '/chi-sono');
  await page.keyboard.type('fosfori ambra');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-fosfori', 'ambra');
  await expect(lastLine(page)).toContainText('Fosfori: ambra.');
});

test('canzone-del-giorno porta alla canzone più recente', async ({ page }) => {
  await ready(page, '/canzone-del-giorno');
  await expect(page).toHaveURL(new RegExp(`/canzoni/${NEWEST}$`));
  await expect(page.locator('#screen .term-prompt')).toContainText('~/canzoni $');
});

test('404: resta il messaggio, il link riporta nel terminale e compare il prompt', async ({ page }) => {
  await ready(page, '/lettura/libro-che-non-esiste');
  await expect(output(page)).toContainText('cat: /lettura/libro-che-non-esiste: file o cartella inesistente');
  await page.locator('#back').click();
  await expect(page).toHaveURL(/\/lettura$/);
  await expect(output(page)).toContainText('$ cd /lettura && ls');
});

test('indietro su un indirizzo inesistente sotto /lettura riporta a lettura/', async ({ page }) => {
  await ready(page, '/lettura/libro-che-non-esiste');
  await page.locator('#back').click();
  await expect(page).toHaveURL(/\/lettura$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/lettura\/libro-che-non-esiste$/);
  const back = page.locator('#screen .term-out a[data-cmd]').last();
  await expect(back).toHaveText('ls /lettura');
  await expect(back).toHaveAttribute('data-cmd', 'cd /lettura && ls');
});

test('un link markdown a una cartella apre la cartella', async ({ page }) => {
  await ready(page, '/lettura/termination-shock');
  const link = page.locator('#screen .term-out a', { hasText: /^lettura$/ });
  await expect(link).toHaveAttribute('data-cmd', 'cd /lettura && ls');
  await link.click();
  await expect(page).toHaveURL(/\/lettura$/);
  await expect(output(page)).toContainText('$ cd /lettura && ls');
  await expect(output(page)).not.toContainText('è una cartella');
  await expect(page.locator('#screen .term-prompt')).toContainText('~/lettura $');
});

test('indice vecchio in cache: il link profondo a una canzone nuova la mostra', async ({ page }) => {
  let calls = 0;
  await page.route('**/_fs/index.json', async (route) => {
    calls++;
    const res = await route.fetch();
    const json = await res.json();
    if (calls === 1) {
      // l'indice di ieri: senza la canzone più recente
      const canzoni = json.root.children.find((c: { name: string }) => c.name === 'canzoni');
      canzoni.children = canzoni.children.filter((c: { name: string }) => c.name !== NEWEST);
    }
    await route.fulfill({ response: res, json });
  });
  await ready(page, `/canzoni/${NEWEST}`);
  await expect(output(page)).toContainText(`$ cat /canzoni/${NEWEST}`);
  await expect(output(page)).toContainText('Un giorno qualunque');
  await expect(output(page)).not.toContainText('inesistente');
  expect(calls).toBe(2);
});

test('link profondo senza gemello JSON: resta il livello 0 e compare il prompt', async ({ page }) => {
  await page.route('**/_fs/chi-sono.json', (route) => route.abort());
  await ready(page, '/chi-sono');
  await expect(output(page)).toContainText('$ cat /chi-sono');
  await expect(output(page)).toContainText('Sono una persona di esempio.');
  await expect(output(page)).not.toContainText('impossibile leggere');
  await expect(page.locator('#screen .term-prompt')).toBeVisible();
});

test('axe: nessuna violazione grave in /chi-sono', async ({ page }) => {
  await ready(page, '/chi-sono');
  // @axe-core/playwright porta un suo playwright-core (1.65) con tipi diversi da quelli fissati (1.64.1)
  type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];
  const { violations } = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('mentre un comando lavora si va solo a capo: il prompt torna con il risultato', async ({ page }) => {
  await ready(page, '/canzoni');
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/_fs/chi-sono.json', async (route) => {
    await held;
    await route.continue();
  });
  const label = page.locator('#screen .term-prompt > .dim');
  await expect(label).toBeVisible();
  await page.keyboard.type('cat /chi-sono');
  await page.keyboard.press('Enter');
  await expect(output(page)).toContainText('$ cat /chi-sono');
  await expect(label).toBeHidden();
  // la riga resta, con il campo ancora a fuoco: si può scrivere il comando dopo
  await expect(prompt(page)).toBeFocused();
  release();
  await expect(output(page)).toContainText('Sono una persona di esempio.');
  await expect(label).toBeVisible();
});
