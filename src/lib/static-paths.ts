// Elenco dei nodi dell'albero e metadati delle pagine statiche.
import type { Block } from './blocks';
import { formatDate } from './dates';
import { findByPath, type FsNode } from './fs-tree';
import { renderPath } from './render';
import type { Store } from './store';

export function allNodes(root: FsNode): FsNode[] {
  return [root, ...(root.children ?? []).flatMap(allNodes)];
}

// `/_fs/<path>.json`: la radice sta in `root.json`.
export const twinName = (path: string) => (path === '' ? 'root' : path);

// Nodi che hanno una pagina HTML e un gemello JSON.
export function pageNodes(store: Store): FsNode[] {
  return allNodes(store.root);
}

export type PageMeta = {
  title: string;
  ogTitle?: string; // titolo della scheda social, se diverso dal <title>
  description: string;
  canonical: string; // percorso con barra iniziale
  ogPath: string; // `/og/...png`
  page: 'home' | 'item';
  aliasTarget?: string;
};

const firstText = (blocks: Block[]): string => {
  for (const b of blocks.slice(1)) {
    if (b.type === 'line') {
      const t = b.spans.map((s) => s.text).join('').trim();
      if (t) return t;
    }
  }
  return '';
};

const clip = (s: string, n = 160) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function pageMeta(path: string, store: Store): PageMeta | null {
  const node = findByPath(store.root, path);
  if (!node) return null;
  const host = store.site.host;
  if (node.path === '') {
    return {
      title: host,
      description: `${host}: canzoni, letture e pagine, in forma di terminale.`,
      canonical: '/',
      ogPath: '/og/home.png',
      page: 'home',
    };
  }
  if (node.type === 'alias' && node.target) {
    const target = pageMeta(node.target, store);
    if (!target) return null;
    return { ...target, page: 'item', aliasTarget: node.target };
  }
  const item = store.items.get(node.path);
  const title = item ? item.data.title : (node.title ?? node.name);
  let description: string;
  if (item?.kind === 'song') {
    description = `Una canzone al giorno, ${formatDate(item.data.date)}: ${item.data.title} (${item.data.artist})`;
  } else if (item?.kind === 'book') {
    description = `Lettura: ${item.data.title}, di ${item.data.authors.join(', ')}`;
  } else if (item?.kind === 'post') {
    description = item.data.description ?? firstText(renderPath(node.path, store) ?? []);
  } else if (item?.kind === 'page') {
    description = firstText(renderPath(node.path, store) ?? []);
  } else if (node.type === 'dir') {
    description = `Cartella /${node.path} di ${host}`;
  } else {
    description = node.title ?? node.name;
  }
  return {
    title: `${title} · ${host}`,
    // canzoni: titolo e artista sono già nel testo del post e nell'immagine, sotto resta la rubrica
    ...(item?.kind === 'song' ? { ogTitle: 'Una canzone al giorno' } : {}),
    description: clip(description || `${title} su ${host}`),
    canonical: `/${node.path}`,
    ogPath: `/og/${node.path}.png`,
    page: 'item',
  };
}
