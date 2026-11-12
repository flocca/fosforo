// Accensione: scelta fra boot completo e avvio rapido, e sequenza delle righe della ROM.
import type { Span } from '../lib/blocks';
import type { SiteConfig } from '../lib/schema';

export type StartKind = 'power-cold' | 'power-warm' | 'power-link' | 'direct';

// Home: il boot completo una volta al giorno (data locale del visitatore); con il movimento
// ridotto sempre l'avvio rapido. Pagine degli elementi: monitor spento la prima volta nel giorno
// in cui il visitatore lo accende (anche con il movimento ridotto), poi già acceso. 404 sempre acceso.
export function decideStart(input: {
  page: 'home' | 'item' | '404';
  lastBoot: string | null;
  lastPowerOn: string | null;
  today: string;
  reducedMotion: boolean;
}): StartKind {
  if (input.page === '404') return 'direct';
  if (input.page === 'item') return input.lastPowerOn === input.today ? 'direct' : 'power-link';
  return input.lastBoot !== input.today && !input.reducedMotion ? 'power-cold' : 'power-warm';
}

type RomLine = SiteConfig['boot']['rom'][number];
type Tokens = { canzone?: string; data?: string };

const WARM_TAIL_MS = 300; // a caldo: dopo la prima riga, prima del benvenuto (circa 1,5 s in tutto)

// Sostituisce {canzone} e {data}; null se manca un valore (la riga si salta).
function fill(text: string, tokens: Tokens): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = Object.hasOwn(tokens, name) ? tokens[name as keyof Tokens] : undefined;
    if (v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

export function runBoot(opts: {
  kind: 'cold' | 'warm';
  rom: RomLine[];
  tokens: Tokens;
  print(line: string): void;
  diskSeek(n: number): void;
  sleep(ms: number): Promise<void>;
  warmupMs: number; // dal via alla prima riga, per entrambi i tipi di avvio
}): { done: Promise<boolean>; skip(): void; cancel(): void } {
  const prepared: RomLine[] = [];
  for (const l of opts.rom) {
    const text = fill(l.text, opts.tokens);
    if (text !== null) prepared.push({ ...l, text });
  }
  const lines =
    opts.kind === 'cold' ? prepared : prepared.slice(0, 1).map((l) => ({ ...l, pause: WARM_TAIL_MS }));

  let next = 0;
  let finished = false;
  let resolveDone!: (completed: boolean) => void;
  const done = new Promise<boolean>((r) => (resolveDone = r));

  // Stampa subito tutto ciò che manca; chiamarla di nuovo non fa nulla.
  const finish = () => {
    if (finished) return;
    finished = true;
    while (next < lines.length) opts.print(lines[next++].text);
    resolveDone(true);
  };

  // Ferma il boot senza stampare altro; dopo finish o cancel non fa nulla.
  const cancel = () => {
    if (finished) return;
    finished = true;
    resolveDone(false);
  };

  (async () => {
    if (opts.warmupMs > 0) {
      await opts.sleep(opts.warmupMs);
      if (finished) return;
    }
    while (next < lines.length) {
      const l = lines[next++];
      if (l.disk) opts.diskSeek(l.disk);
      opts.print(l.text);
      await opts.sleep(l.pause);
      if (finished) return;
    }
    finish();
  })().catch((e) => {
    console.error('boot interrotto', e);
    finish();
  });

  return { done, skip: finish, cancel };
}

// La parola "help" del benvenuto si può cliccare; senza "help" il testo resta semplice.
export function welcomeSpans(text: string): Span[] {
  const m = /\bhelp\b/.exec(text);
  if (!m) return [{ text }];
  const spans: Span[] = [];
  if (m.index) spans.push({ text: text.slice(0, m.index) });
  spans.push({ text: 'help', cmd: 'help' });
  const rest = text.slice(m.index + 4);
  if (rest) spans.push({ text: rest });
  return spans;
}
