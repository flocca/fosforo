// `/_fs/index.json`: albero e dati del sito per il client.
import type { APIRoute } from 'astro';
import { formatDate } from '../lib/dates';
import { buildStore } from '../lib/store';

export const GET: APIRoute = async () => {
  const store = await buildStore();
  const { host, user, boot } = store.site;
  const song = store.latestSong;
  const body = {
    root: store.root,
    site: { host, user, boot },
    ...(song && song.kind === 'song'
      ? { latestSong: { path: song.path, label: song.data.title, date: formatDate(song.data.date) } }
      : {}),
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
};
