// Store dei contenuti: costruisce l'albero e gli elementi (solo in build).
import type { Book, Goal, Page, Post, SiteConfig, Song } from './schema';
import { assertMarkdownBody } from './text';
import type { FsNode } from './fs-tree';

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
};

type Entry<T> = { slug: string; data: T; body: string };
type ImageSizes = Record<string, { width: number; height: number }>;

export type StoreInput = {
  songs: Entry<Song>[];
  books: { slug: string; data: Book }[];
  bookNotes?: { slug: string; body: string }[];
  goal?: Goal;
  posts: (Entry<Post> & { images?: ImageSizes })[];
  pages: Entry<Page>[];
  site: SiteConfig;
};

// Gli id delle collezioni contengono la cartella (es. `canzoni/2026-11-10`): serve il nome.
const stem = (id: string) => id.split('/').pop() ?? id;

const byDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

export function buildStoreFrom(input: StoreInput): Store {
  const items = new Map<string, Item>();
  const rootChildren: FsNode[] = [];

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
    rootChildren.push({ name: 'canzoni', path: 'canzoni', type: 'dir', children: songNodes });
  }

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
      assertMarkdownBody(p.body, `post/${p.slug}/index.md`);
      const path = `post/${p.slug}`;
      items.set(path, { kind: 'post', path, data: p.data, body: p.body, ...(p.images ? { images: p.images } : {}) });
      postNodes.push({ name: p.slug, path, type: 'file', title: p.data.title });
    }
    rootChildren.push({ name: 'post', path: 'post', type: 'dir', children: postNodes });
  }

  // Pagine: per `order`, poi per nome
  const pages = [...input.pages].sort(
    (a, b) =>
      (a.data.order ?? Infinity) - (b.data.order ?? Infinity) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
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

  return {
    root: { name: '', path: '', type: 'dir', children: rootChildren },
    items,
    goal: input.goal,
    site: input.site,
    latestSong,
  };
}

// Dimensioni delle immagini accanto a un post dopo l'elaborazione della build
// (scala di grigi, larghezza massima 640, proporzioni mantenute), per nome senza estensione.
export async function postImageSizes(dir: string): Promise<ImageSizes> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { imageSize } = await import('./image-size');
  const { contentDir } = await import('./content-dir');
  const folder = join(contentDir(), 'post', dir);
  const sizes: ImageSizes = {};
  for (const file of await readdir(folder).catch(() => [] as string[])) {
    if (!/\.(jpe?g|png|webp|gif|avif|tiff?)$/i.test(file)) continue;
    const size = await imageSize(join(folder, file));
    if (size) sizes[file.replace(/\.[^.]+$/, '')] = size;
  }
  return sizes;
}

export async function buildStore(): Promise<Store> {
  // Import dinamico: `astro:content` esiste solo dentro Astro, non nei test unitari.
  const { getCollection } = await import('astro:content');
  const [songs, books, notes, goals, posts, pages, sites] = await Promise.all([
    getCollection('canzoni'),
    getCollection('lettura'),
    getCollection('noteLettura'),
    getCollection('obiettivo'),
    getCollection('post'),
    getCollection('pagine'),
    getCollection('sito'),
  ]);
  const site = sites[0]?.data;
  if (!site) throw new Error('site.yaml mancante nella cartella dei contenuti');
  return buildStoreFrom({
    songs: songs.map((e) => ({ slug: stem(e.id), data: e.data, body: e.body ?? '' })),
    books: books.map((e) => ({ slug: e.data.slug, data: e.data })),
    bookNotes: notes.map((e) => ({ slug: stem(e.id), body: e.body ?? '' })),
    goal: goals[0]?.data,
    posts: await Promise.all(
      posts.map(async (e) => {
        const slug = e.id.replace(/^post\//, '');
        return { slug, data: e.data, body: e.body ?? '', images: await postImageSizes(slug) };
      }),
    ),
    pages: pages.map((e) => ({ slug: e.id, data: e.data, body: e.body ?? '' })),
    site,
  });
}
