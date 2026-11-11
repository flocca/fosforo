// `/og/<percorso>.png`: anteprima social 1200x630 (home in `/og/home.png`).
import type { APIRoute } from 'astro';
import { ogImage } from '../../lib/cards';
import { findByPath } from '../../lib/fs-tree';
import { pageNodes } from '../../lib/static-paths';
import { buildStore } from '../../lib/store';
import { fetchThumbnail, youtubeId } from '../../lib/youtube';

export async function getStaticPaths() {
  const store = await buildStore();
  return [
    { params: { path: 'home' } },
    ...pageNodes(store)
      .filter((n) => n.path !== '' && n.type !== 'alias')
      .map((n) => ({ params: { path: n.path } })),
  ];
}

export const GET: APIRoute = async ({ params }) => {
  const store = await buildStore();
  const path = params.path as string;
  const host = store.site.host;
  const item = store.items.get(path);
  let body: Buffer;
  if (item?.kind === 'song') {
    const id = item.data.links.youtube ? youtubeId(item.data.links.youtube) : null;
    const thumb = id ? await fetchThumbnail(id) : null;
    body = await ogImage({ title: item.data.title, subtitle: item.data.artist, host }, thumb, path);
  } else if (item) {
    body = await ogImage({ title: item.data.title, host }, null, path);
  } else {
    const node = path === 'home' ? undefined : findByPath(store.root, path);
    const title = !node ? host : node.type === 'dir' ? `${node.name}/` : (node.title ?? node.name);
    body = await ogImage({ title, host }, null, path);
  }
  return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/png' } });
};
