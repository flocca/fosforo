// Dal contenuto al testo del terminale: blocchi per ogni percorso.
import type { Block, Span } from './blocks';
import { listing } from './fs-tree';
import { markdownToBlocks } from './markdown';
import { findNode, type Item, type Store } from './store';
import { formatDate, fromDate } from './dates';
import { dailyRows, dailyTotals, formatDuration, progressBar, weeklyRows } from './reading';
import type { Book } from './schema';

// Markdown dei contenuti: i link interni a una cartella diventano `cd` + `ls`.
const md = (body: string, store: Store, imageBase: string, sizes?: Parameters<typeof markdownToBlocks>[1]['sizes']): Block[] =>
  markdownToBlocks(body, { imageBase, sizes, isDir: (p) => findNode(store, p)?.type === 'dir' });

const line = (...spans: Span[]): Block => ({ type: 'line', spans });
const text = (t: string, style?: Span['style']): Span => (style ? { text: t, style } : { text: t });
const blank: Block = { type: 'blank' };
const pct = (p: number) => `${Math.round(p * 100)}%`;
const bookCmd = (slug: string) => `cat /lettura/${slug}`;

function books(store: Store): Book[] {
  return [...store.items.values()].flatMap((i) => (i.kind === 'book' ? [i.data] : []));
}

// Ultimo giorno con letture, su tutti i libri (deterministico: niente data corrente).
function rhythmEnd(all: Book[]): string | undefined {
  let end: string | undefined;
  for (const b of all) for (const d of b.days) if (!end || d.date > end) end = d.date;
  return end;
}

function rhythm(totals: Map<string, number>, end: string, withWeeks: boolean, label = 'ultimi 14 giorni'): Block[] {
  const out: Block[] = [line(text(label, 'dim'))];
  for (const r of dailyRows(totals, end, 14)) out.push(line(text(r)));
  if (withWeeks) {
    out.push(blank, line(text('ultime 12 settimane', 'dim')));
    for (const r of weeklyRows(totals, end, 12)) out.push(line(text(r)));
  }
  return out;
}

function song(item: Extract<Item, { kind: 'song' }>, store: Store): Block[] {
  const d = item.data;
  const out: Block[] = [
    line(text(`── ${formatDate(d.date)} ──`, 'dim')),
    line(text(d.title, 'bold')),
    line(text(d.album ? `${d.artist} · ${d.album}` : d.artist)),
    blank,
  ];
  if (d.links.youtube) {
    out.push({ type: 'image', src: `/_img/canzoni/${d.date}.png`, alt: d.title, width: 640, height: 360 }, blank);
  }
  const links: [string, string | undefined][] = [
    ['> youtube', d.links.youtube],
    ['> apple music', d.links.appleMusic],
    ['> spotify', d.links.spotify],
  ];
  const spans: Span[] = [];
  for (const [label, href] of links) {
    if (!href) continue;
    if (spans.length) spans.push(text('  '));
    spans.push({ text: label, href });
  }
  out.push(line(...spans));
  if (item.body.trim()) out.push(blank, ...md(item.body, store, '/_img/canzoni'));
  return out;
}

function book(item: Extract<Item, { kind: 'book' }>, store: Store): Block[] {
  const b = item.data;
  const out: Block[] = [
    line(text(b.title, 'bold')),
    line(text(b.authors.join(', '))),
    blank,
    line(text(`${progressBar(b.progress, 20)} ${pct(b.progress)}`)),
    line(text(`iniziato il ${formatDate(b.startedAt)}`)),
  ];
  if (b.finishedAt) out.push(line(text(`finito il ${formatDate(b.finishedAt)}`)));
  out.push(line(text(`tempo totale: ${formatDuration(b.totalSeconds)}`)));
  // Un libro finito mostra i suoi ultimi 14 giorni; uno in corso arriva all'ultima lettura del sito,
  // così le pause recenti restano visibili.
  const done = b.status === 'finito';
  const end = rhythmEnd(done ? [b] : books(store));
  if (end) out.push(blank, ...rhythm(dailyTotals([b]), end, false, done ? 'ultimi 14 giorni del libro' : undefined));
  if (item.note?.trim()) out.push(blank, ...md(item.note, store, '/_img/lettura'));
  return out;
}

function reading(store: Store): Block[] {
  const all = books(store);
  const out: Block[] = [];
  const section = (title: string, rows: Block[]) => {
    if (!rows.length) return;
    if (out.length) out.push(blank);
    out.push(line(text(title, 'bold')), ...rows);
  };
  const ongoing = all.filter((b) => b.status === 'in-corso');
  const finished = all.filter((b) => b.status === 'finito');
  section(
    'IN CORSO',
    ongoing.flatMap((b) => [
      line({ text: b.title, cmd: bookCmd(b.slug) }),
      line(text(`${progressBar(b.progress, 20)} ${pct(b.progress)}`)),
    ]),
  );
  section(
    'FINITI',
    finished.map((b) =>
      line(text(`${formatDate(b.finishedAt ?? '')}  `), { text: b.title, cmd: bookCmd(b.slug) }, text(` (${b.authors.join(', ')})`, 'dim')),
    ),
  );
  if (store.goal) {
    const g = store.goal;
    const period = g.since ? fromDate(g.since) : `nel ${g.year}`;
    out.push(blank, line(text(`Libri finiti ${period}: ${g.finished} di ${g.target}`)));
  }
  const end = rhythmEnd(all);
  if (end) {
    if (out.length) out.push(blank);
    out.push(line(text('RITMO', 'bold')), ...rhythm(dailyTotals(all), end, true));
  }
  return out;
}

export function renderPath(path: string, store: Store): Block[] | null {
  const node = findNode(store, path);
  if (!node) return null;
  if (node.type === 'dir') return node.path === 'lettura' ? reading(store) : listing(node);
  if (node.type === 'alias') return node.target ? renderPath(node.target, store) : null;
  if (node.type === 'link') return [line({ text: node.target ?? node.name, href: node.target })];
  const item = store.items.get(node.path);
  if (!item) return null;
  switch (item.kind) {
    case 'song':
      return song(item, store);
    case 'book':
      return book(item, store);
    case 'post':
      return [
        line(text(item.data.title, 'bold')),
        line(text(formatDate(item.data.date), 'dim')),
        blank,
        ...md(item.body, store, `/_img/${item.path}`, item.images),
      ];
    case 'page':
      return [line(text(item.data.title, 'bold')), blank, ...md(item.body, store, `/_img/${item.path}`)];
  }
}
