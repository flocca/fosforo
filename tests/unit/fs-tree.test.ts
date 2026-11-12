import { describe, expect, it } from 'vitest';
import { findByPath, listing, resolvePath } from '../../src/lib/fs-tree';
import { buildStoreFrom, type StoreInput } from '../../src/lib/store';
import type { Book, Song } from '../../src/lib/schema';

const song = (date: string): { slug: string; data: Song; body: string } => ({
  slug: date,
  body: 'testo',
  data: { date, title: `T ${date}`, artist: 'A', appleTrackId: '1', links: { appleMusic: 'https://music.apple.com/x' } },
});
const book = (slug: string, status: 'in-corso' | 'finito', when: string): { slug: string; data: Book } => ({
  slug,
  data: {
    id: 'a'.repeat(32), slug, title: slug, authors: ['X'], pages: 10, progress: status === 'finito' ? 1 : 0.5, status,
    startedAt: '2026-01-01T10:00:00+01:00', lastReadAt: when, totalSeconds: 1, days: [],
    ...(status === 'finito' ? { finishedAt: when } : {}),
  },
});
const site = {
  host: 'h', user: 'u',
  links: [{ name: 'owlcavelabs', title: 'Owl Cave Labs', url: 'https://owlcavelabs.it' }],
  boot: { rom: [], welcome: 'w', welcomeTouch: 'wt' },
};
const full = (): StoreInput => ({
  songs: [song('2026-11-08'), song('2026-11-10'), song('2026-11-09')],
  books: [
    book('termination-shock', 'finito', '2026-09-01T10:00:00+01:00'),
    book('il-nome-della-rosa', 'in-corso', '2026-11-01T10:00:00+01:00'),
  ],
  bookNotes: [{ slug: 'termination-shock', body: 'bello' }],
  posts: [
    { slug: '2026-01-05-prova', body: 'x', data: { title: 'Prova', date: '2026-01-05', draft: false } },
    { slug: '2026-02-01-bozza', body: 'x', data: { title: 'Bozza', date: '2026-02-01', draft: true } },
  ],
  pages: [{ slug: 'chi-sono', body: 'ciao', data: { title: 'Chi sono' } }],
  site,
});

describe('albero dei file', () => {
  const store = buildStoreFrom(full());
  const root = store.root;

  it('radice nell\'ordine atteso', () => {
    expect(root.children!.map((c) => c.name)).toEqual(
      ['canzone-del-giorno', 'canzoni', 'lettura', 'messaggi', 'chi-sono', 'owlcavelabs'],
    );
  });
  it('senza canzoni mancano alias e cartella; senza libri manca lettura', () => {
    const s = buildStoreFrom({ ...full(), songs: [], books: [] });
    const names = s.root.children!.map((c) => c.name);
    expect(names).not.toContain('canzone-del-giorno');
    expect(names).not.toContain('canzoni');
    expect(names).not.toContain('lettura');
  });
  it('alias verso la canzone più recente', () => {
    expect(findByPath(root, 'canzone-del-giorno')!.target).toBe('canzoni/2026-11-10');
  });
  it('ordina canzoni, libri e post', () => {
    expect(findByPath(root, 'canzoni')!.children!.map((c) => c.name)).toEqual(['2026-11-10', '2026-11-09', '2026-11-08']);
    expect(findByPath(root, 'lettura')!.children!.map((c) => c.name)).toEqual(['il-nome-della-rosa', 'termination-shock']);
  });
  it('resolvePath', () => {
    expect(resolvePath(root, 'canzoni', '..')).toBe(root);
    expect(resolvePath(root, '', 'canzoni/')!.path).toBe('canzoni');
    expect(resolvePath(root, 'messaggi', '/lettura')!.path).toBe('lettura');
    expect(resolvePath(root, 'canzoni', '~')).toBe(root);
    expect(resolvePath(root, '', 'nope')).toBeNull();
  });
  it('listing', () => {
    const l = listing(findByPath(root, 'canzoni')!);
    expect(l[0]).toMatchObject({ type: 'line' });
    expect((l[0] as any).spans[0].cmd).toBe('cat /canzoni/2026-11-10');
    const rootLines = listing(root) as any[];
    expect(rootLines.find((b) => b.spans[0].text === 'lettura/').spans[0].cmd).toBe('cd /lettura && ls');
    const link = rootLines.find((b) => b.spans[0].text === 'owlcavelabs').spans[0];
    expect(link.href).toBe('https://owlcavelabs.it');
    expect(link.cmd).toBeUndefined();
  });
  it('bozze assenti, note attaccate al libro', () => {
    expect(findByPath(root, 'messaggi')!.children!.map((c) => c.name)).toEqual(['2026-01-05-prova']);
    expect(findByPath(root, 'post')).toBeNull();
    expect(store.items.has('messaggi/2026-02-01-bozza')).toBe(false);
    const b = store.items.get('lettura/termination-shock')!;
    expect(b.kind === 'book' && b.note).toBe('bello');
  });
  it('sintassi Obsidian fa fallire la costruzione', () => {
    const bad = full();
    bad.pages[0].body = 'vedi [[altro]]';
    expect(() => buildStoreFrom(bad)).toThrow(/chi-sono\.md/);
  });
});
