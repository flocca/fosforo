// Telefono: puntatore "coarse" e riga dei comandi rapidi.
export const isCoarsePointer = () => matchMedia('(pointer: coarse)').matches;

// Comandi rapidi: etichetta e comando eseguito (`scrivi` non esegue niente: apre la tastiera).
export const CHIPS: { label: string; cmd?: string }[] = [
  { label: 'ls', cmd: 'ls' },
  { label: 'cd ..', cmd: 'cd ..' },
  { label: 'help', cmd: 'help' },
  { label: 'suono', cmd: 'suono' },
  { label: 'scrivi' },
];

export type Chips = { show(on: boolean): void };

// `onCommand` riceve il comando di un chip; `onWrite` è il tocco su `scrivi`;
// `onTap` gira prima di tutto e, se restituisce true, il tocco è già stato consumato
// (durante il boot salta alla fine invece di eseguire il comando).
export function createChips(
  container: HTMLElement,
  opts: { onCommand(cmd: string): void; onWrite(): void; onTap(): boolean },
): Chips {
  for (const c of CHIPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.label;
    b.addEventListener('click', () => {
      if (opts.onTap()) return;
      if (c.cmd) opts.onCommand(c.cmd);
      else opts.onWrite();
    });
    container.append(b);
  }
  return {
    show(on) {
      const visible = on && isCoarsePointer();
      container.hidden = !visible;
      container.closest('.screen')?.classList.toggle('has-chips', visible);
    },
  };
}
