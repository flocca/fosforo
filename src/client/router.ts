// Indirizzi: cartella o elemento nella barra degli indirizzi, avanti e indietro del browser.
export const urlFor = (path: string) => '/' + path;

// `/canzoni/2026-11-10` -> `canzoni/2026-11-10`; la radice -> ''.
export function currentPath(): string {
  let p = location.pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    // percorso con codifica non valida: lo si usa così com'è
  }
  return p.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
}

export type Router = {
  navigate(path: string, mode: 'push' | 'none'): void;
  // Durante `replay` (avvio da un link, avanti e indietro) l'indirizzo si sostituisce, non si aggiunge.
  replay(fn: () => Promise<void>): Promise<void>;
};

export function createRouter(opts: { title(path: string): string; onPop(path: string): void }): Router {
  let replaying = false;

  addEventListener('popstate', (e) => {
    const state = e.state as { path?: unknown } | null;
    opts.onPop(typeof state?.path === 'string' ? state.path : currentPath());
  });

  return {
    navigate(path, mode) {
      document.title = opts.title(path);
      if (mode === 'none') return;
      const url = urlFor(path);
      if (replaying || location.pathname === url) history.replaceState({ path }, '', url);
      else history.pushState({ path }, '', url);
    },
    async replay(fn) {
      replaying = true;
      try {
        await fn();
      } finally {
        replaying = false;
      }
    },
  };
}
