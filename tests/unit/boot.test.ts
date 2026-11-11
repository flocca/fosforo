import { describe, expect, it } from 'vitest';
import { decideStart, runBoot } from '../../src/client/boot';

describe('decideStart', () => {
  const today = '2026-11-11';
  it.each([
    ['home, giorno nuovo', { page: 'home', lastBoot: '2026-11-10', today, reducedMotion: false }, 'power-cold'],
    ['home, primo boot', { page: 'home', lastBoot: null, today, reducedMotion: false }, 'power-cold'],
    ['home, stesso giorno', { page: 'home', lastBoot: today, today, reducedMotion: false }, 'power-warm'],
    ['home, giorno nuovo, movimento ridotto', { page: 'home', lastBoot: null, today, reducedMotion: true }, 'power-warm'],
    ['elemento', { page: 'item', lastBoot: null, today, reducedMotion: false }, 'direct'],
    ['404', { page: '404', lastBoot: null, today, reducedMotion: false }, 'direct'],
  ] as const)('%s', (_name, input, expected) => {
    expect(decideStart(input)).toBe(expected);
  });
});

const ROM = [
  { text: 'ROM v1.3', pause: 300 },
  { text: 'MEMORY OK', pause: 700, disk: 1 },
  { text: 'CANZONE {canzone}', pause: 400, disk: 2 },
  { text: 'LOADING {data}', pause: 700, disk: 4 },
  { text: 'LOGO', pause: 1300 },
];

// sleep finto: ogni chiamata resta in sospeso finché il test non la fa avanzare.
function fakeClock() {
  const pending: { ms: number; resolve: () => void }[] = [];
  const calls: number[] = [];
  return {
    calls,
    pending,
    sleep(ms: number) {
      calls.push(ms);
      return new Promise<void>((resolve) => pending.push({ ms, resolve }));
    },
    async tick() {
      const p = pending.shift();
      p?.resolve();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

function setup(kind: 'cold' | 'warm', tokens: { canzone?: string; data?: string } = { data: '10/11/2026' }) {
  const clock = fakeClock();
  const printed: string[] = [];
  const seeks: number[] = [];
  const boot = runBoot({ kind, rom: ROM, tokens, print: (l) => printed.push(l), diskSeek: (n) => seeks.push(n), sleep: clock.sleep });
  return { clock, printed, seeks, boot };
}

describe('runBoot', () => {
  it('a freddo stampa le righe in ordine, sostituisce {data} e salta le righe con token mancanti', async () => {
    const { clock, printed, seeks, boot } = setup('cold');
    let done = false;
    boot.done.then(() => (done = true));
    for (let i = 0; i < 20 && !done; i++) await clock.tick();
    expect(done).toBe(true);
    expect(printed).toEqual(['ROM v1.3', 'MEMORY OK', 'LOADING 10/11/2026', 'LOGO']);
    expect(seeks).toEqual([1, 4]);
    // lampo, attesa, poi le pause delle righe stampate
    expect(clock.calls).toEqual([500, 900, 300, 700, 700, 1300]);
  });

  it('a freddo con {canzone} stampa anche quella riga', async () => {
    const { clock, printed, boot } = setup('cold', { canzone: 'Drew', data: '10/11/2026' });
    let done = false;
    boot.done.then(() => (done = true));
    for (let i = 0; i < 20 && !done; i++) await clock.tick();
    expect(printed).toContain('CANZONE Drew');
  });

  it('skip() a metà stampa il resto e risolve done senza altre attese', async () => {
    const { clock, printed, boot } = setup('cold');
    await clock.tick(); // lampo
    await clock.tick(); // attesa
    await clock.tick(); // dopo la prima riga
    expect(printed).toEqual(['ROM v1.3', 'MEMORY OK']);
    const callsBefore = clock.calls.length;
    boot.skip();
    await boot.done;
    expect(printed).toEqual(['ROM v1.3', 'MEMORY OK', 'LOADING 10/11/2026', 'LOGO']);
    // l'attesa in sospeso si conclude ma non ne parte un'altra
    await clock.tick();
    await clock.tick();
    expect(clock.calls.length).toBe(callsBefore);
    expect(printed).toHaveLength(4);
  });

  it('skip() due volte non fa danni', async () => {
    const { printed, boot } = setup('cold');
    boot.skip();
    boot.skip();
    await boot.done;
    expect(printed).toEqual(['ROM v1.3', 'MEMORY OK', 'LOADING 10/11/2026', 'LOGO']);
  });

  it('a caldo: lampo, solo la prima riga, circa 1 s in tutto', async () => {
    const { clock, printed, boot } = setup('warm');
    let done = false;
    boot.done.then(() => (done = true));
    for (let i = 0; i < 10 && !done; i++) await clock.tick();
    expect(done).toBe(true);
    expect(printed).toEqual(['ROM v1.3']);
    const total = clock.calls.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(800);
    expect(total).toBeLessThanOrEqual(1200);
  });
});
