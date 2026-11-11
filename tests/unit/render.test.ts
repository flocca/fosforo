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
  posts: [{ slug: '2026-01-05-prova', body: readFileSync(new URL('../../example-content/post/2026-01-05-prova/index.md', import.meta.url), 'utf8').replace(/^---[\s\S]*?---\n/, ''), data: { title: 'Un post di prova', date: '2026-01-05', draft: false } }],
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
    for (const x of l.filter((r) => /^(lun|mar|mer|gio|ven|sab|dom|sett) \d\d\/\d\d /.test(r) || r.includes('░'))) expect(x.length).toBeLessThanOrEqual(40);
    expect(l.some((x) => x.includes('15 min'))).toBe(true);
  });
  it('lettura senza obiettivo né giorni', () => {
    const s = buildStoreFrom({ songs: [], books: [{ slug: 'a', data: { ...read('lettura/il-nome-della-rosa.json'), slug: 'a', days: [] } }], posts: [], pages: [], site: store.site });
    const l = lines(renderPath('lettura', s)!);
    expect(l).not.toContain('RITMO');
    expect(l.some((x) => x.startsWith('Libri finiti'))).toBe(false);
  });
  it('post', () => {
    const b = renderPath('post/2026-01-05-prova', store)!;
    expect(txt(b[0])).toBe('Un post di prova');
    expect((b[0] as any).spans[0].style).toBe('bold');
    expect(txt(b[1])).toBe('05/01/2026');
    const link = spans(b).find((s) => s.text === 'chi sono')!;
    expect(link.cmd).toBe('cat /chi-sono');
    expect(link.href).toBeUndefined();
    const img = b.find((x) => x.type === 'image') as any;
    expect(img.src).toMatch(/\/_img\/post\/2026-01-05-prova\/foto\.png$/);
    expect(img).toMatchObject({ alt: 'una foto', width: 640, height: 360 });
  });
  it('pagina', () => {
    const b = renderPath('chi-sono', store)!;
    expect(txt(b[0])).toBe('Chi sono');
    expect(lines(b)).toContain('testo');
  });
});

describe('markdownToBlocks', () => {
  const md = (s: string, sizes?: any) => markdownToBlocks(s, { imageBase: '/_img/post/x', sizes });
  it('dimensioni dalla mappa sizes', () => {
    const b = md('![a](dir/foto.jpg)', { foto: { width: 640, height: 480 } }) as any[];
    expect(b[0]).toMatchObject({ src: '/_img/post/x/foto.png', width: 640, height: 480 });
  });
  it('titoli, elenchi, citazioni, enfasi, codice', () => {
    const b = md('## Titolo qui\n\n- uno\n- due\n\n1. a\n2. b\n\n> citazione\n\n*e* **g** `c`');
    expect(lines(b)).toEqual(['TITOLO QUI', '', '  • uno', '  • due', '', '  1. a', '  2. b', '', '> citazione', '', 'e g c']);
    const last = spans(b.slice(-1));
    expect(last.map((s) => s.style)).toEqual(['bold', undefined, 'bold', undefined, 'inverse']);
    expect((b[8] as any).spans[0]).toMatchObject({ text: '> ', style: 'dim' });
  });
  it('link esterni con href', () => {
    const s = spans(md('[x](https://a.b/c) <https://d.e>'));
    expect(s[0]).toMatchObject({ text: 'x', href: 'https://a.b/c' });
    expect(s[2]).toMatchObject({ href: 'https://d.e' });
  });
});
