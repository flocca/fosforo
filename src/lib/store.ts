// Store dei contenuti: costruisce l'albero e gli elementi (solo in build).
import type { Book, Goal, Page, Post, SiteConfig, Song } from './schema';
import { assertMarkdownBody } from './text';
import { normalizePath, type FsNode } from './fs-tree';
import { FOLDER_PAGE_DIRS, PAGE_NAME, RESERVED_FOLDER_NAMES } from './claims';
import { parseFolderPage, type FolderPage, type Warning } from './folder-page';

export type Item =
  | { kind: 'song'; path: string; data: Song; body: string }
  | { kind: 'book'; path: string; data: Book; note?: string }
  | { kind: 'post'; path: string; data: Post; body: string; images?: Record<string, { width: number; height: number }> }
  | { kind: 'page'; path: string; data: Page; body: string };

export type Store = {
  root: FsNode;
  items: Map<string, Item>;
  goal?: Goal;
  site: SiteConfig;
  latestSong?: Item;
  nodes: Map<string, FsNode>; // ogni nodo dell'albero per percorso, la radice in ''
  warnings: Warning[];
};

type Entry<T> = { slug: string; data: T; body: string };
export type FolderFile = { file: string; raw?: string };
type ImageSizes = Record<string, { width: number; height: number }>;

export type StoreInput = {
  songs: Entry<Song>[];
  books: { slug: string; data: Book }[];
  bookNotes?: { slug: string; body: string }[];
  goal?: Goal;
  posts: (Entry<Post> & { images?: ImageSizes })[];
  pages: Entry<Page>[];
  // File letti dal disco, percorso relativo alla cartella dei contenuti: i `.md` della radice, del primo livello
  // delle cartelle tipizzate e delle cartelle dichiarate (con `raw`), più gli altri file delle cartelle dichiarate (senza).
  folderFiles?: FolderFile[];
  site: SiteConfig;
};

// Gli id delle collezioni contengono la cartella (es. `canzoni/2026-11-10`): serve il nome.
const stem = (id: string) => id.split('/').pop() ?? id;

const byDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

// Pagine: per `order`, poi per nome
const byOrderThenName = (a: { name: string; order?: number }, b: { name: string; order?: number }) =>
  (a.order ?? Infinity) - (b.order ?? Infinity) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// Pagine prima dell'archivio di una cartella; le altre vanno dopo.
const HEAD_PAGES = 4;

// Una cartella libera durante la costruzione: sottocartelle per nome e pagine pubblicabili.
type FreeDir = { dirs: Map<string, FreeDir>; pages: FolderPage[] };
const freeDir = (): FreeDir => ({ dirs: new Map(), pages: [] });

// Divide i file letti per zona: radice, cartelle tipizzate, cartelle dichiarate. Un nome a cifre in `canzoni/` blocca la build.
function readFolderPages(files: FolderFile[], freeNames: string[]) {
  const byDir = new Map<string, FolderPage[]>();
  const rootPages: FolderPage[] = [];
  const free = new Map(freeNames.map((n) => [n, freeDir()]));
  const warnings: Warning[] = [];
  for (const { file, raw } of files) {
    const parts = file.split('/');
    const top = parts[0];
    if (parts.length === 1) {
      if (raw === undefined) continue; // il lettore manda solo `.md` dalla radice
      const r = parseFolderPage(file, raw, 'skip');
      warnings.push(...r.warnings);
      if (r.page) rootPages.push(r.page);
    } else if (parts.length === 2 && (FOLDER_PAGE_DIRS as readonly string[]).includes(top)) {
      if (raw === undefined) continue; // nelle cartelle tipizzate gli altri file restano ignorati
      if (top === 'canzoni' && /^\d/.test(parts[1])) {
        throw new Error(`fosforo: ${file}: sembra una canzone ma il nome non è AAAA-MM-GG`);
      }
      const r = parseFolderPage(file, raw);
      warnings.push(...r.warnings);
      if (r.page) byDir.set(top, [...(byDir.get(top) ?? []), r.page]);
    } else if (free.has(top)) {
      if (raw === undefined || !file.endsWith('.md')) {
        warnings.push({ file, message: 'tipo di file non ancora gestito: saltato' });
        continue;
      }
      const badDir = parts.slice(1, -1).find((d) => !PAGE_NAME.test(d));
      if (badDir !== undefined) {
        warnings.push({
          file,
          message: `nome di cartella non valido (${badDir}), serve kebab-case con una lettera all'inizio: pagina saltata`,
        });
        continue;
      }
      const r = parseFolderPage(file, raw);
      warnings.push(...r.warnings);
      if (!r.page) continue;
      let node = free.get(top)!;
      for (const d of parts.slice(1, -1)) {
        if (!node.dirs.has(d)) node.dirs.set(d, freeDir());
        node = node.dirs.get(d)!;
      }
      node.pages.push(r.page);
    } else {
      warnings.push({ file, message: 'non è in una cartella che accetta pagine: saltato' });
    }
  }
  return { byDir, rootPages, free, warnings };
}

export function buildStoreFrom(input: StoreInput): Store {
  const items = new Map<string, Item>();
  const rootChildren: FsNode[] = [];
  const freeFolders = input.site.cartelle ?? [];
  const { byDir, rootPages, free, warnings } = readFolderPages(input.folderFiles ?? [], freeFolders.map((c) => c.name));
  // Percorsi che una pagina non può prendere: gli elementi tipizzati e le bozze (anche se non pubblicate).
  const drafts = new Set(input.posts.filter((p) => p.data.draft).map((p) => `messaggi/${p.slug}`));

  // Pagine di una cartella attorno all'archivio: quattro prima, le altre dopo.
  const withPages = (dir: string, archive: FsNode[]): FsNode[] => {
    const pages = (byDir.get(dir) ?? [])
      .filter((p) => {
        const path = `${dir}/${p.name}`;
        if (!items.has(path) && !drafts.has(path)) return true;
        const what = items.get(path)?.kind === 'song' ? 'una canzone' : 'un messaggio';
        warnings.push({ file: `${path}.md`, message: `stesso nome di ${what} (${path}): pagina saltata` });
        return false;
      })
      .sort((a, b) => byOrderThenName({ name: a.name, order: a.data.order }, { name: b.name, order: b.data.order }));
    const nodes = pages.map((p, i): FsNode => {
      const path = `${dir}/${p.name}`;
      items.set(path, { kind: 'page', path, data: p.data, body: p.body });
      return { name: p.name, path, type: 'file', title: p.data.title, section: i < HEAD_PAGES ? 'head' : 'tail' };
    });
    return [...nodes.slice(0, HEAD_PAGES), ...archive, ...nodes.slice(HEAD_PAGES)];
  };

  // Canzoni, dalla più recente
  const songs = [...input.songs].sort((a, b) => byDesc(a.data.date, b.data.date));
  const songNodes: FsNode[] = [];
  for (const s of songs) {
    assertMarkdownBody(s.body, `canzoni/${s.slug}.md`);
    const path = `canzoni/${s.slug}`;
    items.set(path, { kind: 'song', path, data: s.data, body: s.body });
    songNodes.push({ name: s.slug, path, type: 'file', title: `${s.data.title} (${s.data.artist})` });
  }
  const latestSong = songs.length ? items.get(`canzoni/${songs[0].slug}`) : undefined;
  if (latestSong) {
    rootChildren.push({
      name: 'canzone-del-giorno',
      path: 'canzone-del-giorno',
      type: 'alias',
      target: latestSong.path,
      title: 'canzone del giorno',
    });
  }
  const songChildren = withPages('canzoni', songNodes);
  if (songChildren.length) rootChildren.push({ name: 'canzoni', path: 'canzoni', type: 'dir', children: songChildren });

  // Lettura: in corso (ultima lettura) poi finiti (data di fine)
  if (input.books.length) {
    const notes = new Map((input.bookNotes ?? []).map((n) => [n.slug, n.body]));
    for (const n of input.bookNotes ?? []) assertMarkdownBody(n.body, `lettura/${n.slug}.md`);
    const ongoing = input.books
      .filter((b) => b.data.status === 'in-corso')
      .sort((a, b) => byDesc(a.data.lastReadAt, b.data.lastReadAt));
    const finished = input.books
      .filter((b) => b.data.status === 'finito')
      .sort((a, b) => byDesc(a.data.finishedAt ?? '', b.data.finishedAt ?? ''));
    const bookNodes: FsNode[] = [];
    for (const b of [...ongoing, ...finished]) {
      const path = `lettura/${b.slug}`;
      const note = notes.get(b.slug);
      items.set(path, { kind: 'book', path, data: b.data, ...(note !== undefined ? { note } : {}) });
      bookNodes.push({ name: b.slug, path, type: 'file', title: b.data.title });
    }
    rootChildren.push({ name: 'lettura', path: 'lettura', type: 'dir', children: bookNodes });
  }

  // Post pubblicati, dal più recente
  const posts = input.posts
    .filter((p) => !p.data.draft)
    .sort((a, b) => byDesc(a.data.date, b.data.date));
  if (posts.length) {
    const postNodes: FsNode[] = [];
    for (const p of posts) {
      assertMarkdownBody(p.body, `messaggi/${p.slug}/index.md`);
      const path = `messaggi/${p.slug}`;
      items.set(path, { kind: 'post', path, data: p.data, body: p.body, ...(p.images ? { images: p.images } : {}) });
      postNodes.push({ name: p.slug, path, type: 'file', title: p.data.title });
    }
    rootChildren.push({ name: 'messaggi', path: 'messaggi', type: 'dir', children: postNodes });
  }
  // Pagine in `messaggi/`: attorno ai post, o da sole se non ce ne sono.
  const postDir = rootChildren.find((c) => c.path === 'messaggi');
  const postChildren = withPages('messaggi', postDir?.children ?? []);
  if (postDir) postDir.children = postChildren;
  else if (postChildren.length) rootChildren.push({ name: 'messaggi', path: 'messaggi', type: 'dir', children: postChildren });

  // Cartelle dichiarate in site.yaml, nell'ordine dell'elenco: compaiono solo se hanno almeno una pagina.
  const freeNodes = (dir: FreeDir, path: string): FsNode[] => {
    const subdirs = [...dir.dirs.keys()].sort().map((name): FsNode => {
      const p = `${path}/${name}`;
      return { name, path: p, type: 'dir', children: freeNodes(dir.dirs.get(name)!, p) };
    });
    const pages = dir.pages
      .filter((pg) => {
        if (!dir.dirs.has(pg.name)) return true;
        warnings.push({ file: `${path}/${pg.name}.md`, message: `c'è anche una cartella ${path}/${pg.name}: pagina saltata` });
        return false;
      })
      .sort((a, b) => byOrderThenName({ name: a.name, order: a.data.order }, { name: b.name, order: b.data.order }))
      .map((pg): FsNode => {
        const p = `${path}/${pg.name}`;
        items.set(p, { kind: 'page', path: p, data: pg.data, body: pg.body });
        return { name: pg.name, path: p, type: 'file', title: pg.data.title };
      });
    return [...subdirs, ...pages];
  };
  for (const c of freeFolders) {
    const dir = free.get(c.name)!;
    if (!dir.dirs.size && !dir.pages.length) {
      warnings.push({ file: `${c.name}/`, message: 'cartella dichiarata in site.yaml assente o senza pagine: non compare' });
      continue;
    }
    rootChildren.push({
      name: c.name,
      path: c.name,
      type: 'dir',
      ...(c.title !== undefined ? { title: c.title } : {}),
      children: freeNodes(dir, c.name),
    });
  }

  // Pagine alla radice: cedono il nome agli elementi tipizzati, alle cartelle dichiarate e ai link.
  const taken = new Map<string, string>([
    ...RESERVED_FOLDER_NAMES.map((n): [string, string] => [n, 'un elemento del motore']),
    ...freeFolders.map((c): [string, string] => [c.name, 'una cartella dichiarata']),
    ...input.site.links.map((l): [string, string] => [l.name, 'un link']),
  ]);
  const pages = [
    ...input.pages,
    ...rootPages.map((p) => ({ slug: p.name, data: p.data, body: p.body })),
  ]
    .filter((p) => {
      const what = taken.get(p.slug);
      if (what === undefined) return true;
      warnings.push({ file: `${p.slug}.md`, message: `stesso nome di ${what} (${p.slug}): pagina saltata` });
      return false;
    })
    .sort((a, b) => byOrderThenName({ name: a.slug, order: a.data.order }, { name: b.slug, order: b.data.order }));
  for (const p of pages) {
    assertMarkdownBody(p.body, `${p.slug}.md`);
    items.set(p.slug, { kind: 'page', path: p.slug, data: p.data, body: p.body });
    rootChildren.push({ name: p.slug, path: p.slug, type: 'file', title: p.data.title });
  }

  // Link esterni
  for (const l of input.site.links) {
    rootChildren.push({ name: l.name, path: l.name, type: 'link', title: l.title, target: l.url });
  }

  const root: FsNode = { name: '', path: '', type: 'dir', children: rootChildren };
  return { root, items, goal: input.goal, site: input.site, latestSong, nodes: nodeMap(root), warnings };
}

// Ogni nodo per percorso; due nodi con lo stesso percorso (es. una pagina con il nome di un link) bloccano la build.
function nodeMap(root: FsNode): Map<string, FsNode> {
  const nodes = new Map<string, FsNode>();
  const walk = (n: FsNode) => {
    if (nodes.has(n.path)) throw new Error(`fosforo: percorso doppio: ${n.path}`);
    nodes.set(n.path, n);
    n.children?.forEach(walk);
  };
  walk(root);
  return nodes;
}

export const findNode = (store: Store, path: string): FsNode | null => store.nodes.get(normalizePath(path)) ?? null;

// Dimensioni delle immagini accanto a un post dopo l'elaborazione della build
// (scala di grigi, larghezza massima 640, proporzioni mantenute), per nome senza estensione.
export async function postImageSizes(dir: string): Promise<ImageSizes> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { imageSize } = await import('./image-size');
  const { contentDir } = await import('./content-dir');
  const folder = join(contentDir(), 'messaggi', dir);
  const sizes: ImageSizes = {};
  for (const file of await readdir(folder).catch(() => [] as string[])) {
    if (!/\.(jpe?g|png|webp|gif|avif|tiff?)$/i.test(file)) continue;
    const size = await imageSize(join(folder, file));
    if (size) sizes[file.replace(/\.[^.]+$/, '')] = size;
  }
  return sizes;
}

// Una sola costruzione per processo: in build ogni pagina e ogni endpoint chiedono lo store.
let cached: Promise<Store> | undefined;
export function buildStore(): Promise<Store> {
  // In sviluppo i contenuti cambiano a server acceso: niente cache, avvisi a ogni ricostruzione.
  if (!import.meta.env?.PROD) return buildStoreUncached().then(printWarnings);
  cached ??= buildStoreUncached().then(printWarnings);
  return cached;
}

async function printWarnings(store: Store): Promise<Store> {
  const { formatWarnings, strictError } = await import('./warnings');
  for (const line of formatWarnings(store.warnings, process.env)) console.warn(line);
  const strict = strictError(store.warnings, process.env);
  if (strict) throw strict;
  return store;
}

async function buildStoreUncached(): Promise<Store> {
  // Import dinamico: `astro:content` esiste solo dentro Astro, non nei test unitari.
  const { getCollection } = await import('astro:content');
  const [songs, books, notes, goals, posts, sites] = await Promise.all([
    getCollection('canzoni'),
    getCollection('lettura'),
    getCollection('noteLettura'),
    getCollection('obiettivo'),
    getCollection('messaggi'),
    getCollection('sito'),
  ]);
  const site = sites[0]?.data;
  if (!site) throw new Error('site.yaml mancante nella cartella dei contenuti');
  // Il lettore delle cartelle e le collezioni devono attribuire gli stessi file: nessuno sparisce in silenzio.
  const { scanFolders } = await import('./scan');
  const { checkClaims } = await import('./claims');
  const { contentDir } = await import('./content-dir');
  // Le pagine alla radice e le cartelle dichiarate arrivano dal lettore, non da una collezione.
  const scan = await scanFolders(contentDir(), (site.cartelle ?? []).map((c) => c.name));
  checkClaims('canzoni', scan.songNames, songs.map((e) => stem(e.id)));
  checkClaims('messaggi', scan.postFolders, posts.map((e) => e.id.replace(/^messaggi\//, '')));
  return buildStoreFrom({
    songs: songs.map((e) => ({ slug: stem(e.id), data: e.data, body: e.body ?? '' })),
    books: books.map((e) => ({ slug: e.data.slug, data: e.data })),
    bookNotes: notes.map((e) => ({ slug: stem(e.id), body: e.body ?? '' })),
    goal: goals[0]?.data,
    posts: await Promise.all(
      posts.map(async (e) => {
        const slug = e.id.replace(/^messaggi\//, '');
        return { slug, data: e.data, body: e.body ?? '', images: await postImageSizes(slug) };
      }),
    ),
    pages: [],
    folderFiles: scan.folderFiles,
    site,
  });
}
