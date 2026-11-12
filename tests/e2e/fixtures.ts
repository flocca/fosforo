// Il test di Playwright con un'opzione in più: di default il visitatore ha già acceso il monitor oggi.
import { expect, test as base } from '@playwright/test';

export const test = base.extend<{ poweredToday: boolean }>({
  poweredToday: [true, { option: true }],
  page: async ({ page, poweredToday }, use) => {
    if (poweredToday) {
      // Il giorno è quello locale della pagina, come lo calcola il motore.
      await page.addInitScript(() => {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        localStorage.setItem('fosforo.ultimaAccensione', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      });
    }
    await use(page);
  },
});

export { expect };
