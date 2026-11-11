// Cronologia dei comandi, per le frecce su e giù.
export function createHistory() {
  const items: string[] = [];
  let index = 0; // items.length = oltre l'ultimo, sulla riga nuova

  return {
    push(l: string) {
      const v = l.trim();
      if (v && items[items.length - 1] !== v) items.push(v);
      index = items.length;
    },
    // null: niente da richiamare, la riga resta com'è
    up(): string | null {
      if (index === 0) return null;
      return items[--index];
    },
    down(): string | null {
      if (index >= items.length) return null;
      index++;
      return index === items.length ? '' : items[index];
    },
  };
}
