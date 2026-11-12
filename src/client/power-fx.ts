// Spegnimento e accensione del monitor: tempi condivisi fra boot, collasso e bagliore.

// Durata del collasso dell'immagine, dissolvenza del punto compresa.
export const COLLAPSE_MS = 1700;
// Dal clic sull'interruttore alla prima riga della ROM: il bagliore che cresce dal centro.
export const WARMUP_MS = 1200;
// Da SYSTEM HALTED all'inizio del collasso.
export const HALT_PAUSE_MS = 500;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Collasso dell'immagine in una riga, poi in un punto che svanisce. La classe resta: chi
// chiama, a spegnimento finito, mette is-off e la toglie. Con movimento ridotto niente
// collasso: is-off subito (con is-collapsing, che nasconde la scritta fino a quel momento).
export function collapse(screen: HTMLElement): Promise<void> {
  if (reducedMotion()) {
    screen.classList.add('is-off', 'is-collapsing');
    return Promise.resolve();
  }
  screen.classList.add('is-collapsing');
  return new Promise((resolve) => setTimeout(resolve, COLLAPSE_MS));
}

let warmTimer: ReturnType<typeof setTimeout> | undefined;

// Alone del tubo che si scalda, dal centro dello schermo. Riparte anche se era già in corso
// (reboot). Con movimento ridotto non fa niente.
export function warmUp(screen: HTMLElement): void {
  if (reducedMotion()) return;
  clearTimeout(warmTimer);
  screen.classList.remove('is-warming');
  void screen.offsetWidth; // riparte l'animazione
  screen.classList.add('is-warming');
  warmTimer = setTimeout(() => screen.classList.remove('is-warming'), WARMUP_MS);
}
