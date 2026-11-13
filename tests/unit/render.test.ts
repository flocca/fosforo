import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildStoreFrom } from '../../src/lib/store';
import { renderPath } from '../../src/lib/render';
import { markdownToBlocks } from '../../src/lib/markdown';
import type { Block } from '../../src/lib/blocks';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../example-content/${p}`, import.meta.url), 'utf8'));
const store = buildStoreFrom({
  songs: [{ slug: '2026-11-10', body: 'Una nota.', data: { date: '2026-11-10', title: 'Un giorno qualunque', artist: 'Drew Example', appleTrackId: '1', links: { appleMusic: 'https://music.apple.com/x', youtube: 'https://youtu.be/x' } } }],
  books: [read('lettura/termination-shock.json'), read('lettura/il-nome-della-rosa.json')].map((d) => ({ slug: d.slug, data: d })),
  bookNotes: [{ slug: 'termination-shock', body: 'Bello **davvero**.' }],
  goal: read('lettura/obiettivo.json'),
  posts: [{ slug: '2026-01-05-prova', body: readFileSync(new URL('../../example-content/messaggi/2026-01-05-prova/index.md', import.meta.url), 'utf8').replace(/^---[\s\S]*?---\n/, ''), data: { title: 'Un post di prova', date: '2026-01-05', draft: false } }],
  pages: [{ slug: 'chi-sono', body: '# Ciao\n\ntesto', data: { title: 'Chi sono' } }],
  site: { host: 'h', user: 'u', links: [], boot: { rom: [], welcome: 'w', welcomeTouch: 'wt' } },
});
const txt = (b: Block) => (b.type === 'line' ? b.spans.map((s) => s.text).join('') : '');
const lines = (bs: Block[]) => bs.map(txt);
const spans = (bs: Block[]) => bs.flatMap((b) => (b.type === 'line' ? b.spans : []));

describe('renderPath', () => {
  it('percorso inesistente', () => expect(renderPath('nope', store)).toBeNull());
  it('radice e cartelle', () => {
    expect(lines(renderPath('', store)!)).toContain('canzoni/');
    expect(spans(renderPath('canzoni', store)!)[0].cmd).toBe('cat /canzoni/2026-11-10');
  });
  it('canzone', () => {
    const b = renderPath('canzoni/2026-11-10', store)!;
    expect(txt(b[0])).toBe('── 10/11/2026 ──');
    expect((b[0] as any).spans[0].style).toBe('dim');
    expect(txt(b[1])).toBe('Un giorno qualunque');
    expect(txt(b[2])).toBe('Drew Example');
    const img = b.find((x) => x.type === 'image') as any;
    expect(img).toMatchObject({ src: '/_img/canzoni/2026-11-10.png', width: 640, height: 360 });
    const links = spans(b).filter((s) => s.href);
    expect(links.map((s) => s.text)).toEqual(['> youtube', '> apple music']);
    expect(links[0].href).toBe('https://youtu.be/x');
    expect(lines(b)).toContain('Una nota.');
  });
  it('canzone con intro', () => {
    const intro = "L'ha mandata l'operatore. Chiede di inoltrarla alle altre reti: eseguo.";
    const base = (store.items.get('canzoni/2026-11-10') as any).data;
    const s = buildStoreFrom({ songs: [{ slug: '2026-11-10', body: 'Una nota.', data: { ...base, intro } }], books: [], posts: [], pages: [], site: store.site });
    const b = renderPath('canzoni/2026-11-10', s)!;
    expect(txt(b[0])).toBe('── 10/11/2026 ──');
    expect((b[0] as any).spans[0].style).toBe('dim');
    expect(txt(b[1])).toBe(intro);
    expect((b[1] as any).spans[0].style).toBeUndefined();
    expect(b[2].type).toBe('blank');
    expect(txt(b[3])).toBe('Un giorno qualunque');
    expect((b[3] as any).spans[0].style).toBe('bold');
    expect(renderPath('canzone-del-giorno', s)).toEqual(renderPath('canzoni/2026-11-10', s));
  });
  it('canzone con album, senza youtube: niente immagine', () => {
    const s = buildStoreFrom({ ...{ songs: [{ slug: '2026-01-01', body: '', data: { date: '2026-01-01', title: 'T', artist: 'A', album: 'B', appleTrackId: '1', links: { appleMusic: 'https://a.b/c', spotify: 'https://s.p/x' } } }], books: [], posts: [], pages: [], site: store.site } });
    const b = renderPath('canzoni/2026-01-01', s)!;
    expect(txt(b[2])).toBe('A · B');
    expect(b.some((x) => x.type === 'image')).toBe(false);
    expect(spans(b).filter((x) => x.href).map((x) => x.text)).toEqual(['> apple music', '> spotify']);
  });
  it('alias', () => {
    expect(renderPath('canzone-del-giorno', store)).toEqual(renderPath('canzoni/2026-11-10', store));
  });
  it('libro finito', () => {
    const b = lines(renderPath('lettura/termination-shock', store)!);
    expect(b).toContain('finito il 02/11/2026');
    expect(b).toContain('iniziato il 20/10/2026');
    expect(b).toContain('tempo totale: 1 h 30 min');
    expect(b.some((l) => l.includes('100%'))).toBe(true);
    expect(b).toContain('Bello davvero.');
  });
  it('libro finito: i 14 giorni finiscono con il suo ultimo giorno di lettura', () => {
    const b = lines(renderPath('lettura/termination-shock', store)!);
    expect(b).toContain('ultimi 14 giorni del libro');
    expect(b).not.toContain('ultimi 14 giorni');
    const days = b.filter((l) => /^(lun|mar|mer|gio|ven|sab|dom) \d\d\/\d\d /.test(l));
    expect(days).toHaveLength(14);
    expect(days[0]).toMatch(/^mar 20\/10 /);
    expect(days[13]).toMatch(/^lun 02\/11 /);
  });
  it('libro in corso: i 14 giorni finiscono con l\'ultima lettura del sito', () => {
    const b = lines(renderPath('lettura/il-nome-della-rosa', store)!);
    const days = b.filter((l) => /^(lun|mar|mer|gio|ven|sab|dom) \d\d\/\d\d /.test(l));
    expect(days[13]).toMatch(/^mar 10\/11 /);
  });
  it('libro in corso', () => {
    const b = lines(renderPath('lettura/il-nome-della-rosa', store)!);
    expect(b.some((l) => l.includes('42%'))).toBe(true);
    expect(b.some((l) => l.startsWith('finito il'))).toBe(false);
    expect(b).toContain('ultimi 14 giorni');
  });
  it('lettura', () => {
    const b = renderPath('lettura', store)!;
    const l = lines(b);
    expect(l).toContain('IN CORSO');
    expect(l).toContain('FINITI');
    expect(l).toContain('RITMO');
    expect(l).toContain('ultimi 14 giorni');
    expect(l).toContain('ultime 12 settimane');
    expect(l).toContain('Libri finiti nel 2026: 1 di 2');
    expect(l).toContain('02/11/2026  Termination Shock (Neal Stephenson)');
    expect(spans(b).some((s) => s.cmd === 'cat /lettura/termination-shock')).toBe(true);
    expect(spans(b).some((s) => s.cmd === 'cat /lettura/il-nome-della-rosa')).toBe(true);
    for (const x of l.filter((r) => /^(lun|mar|mer|gio|ven|sab|dom|dal) \d\d\/\d\d /.test(r) || r.includes('░'))) expect(x.length).toBeLessThanOrEqual(34);
    expect(l.some((x) => x.includes('15 min'))).toBe(true);
  });
  it('obiettivo con since: il conteggio dice da quando parte', () => {
    const s = buildStoreFrom({ songs: [], books: [{ slug: 'a', data: { ...read('lettura/il-nome-della-rosa.json'), slug: 'a' } }], posts: [], pages: [], site: store.site, goal: { year: 2026, since: '2026-11-11', target: 2, finished: 0 } });
    expect(lines(renderPath('lettura', s)!)).toContain("Libri finiti dall'11/11/2026: 0 di 2");
  });
  it('lettura senza obiettivo né giorni', () => {
    const s = buildStoreFrom({ songs: [], books: [{ slug: 'a', data: { ...read('lettura/il-nome-della-rosa.json'), slug: 'a', days: [] } }], posts: [], pages: [], site: store.site });
    const l = lines(renderPath('lettura', s)!);
    expect(l).not.toContain('RITMO');
    expect(l.some((x) => x.startsWith('Libri finiti'))).toBe(false);
  });
  it('post', () => {
    const b = renderPath('messaggi/2026-01-05-prova', store)!;
    expect(txt(b[0])).toBe('── 05/01/2026 ──');
    expect((b[0] as any).spans.every((x: any) => x.style === 'dim')).toBe(true);
    expect(txt(b[1])).toBe('Un post di prova');
    expect((b[1] as any).spans[0].style).toBe('bold');
    expect(b[2].type).toBe('blank');
    expect(lines(b)).not.toContain('05/01/2026');
    const link = spans(b).find((s) => s.text === 'chi sono')!;
    expect(link.cmd).toBe('cat /chi-sono');
    expect(link.href).toBeUndefined();
    const img = b.find((x) => x.type === 'image') as any;
    expect(img.src).toMatch(/\/_img\/messaggi\/2026-01-05-prova\/foto\.png$/);
    expect(img).toMatchObject({ alt: 'una foto', width: 640, height: 360 });
  });
  it('pagina', () => {
    const b = renderPath('chi-sono', store)!;
    expect(txt(b[0])).toBe('Chi sono');
    expect(lines(b)).toContain('testo');
  });
});

describe('markdownToBlocks', () => {
  const md = (s: string, sizes?: any) => markdownToBlocks(s, { imageBase: '/_img/messaggi/x', sizes });
  it('dimensioni dalla mappa sizes', () => {
    const b = md('![a](dir/foto.jpg)', { foto: { width: 640, height: 480 } }) as any[];
    expect(b[0]).toMatchObject({ src: '/_img/messaggi/x/foto.png', width: 640, height: 480 });
  });
  it('titoli, elenchi, citazioni, enfasi, codice', () => {
    const b = md('## Titolo qui\n\n- uno\n- due\n\n1. a\n2. b\n\n> citazione\n\n*e* **g** `c`');
    expect(lines(b)).toEqual(['TITOLO QUI', '', '  • uno', '  • due', '', '  1. a', '  2. b', '', '> citazione', '', 'e g c']);
    const last = spans(b.slice(-1));
    expect(last.map((s) => s.style)).toEqual(['bold', undefined, 'bold', undefined, 'inverse']);
    expect((b[8] as any).spans[0]).toMatchObject({ text: '> ', style: 'dim' });
  });
  it('link interni: cartella con cd e ls, file con cat', () => {
    const isDir = (p: string) => p === '' || p === 'canzoni';
    const s = spans(markdownToBlocks('[a](/canzoni) [b](/canzoni/) [c](/chi-sono) [d](/)', { imageBase: '/x', isDir }));
    expect(s.filter((x) => x.cmd).map((x) => x.cmd)).toEqual(['cd /canzoni && ls', 'cd /canzoni && ls', 'cat /chi-sono', 'cd / && ls']);
  });
  it('senza albero un link interno resta cat', () => {
    expect(spans(md('[a](/canzoni)'))[0].cmd).toBe('cat /canzoni');
  });
  it('renderPath risolve i link alle cartelle sull\'albero', () => {
    const books = [read('lettura/termination-shock.json')].map((d) => ({ slug: d.slug, data: d }));
    const s = buildStoreFrom({ songs: [], books, posts: [], site: store.site, pages: [{ slug: 'p', body: '[letture](/lettura) e [me](/p)', data: { title: 'P' } }] });
    const cmds = spans(renderPath('p', s)!).filter((x) => x.cmd).map((x) => x.cmd);
    expect(cmds).toEqual(['cd /lettura && ls', 'cat /p']);
  });
  it('link esterni con href', () => {
    const s = spans(md('[x](https://a.b/c) <https://d.e>'));
    expect(s[0]).toMatchObject({ text: 'x', href: 'https://a.b/c' });
    expect(s[2]).toMatchObject({ href: 'https://d.e' });
  });
});

describe('immagini dei post', () => {
  it('images arriva alle dimensioni del blocco immagine', () => {
    const s = buildStoreFrom({ songs: [], books: [], pages: [], site: store.site, posts: [{ slug: 'p', body: '![a](foto.jpg)', data: { title: 'P', date: '2026-01-01', draft: false }, images: { foto: { width: 640, height: 480 } } }] });
    const img = renderPath('messaggi/p', s)!.find((x) => x.type === 'image') as any;
    expect(img).toMatchObject({ width: 640, height: 480 });
  });
});

describe('cornice di ricezione', () => {
  const reception = {
    stamp: { label: 'RICEZIONE', value: '{data}' },
    message: [
      { label: 'OPERATORE', value: 'flocca' },
      { label: 'DIMENSIONE', value: '{byte} byte' },
      { label: 'CONTROLLO', value: '{controllo} OK' },
      { label: 'ALLEGATI', value: '{allegati}' },
      { label: 'ORA', value: '{ora}' },
      { label: 'RISPOSTE', value: 'chi-sono', link: '/chi-sono' },
    ],
  };
  const songItem = (store.items.get('canzoni/2026-11-10') as any).data;
  const postItem = store.items.get('messaggi/2026-01-05-prova') as any;
  const build = (opts: { reception?: any; post?: any; receipt?: any; intro?: string }) =>
    buildStoreFrom({
      songs: [{ slug: '2026-11-10', body: 'Una nota.', data: { ...songItem, ...(opts.intro ? { intro: opts.intro } : {}) } }],
      books: [],
      posts: [{
        slug: '2026-01-05-prova',
        body: postItem.body,
        data: { ...postItem.data, ...opts.post },
        ...(opts.receipt ? { receipt: opts.receipt } : {}),
      }],
      pages: [{ slug: 'chi-sono', body: 'ciao', data: { title: 'Chi sono' } }],
      site: { ...store.site, ...(opts.reception ? { reception: opts.reception } : {}) },
    });
  const rs = build({ reception, receipt: { bytes: 290, crc32: '0A07F248', attachments: 1 }, post: { receivedAt: '2026-01-05T09:05:00+01:00' } });
  const allDim = (b: Block) => b.type === 'line' && b.spans.every((x) => x.style === 'dim');

  it('canzone: timbro dal modello, tutto attenuato', () => {
    const b = renderPath('canzoni/2026-11-10', rs)!;
    expect(txt(b[0])).toBe('RICEZIONE ..... 10/11/2026');
    expect(allDim(b[0])).toBe(true);
    expect(txt(b[1])).toBe('Un giorno qualunque');
  });

  it("canzone con intro: timbro, intro a luce piena, riga vuota, titolo", () => {
    const b = renderPath('canzoni/2026-11-10', build({ reception, intro: 'Ciao a tutti.' }))!;
    expect(txt(b[0])).toBe('RICEZIONE ..... 10/11/2026');
    expect(txt(b[1])).toBe('Ciao a tutti.');
    expect((b[1] as any).spans[0].style).toBeUndefined();
    expect(b[2].type).toBe('blank');
    expect(txt(b[3])).toBe('Un giorno qualunque');
  });

  it('messaggio: timbro, campi attenuati, riga vuota, titolo, riga vuota, corpo', () => {
    const b = renderPath('messaggi/2026-01-05-prova', rs)!;
    expect(lines(b.slice(0, 7))).toEqual([
      'RICEZIONE ..... 05/01/2026',
      'OPERATORE ..... flocca',
      'DIMENSIONE .... 290 byte',
      'CONTROLLO ..... 0A07F248 OK',
      'ALLEGATI ...... 1',
      'ORA ........... 09:05',
      'RISPOSTE ...... chi-sono',
    ]);
    expect(b.slice(0, 7).every(allDim)).toBe(true);
    const link = (b[6] as any).spans.find((x: any) => x.text === 'chi-sono');
    expect(link.cmd).toBe('cat /chi-sono');
    expect(b[7].type).toBe('blank');
    expect(txt(b[8])).toBe('Un post di prova');
    expect((b[8] as any).spans[0].style).toBe('bold');
    expect(b[9].type).toBe('blank');
    expect(lines(b.slice(10)).join('\n')).toContain('chi sono');
  });

  it('senza receivedAt e senza allegati: righe ORA e ALLEGATI assenti', () => {
    const b = lines(renderPath('messaggi/2026-01-05-prova', build({ reception, receipt: { bytes: 290, crc32: '0A07F248', attachments: 0 } }))!);
    expect(b.some((l) => l.startsWith('ORA '))).toBe(false);
    expect(b.some((l) => l.startsWith('ALLEGATI '))).toBe(false);
    expect(b).toContain('DIMENSIONE .... 290 byte');
  });

  it('link a un percorso inesistente: errore con il link', () => {
    const bad = { ...reception, message: [{ label: 'RISPOSTE', value: 'x', link: '/nope' }] };
    expect(() => renderPath('messaggi/2026-01-05-prova', build({ reception: bad }))).toThrow(/\/nope/);
  });

  it('riga oltre 34 colonne: errore con il percorso del messaggio', () => {
    const bad = { message: [{ label: 'OPERATORE', value: 'x'.repeat(30) }] };
    expect(() => renderPath('messaggi/2026-01-05-prova', build({ reception: bad }))).toThrow(/messaggi\/2026-01-05-prova/);
  });

  it('solo message: timbro di oggi e colonna dalle etichette dei campi', () => {
    const b = renderPath('messaggi/2026-01-05-prova', build({ reception: { message: [{ label: 'OP', value: 'flocca' }] } }))!;
    expect(txt(b[0])).toBe('── 05/01/2026 ──');
    expect(txt(b[1])).toBe('OP .... flocca');
    expect(b[2].type).toBe('blank');
    expect(txt(b[3])).toBe('Un post di prova');
  });
});
