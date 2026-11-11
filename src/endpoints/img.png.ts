// `/_img/...png`: foto dei post (scala di grigi, 640 px) e fotogrammi delle canzoni.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { APIRoute } from 'astro';
import { contentDir } from '../lib/content-dir';
import { postImage, songImage } from '../lib/cards';
import { buildStore } from '../lib/store';
import { fetchThumbnail, youtubeId } from '../lib/youtube';

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif|tiff?)$/i;

export async function getStaticPaths() {
  const store = await buildStore();
  const out: { params: { path: string }; props: { kind: 'post'; file: string } | { kind: 'song' } }[] = [];
  for (const item of store.items.values()) {
    if (item.kind === 'song' && item.data.links.youtube) {
      out.push({ params: { path: item.path }, props: { kind: 'song' } });
    }
    if (item.kind === 'post') {
      const folder = join(contentDir(), item.path);
      for (const file of await readdir(folder).catch(() => [] as string[])) {
        if (!IMAGE_FILE.test(file)) continue;
        out.push({
          params: { path: `${item.path}/${file.replace(/\.[^.]+$/, '')}` },
          props: { kind: 'post', file: join(folder, file) },
        });
      }
    }
  }
  return out;
}

export const GET: APIRoute = async ({ params, props }) => {
  let body: Buffer;
  if (props.kind === 'post') {
    body = await postImage(props.file);
  } else {
    const store = await buildStore();
    const item = store.items.get(params.path as string);
    if (item?.kind !== 'song') return new Response('non trovato', { status: 404 });
    const id = item.data.links.youtube ? youtubeId(item.data.links.youtube) : null;
    const thumb = id ? await fetchThumbnail(id) : null;
    body = await songImage({ title: item.data.title, subtitle: item.data.artist, host: store.site.host }, thumb);
  }
  return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/png' } });
};
