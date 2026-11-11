// Miniature di YouTube per le canzoni: solo in build, con cache su disco.
// L'anteprima deve essere definitiva alla prima risposta 200: un errore di rete fa fallire la build.
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
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

const TIMEOUT_MS = 15_000;
const BACKOFF_MS = [1000, 3000];
const MAX_ATTEMPTS = 3;

export interface ThumbnailOptions {
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Outcome = { kind: 'image'; buf: Buffer } | { kind: 'missing' } | { kind: 'placeholder' };

// Una richiesta con timeout e fino a 3 tentativi su errori di rete, timeout e 5xx.
// 404 e altri 4xx sono "assente". Se i tentativi finiscono male lancia.
async function request(
  id: string,
  url: string,
  fetchFn: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<Outcome> {
  let lastError = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] ?? 3000);
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status >= 500) {
        lastError = `risposta ${res.status}`;
        continue;
      }
      if (!res.ok) return { kind: 'missing' };
      const buf = Buffer.from(await res.arrayBuffer());
      // Il segnaposto di YouTube per le miniature mancanti è largo 120 px.
      const { width } = await sharp(buf).metadata();
      return width && width > 120 ? { kind: 'image', buf } : { kind: 'placeholder' };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(
    `Miniatura YouTube non scaricabile per il video ${id} (${url}) dopo ${MAX_ATTEMPTS} tentativi: ${lastError}. ` +
      'La build si ferma di proposito: riprova più tardi.',
  );
}

async function readCache(file: string): Promise<Buffer | null> {
  let buf: Buffer;
  try {
    buf = await readFile(file);
  } catch {
    return null;
  }
  try {
    const { width, height } = await sharp(buf).metadata();
    if (width && height) return buf;
  } catch {
    // file non valido
  }
  await unlink(file).catch(() => {});
  return null;
}

async function writeCache(cacheDir: string, file: string, buf: Buffer): Promise<void> {
  const tmp = `${file}.tmp`;
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(tmp, buf);
    await rename(tmp, file);
  } catch {
    await unlink(tmp).catch(() => {});
  }
}

async function load(
  id: string,
  cacheDir: string,
  fetchFn: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<Buffer | null> {
  const file = join(cacheDir, `yt-${id}.jpg`);
  const cached = await readCache(file);
  if (cached) return cached;
  for (const name of ['maxresdefault', 'hqdefault']) {
    const out = await request(id, `https://i.ytimg.com/vi/${id}/${name}.jpg`, fetchFn, sleep);
    if (out.kind === 'image') {
      await writeCache(cacheDir, file, out.buf);
      return out.buf;
    }
  }
  return null;
}

// Una sola richiesta per video e per build, condivisa da /og e /_img.
const memo = new Map<string, Promise<Buffer | null>>();

export function fetchThumbnail(
  id: string,
  cacheDir: string = defaultCacheDir(),
  fetchFn: typeof fetch = globalThis.fetch,
  options: ThumbnailOptions = {},
): Promise<Buffer | null> {
  const key = `${cacheDir}\0${id}`;
  let p = memo.get(key);
  if (!p) {
    p = load(id, cacheDir, fetchFn, options.sleep ?? defaultSleep);
    memo.set(key, p);
    p.catch(() => memo.delete(key));
  }
  return p;
}
