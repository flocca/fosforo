// Store dei contenuti: costruisce l'albero e gli elementi (solo in build).
import type { Book, Goal, Page, Post, SiteConfig, Song } from './schema';
import { assertMarkdownBody } from './text';
import { normalizePath, type FsNode } from './fs-tree';
import { FOLDER_PAGE_DIRS } from './claims';
import { parseFolderPage, type FolderPage, type Warning } from './folder-page';

export type Item =
  | { kind: 'song'; path: string; data: Song; body: string }
  | { kind: 'book'; path: string; data: Book; note?: string }
  | { kind: 'post'; path: string; data: Post; body: string; images?: Record<string, { width: number; height: number }>; receipt?: Receipt }
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
type ImageSizes = Record<string, { width: number; height: number }>;
// Valori veri del messaggio per l'intestazione di ricezione: byte e CRC-32 di index.md, immagini accanto.
export type Receipt = { bytes: number; crc32: string; attachments: number };

export type StoreInput = {
  songs: Entry<Song>[];
  books: { slug: string; data: Book }[];
  bookNotes?: { slug: string; body: string }[];
  goal?: Goal;
  posts: (Entry<Post> & { images?: ImageSizes; receipt?: Receipt })[];
  pages: Entry<Page>[];
  // `.md` sciolti nelle cartelle delle pagine, percorso relativo alla cartella dei contenuti
  folderFiles?: { file: string; raw: string }[];
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

// Legge i `.md` sciolti nelle cartelle: pagine per cartella e avvisi. Un nome a cifre in `canzoni/` blocca la build.
function readFolderPages(files: { file: string; raw: string }[]) {
  const byDir = new Map<string, FolderPage[]>();
  const warnings: Warning[] = [];
  for (const { file, raw } of files) {
    const slash = file.lastIndexOf('/');
    const dir = file.slice(0, slash);
    const name = file.slice(slash + 1);
    if (!(FOLDER_PAGE_DIRS as readonly string[]).includes(dir)) {
      warnings.push({ file, message: 'non è in una cartella che accetta pagine: saltato' });
      continue;
    }
    if (dir === 'canzoni' && /^\d/.test(name)) {
      throw new Error(`fosforo: ${file}: sembra una canzone ma il nome non è AAAA-MM-GG`);
    }
    const r = parseFolderPage(file, raw);
    warnings.push(...r.warnings);
    if (r.page) byDir.set(dir, [...(byDir.get(dir) ?? []), r.page]);
  }
  return { byDir, warnings };
}

export function buildStoreFrom(input: StoreInput): Store {
  const items = new Map<string, Item>();
  const rootChildren: FsNode[] = [];
  const { byDir, warnings } = readFolderPages(input.folderFiles ?? []);
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
      items.set(path, { kind: 'post', path, data: p.data, body: p.body, ...(p.images ? { images: p.images } : {}), ...(p.receipt ? { receipt: p.receipt } : {}) });
      postNodes.push({ name: p.slug, path, type: 'file', title: p.data.title });
    }
    rootChildren.push({ name: 'messaggi', path: 'messaggi', type: 'dir', children: postNodes });
  }
  // Pagine in `messaggi/`: attorno ai post, o da sole se non ce ne sono.
  const postDir = rootChildren.find((c) => c.path === 'messaggi');
  const postChildren = withPages('messaggi', postDir?.children ?? []);
  if (postDir) postDir.children = postChildren;
  else if (postChildren.length) rootChildren.push({ name: 'messaggi', path: 'messaggi', type: 'dir', children: postChildren });

  // Pagine alla radice
  const pages = [...input.pages].sort((a, b) =>
    byOrderThenName({ name: a.slug, order: a.data.order }, { name: b.slug, order: b.data.order }),
  );
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

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif|tiff?)$/i;

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
    if (!IMAGE_FILE.test(file)) continue;
    const size = await imageSize(join(folder, file));
    if (size) sizes[file.replace(/\.[^.]+$/, '')] = size;
  }
  return sizes;
}

export const formatCrc32 = (n: number): string => n.toString(16).toUpperCase().padStart(8, '0');

// Byte di index.md come sono sul disco (frontmatter e CR compresi), il loro CRC-32
// e il numero di immagini accanto.
export async function postReceipt(dir: string, base?: string): Promise<Receipt> {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { crc32 } = await import('node:zlib');
  const root = base ?? (await import('./content-dir')).contentDir();
  const folder = join(root, 'messaggi', dir);
  const buf = await readFile(join(folder, 'index.md'));
  const files = await readdir(folder);
  return {
    bytes: buf.length,
    crc32: formatCrc32(crc32(buf)),
    attachments: files.filter((f) => IMAGE_FILE.test(f)).length,
  };
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
  const { formatWarnings } = await import('./warnings');
  for (const line of formatWarnings(store.warnings, process.env)) console.warn(line);
  return store;
}

async function buildStoreUncached(): Promise<Store> {
  // Import dinamico: `astro:content` esiste solo dentro Astro, non nei test unitari.
  const { getCollection } = await import('astro:content');
  const [songs, books, notes, goals, posts, pages, sites] = await Promise.all([
    getCollection('canzoni'),
    getCollection('lettura'),
    getCollection('noteLettura'),
    getCollection('obiettivo'),
    getCollection('messaggi'),
    getCollection('pagine'),
    getCollection('sito'),
  ]);
  const site = sites[0]?.data;
  if (!site) throw new Error('site.yaml mancante nella cartella dei contenuti');
  // Il lettore delle cartelle e le collezioni devono attribuire gli stessi file: nessuno sparisce in silenzio.
  const { scanFolders } = await import('./scan');
  const { checkClaims } = await import('./claims');
  const { contentDir } = await import('./content-dir');
  const scan = await scanFolders(contentDir());
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
        return { slug, data: e.data, body: e.body ?? '', images: await postImageSizes(slug), receipt: await postReceipt(slug) };
      }),
    ),
    pages: pages.map((e) => ({ slug: e.id, data: e.data, body: e.body ?? '' })),
    folderFiles: scan.folderFiles,
    site,
  });
}
