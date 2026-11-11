// Miniature di YouTube per le canzoni: solo in build, con cache su disco; mai un errore di build.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { engineRoot } from './content-dir';

export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'm.youtube.com') id = u.searchParams.get('v');
  return id && /^[\w-]{6,}$/.test(id) ? id : null;
}

export function defaultCacheDir(env: Record<string, string | undefined> = process.env): string {
  return env.FOSFORO_CACHE ?? resolve(engineRoot, '.cache');
}

// Il segnaposto di YouTube per le miniature mancanti è largo 120 px.
async function download(url: string, fetchFn: typeof fetch): Promise<Buffer | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { width } = await sharp(buf).metadata();
    return width && width > 120 ? buf : null;
  } catch {
    return null;
  }
}

export async function fetchThumbnail(
  id: string,
  cacheDir: string = defaultCacheDir(),
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<Buffer | null> {
  const file = join(cacheDir, `yt-${id}.jpg`);
  try {
    return await readFile(file);
  } catch {
    // non in cache
  }
  for (const name of ['maxresdefault', 'hqdefault']) {
    const buf = await download(`https://i.ytimg.com/vi/${id}/${name}.jpg`, fetchFn);
    if (buf) {
      try {
        await mkdir(cacheDir, { recursive: true });
        await writeFile(file, buf);
      } catch {
        // la cache è solo un'ottimizzazione
      }
      return buf;
    }
  }
  return null;
}
