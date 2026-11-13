import { describe, expect, it } from 'vitest';
import { findByPath, listing, resolvePath } from '../../src/lib/fs-tree';
import { buildStoreFrom, findNode, type StoreInput } from '../../src/lib/store';
import { allNodes } from '../../src/lib/static-paths';
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
  folderFiles: [
    { file: 'canzoni/leggimi.md', raw: '---\ntitle: Nota\n---\nCiao.' },
    { file: 'messaggi/leggimi.md', raw: '---\ntitle: Nota sui messaggi\n---\nCiao.' },
  ],
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
    const s = buildStoreFrom({ ...full(), songs: [], books: [], folderFiles: [] });
    const names = s.root.children!.map((c) => c.name);
    expect(names).not.toContain('canzone-del-giorno');
    expect(names).not.toContain('canzoni');
    expect(names).not.toContain('lettura');
  });
  it('alias verso la canzone più recente', () => {
    expect(findByPath(root, 'canzone-del-giorno')!.target).toBe('canzoni/2026-11-10');
  });
  it('ordina canzoni, libri e post', () => {
    expect(findByPath(root, 'canzoni')!.children!.map((c) => c.name)).toEqual(['leggimi', '2026-11-10', '2026-11-09', '2026-11-08']);
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
    expect(l[0]).toEqual({
      type: 'line',
      spans: [{ text: 'leggimi', cmd: 'cat /canzoni/leggimi' }, { text: '  Nota', style: 'dim' }],
    });
    expect(l[1]).toEqual({ type: 'blank' });
    expect((l[2] as any).spans[0].cmd).toBe('cat /canzoni/2026-11-10');
    expect(l.filter((b) => b.type === 'blank')).toHaveLength(1);
    const rootLines = listing(root) as any[];
    expect(rootLines.find((b) => b.spans[0].text === 'lettura/').spans[0].cmd).toBe('cd /lettura && ls');
    const link = rootLines.find((b) => b.spans[0].text === 'owlcavelabs').spans[0];
    expect(link.href).toBe('https://owlcavelabs.it');
    expect(link.cmd).toBeUndefined();
  });
  it('bozze assenti, note attaccate al libro', () => {
    expect(findByPath(root, 'messaggi')!.children!.map((c) => c.name)).toEqual(['leggimi', '2026-01-05-prova']);
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

describe('pagine nelle cartelle', () => {
  const page = (dir: string, name: string, order?: number) => ({
    file: `${dir}/${name}.md`,
    raw: `---\ntitle: Pagina ${name}\n${order !== undefined ? `order: ${order}\n` : ''}---\nTesto di ${name}.`,
  });

  it('più di quattro pagine: quattro prima dell\'archivio, le altre dopo', () => {
    const s = buildStoreFrom({
      ...full(),
      folderFiles: ['a', 'b', 'c', 'd', 'e'].map((n) => page('canzoni', n)).concat(page('canzoni', 'f', 1)),
    });
    const children = findByPath(s.root, 'canzoni')!.children!;
    expect(children.map((c) => [c.name, c.section])).toEqual([
      ['f', 'head'], ['a', 'head'], ['b', 'head'], ['c', 'head'],
      ['2026-11-10', undefined], ['2026-11-09', undefined], ['2026-11-08', undefined],
      ['d', 'tail'], ['e', 'tail'],
    ]);
    expect(children.filter((c) => !c.section).every((c) => !('section' in c))).toBe(true);
    const l = listing(findByPath(s.root, 'canzoni')!);
    expect(l.map((b) => b.type)).toEqual([
      'line', 'line', 'line', 'line', 'blank', 'line', 'line', 'line', 'blank', 'line', 'line',
    ]);
  });

  it('la pagina è un elemento e un nodo della mappa', () => {
    const s = buildStoreFrom(full());
    expect(s.items.get('canzoni/leggimi')).toMatchObject({ kind: 'page', path: 'canzoni/leggimi', data: { title: 'Nota' } });
    expect(findNode(s, 'canzoni/../canzoni/leggimi')).toBe(findByPath(s.root, 'canzoni/leggimi'));
    expect(findNode(s, 'canzoni/leggimi')).not.toBeNull();
    expect(findNode(s, '')).toBe(s.root);
    expect(findNode(s, 'nope')).toBeNull();
    expect(s.nodes.size).toBe(allNodes(s.root).length);
  });

  it('cartella con sole pagine: esiste, senza canzone del giorno', () => {
    const s = buildStoreFrom({ ...full(), songs: [], folderFiles: [page('canzoni', 'leggimi')] });
    expect(s.root.children!.map((c) => c.name)).toEqual(['canzoni', 'lettura', 'messaggi', 'chi-sono', 'owlcavelabs']);
    expect(findByPath(s.root, 'canzoni')!.children!.map((c) => c.name)).toEqual(['leggimi']);
    expect(listing(findByPath(s.root, 'canzoni')!).map((b) => b.type)).toEqual(['line']);
    expect(s.latestSong).toBeUndefined();
  });

  it('messaggi con sole pagine: la cartella esiste', () => {
    const s = buildStoreFrom({ ...full(), posts: [], folderFiles: [page('messaggi', 'leggimi')] });
    expect(findByPath(s.root, 'messaggi')!.children!.map((c) => c.name)).toEqual(['leggimi']);
  });

  it('una pagina con il nome di una bozza si salta, la bozza resta non pubblicata', () => {
    const input = full();
    input.posts.push({ slug: 'bozza', body: 'x', data: { title: 'B', date: '2026-03-01', draft: true } });
    input.folderFiles = [page('messaggi', 'bozza')];
    const s = buildStoreFrom(input);
    expect(s.items.has('messaggi/bozza')).toBe(false);
    expect(findByPath(s.root, 'messaggi/bozza')).toBeNull();
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0].file).toBe('messaggi/bozza.md');
    expect(s.warnings[0].message).toMatch(/messaggio/);
  });

  it('una pagina con il nome di un messaggio pubblicato si salta, il messaggio resta', () => {
    const input = full();
    input.posts.push({ slug: 'prova', body: 'x', data: { title: 'P', date: '2026-03-01', draft: false } });
    input.folderFiles = [page('messaggi', 'prova')];
    const s = buildStoreFrom(input);
    expect(s.items.get('messaggi/prova')?.kind).toBe('post');
    expect(findByPath(s.root, 'messaggi')!.children!.filter((c) => c.name === 'prova')).toHaveLength(1);
    expect(s.warnings.map((w) => w.file)).toEqual(['messaggi/prova.md']);
  });

  it('in canzoni un nome che inizia con una cifra ma non è una data blocca la build', () => {
    expect(() => buildStoreFrom({ ...full(), folderFiles: [{ file: 'canzoni/2026-11-1.md', raw: '' }] })).toThrow(
      /canzoni\/2026-11-1\.md/,
    );
  });

  it('una pagina alla radice con il nome di un link blocca la build', () => {
    const input = full();
    input.pages.push({ slug: 'owlcavelabs', body: 'x', data: { title: 'O' } });
    expect(() => buildStoreFrom(input)).toThrow(/owlcavelabs/);
  });

  it('un file fuori dalle cartelle delle pagine si salta con un avviso', () => {
    const s = buildStoreFrom({ ...full(), folderFiles: [page('lettura', 'x')] });
    expect(s.items.has('lettura/x')).toBe(false);
    expect(s.warnings.map((w) => w.file)).toEqual(['lettura/x.md']);
  });

  it('gli avvisi della lettura finiscono nello store', () => {
    const s = buildStoreFrom({ ...full(), folderFiles: [{ file: 'canzoni/leggimi.md', raw: 'Solo testo.' }] });
    expect(s.items.get('canzoni/leggimi')).toMatchObject({ kind: 'page', data: { title: 'leggimi' } });
    expect(s.warnings.map((w) => w.file)).toEqual(['canzoni/leggimi.md']);
  });

  it('senza pagine nelle cartelle: nessun avviso', () => {
    const { folderFiles: _, ...input } = full();
    expect(buildStoreFrom(input).warnings).toEqual([]);
  });
});
