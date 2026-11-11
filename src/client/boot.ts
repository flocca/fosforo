// Accensione: scelta fra boot completo e avvio rapido, e sequenza delle righe della ROM.
import type { SiteConfig } from '../lib/schema';

export type StartKind = 'power-cold' | 'power-warm' | 'direct';

// Il boot completo una volta al giorno (data locale del visitatore); con il movimento
// ridotto sempre l'avvio rapido. Le pagine degli elementi si aprono già accese.
export function decideStart(input: {
  page: 'home' | 'item' | '404';
  lastBoot: string | null;
  today: string;
  reducedMotion: boolean;
}): StartKind {
  if (input.page !== 'home') return 'direct';
  return input.lastBoot !== input.today && !input.reducedMotion ? 'power-cold' : 'power-warm';
}

type RomLine = SiteConfig['boot']['rom'][number];
type Tokens = { canzone?: string; data?: string };

const FLASH_MS = 500; // lampo di accensione (crt.css, .screen.is-powering)
const COLD_WAIT_MS = 900; // il tubo che si scalda
const WARM_TAIL_MS = 500; // a caldo: lampo + prima riga + questa attesa, circa 1 s

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
}): { done: Promise<void>; skip(): void } {
  const prepared: RomLine[] = [];
  for (const l of opts.rom) {
    const text = fill(l.text, opts.tokens);
    if (text !== null) prepared.push({ ...l, text });
  }
  const lines =
    opts.kind === 'cold' ? prepared : prepared.slice(0, 1).map((l) => ({ ...l, pause: WARM_TAIL_MS }));

  let next = 0;
  let finished = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  // Stampa subito tutto ciò che manca; chiamarla di nuovo non fa nulla.
  const finish = () => {
    if (finished) return;
    finished = true;
    while (next < lines.length) opts.print(lines[next++].text);
    resolveDone();
  };

  (async () => {
    await opts.sleep(FLASH_MS);
    if (finished) return;
    if (opts.kind === 'cold') {
      await opts.sleep(COLD_WAIT_MS);
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

  return { done, skip: finish };
}
