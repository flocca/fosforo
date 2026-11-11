// `/_fs/<percorso>.json`: titolo e blocchi di ogni nodo (la radice in `root.json`).
import type { APIRoute } from 'astro';
import { renderPath } from '../lib/render';
import { findByPath } from '../lib/fs-tree';
import { pageNodes, twinName } from '../lib/static-paths';
import { buildStore } from '../lib/store';

export async function getStaticPaths() {
  const store = await buildStore();
  return pageNodes(store).map((n) => ({ params: { path: twinName(n.path) } }));
}

export const GET: APIRoute = async ({ params }) => {
  const store = await buildStore();
  const name = params.path as string;
  const path = name === 'root' ? '' : name;
  const node = findByPath(store.root, path);
  const blocks = renderPath(path, store);
  if (!node || !blocks) return new Response('non trovato', { status: 404 });
  const item = store.items.get(node.path);
  const title = path === '' ? store.site.host : item ? item.data.title : (node.title ?? node.name);
  return new Response(JSON.stringify({ path, title, blocks }), {
    headers: { 'content-type': 'application/json' },
  });
};
