// Aiuti condivisi dai test dell'accensione e dello spegnimento.
import type { Page } from '@playwright/test';

export const FIRST_ROM = 'FOSFORO VT-78  ROM v1.3';
export const SECOND_ROM = 'MEMORY TEST ....... 65536 BYTES OK';
export const WELCOME = 'Benvenuto. Scrivi help oppure clicca un nome.';
export const prompt = (page: Page) => page.getByRole('textbox', { name: 'Comando' });
export const powerButton = (page: Page, name: 'Accendi' | 'Spegni' = 'Accendi') => page.getByRole('button', { name });
export const output = (page: Page) => page.locator('#screen .term-out');
export const romLines = (page: Page, text: string) => output(page).locator('.term-line', { hasText: text });

// Il giorno del visitatore lo decide l'orologio della pagina.
export async function today(page: Page, lastBoot?: string) {
  await page.clock.install({ time: new Date('2026-11-11T10:00:00') });
  if (lastBoot) await page.addInitScript((d) => localStorage.setItem('fosforo.ultimoBoot', d), lastBoot);
}
