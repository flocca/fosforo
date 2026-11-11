import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { fetchThumbnail, youtubeId } from '../../src/lib/youtube';

describe('youtubeId', () => {
  it('legge watch?v= con parametri extra', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=wCzoTQqEoFg&t=3')).toBe('wCzoTQqEoFg');
  });
  it('legge youtu.be', () => {
    expect(youtubeId('https://youtu.be/wCzoTQqEoFg')).toBe('wCzoTQqEoFg');
    expect(youtubeId('https://youtu.be/wCzoTQqEoFg?t=5')).toBe('wCzoTQqEoFg');
  });
  it('altri URL danno null', () => {
    expect(youtubeId('https://example.com')).toBeNull();
    expect(youtubeId('non è un url')).toBeNull();
  });
});

const sleep = async () => {};
const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#888' } }).jpeg().toBuffer();
const ok = async (w: number, h: number) =>
  new Response(new Uint8Array(await png(w, h)), { status: 200 });

describe('fetchThumbnail', () => {
  it('usa maxres se disponibile e lo mette in cache', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const fetchFn = vi.fn(async () => ok(1280, 720));
    const first = await fetchThumbnail('abc', dir, fetchFn as unknown as typeof fetch);
    expect(first).not.toBeNull();
    const second = await fetchThumbnail('abc', dir, vi.fn() as unknown as typeof fetch);
    expect(second?.equals(first!)).toBe(true);
  });
  it('ripiega su hqdefault con 404 o segnaposto da 120 px', async () => {
    for (const first of [() => new Response('', { status: 404 }), () => ok(120, 90)]) {
      const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
      const urls: string[] = [];
      const fetchFn = async (url: string | URL | Request) => {
        urls.push(String(url));
        return urls.length === 1 ? first() : ok(480, 360);
      };
      const buf = await fetchThumbnail('abc', dir, fetchFn as unknown as typeof fetch);
      expect(buf).not.toBeNull();
      expect(urls[0]).toContain('maxresdefault.jpg');
      expect(urls[1]).toContain('hqdefault.jpg');
    }
  });
  it('con 404 su entrambe restituisce null e non mette nulla in cache', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const nope = vi.fn(async () => new Response('', { status: 404 }));
    expect(await fetchThumbnail('nul1', dir, nope as unknown as typeof fetch, { sleep })).toBeNull();
    expect(nope).toHaveBeenCalledTimes(2);
    expect(await readdir(dir)).toEqual([]);
  });
  it('un 4xx diverso da 404 vale come 404', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const f = vi.fn(async () => new Response('', { status: 403 }));
    expect(await fetchThumbnail('nul2', dir, f as unknown as typeof fetch, { sleep })).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('riprova su 503 e poi riesce', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? new Response('', { status: 503 }) : ok(1280, 720)));
    const sl = vi.fn(async () => {});
    const buf = await fetchThumbnail('ret1', dir, f as unknown as typeof fetch, { sleep: sl });
    expect(buf).not.toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
    expect(sl).toHaveBeenCalledWith(1000);
  });
  it('lancia dopo 3 errori di rete o timeout, con id e URL nel messaggio', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const boom = vi.fn(async () => {
      throw new DOMException('timeout', 'TimeoutError');
    });
    const p = fetchThumbnail('boom1', dir, boom as unknown as typeof fetch, { sleep });
    await expect(p).rejects.toThrow(/boom1.*i\.ytimg\.com\/vi\/boom1\/maxresdefault\.jpg/);
    expect(boom).toHaveBeenCalledTimes(3);
    expect(await readdir(dir)).toEqual([]);
  });
  it('lancia dopo 3 risposte 5xx', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const f = vi.fn(async () => new Response('', { status: 502 }));
    await expect(fetchThumbnail('five1', dir, f as unknown as typeof fetch, { sleep })).rejects.toThrow(/five1/);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('lancia se hqdefault fallisce dopo un maxres 404', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('maxres') ? new Response('', { status: 404 }) : new Response('', { status: 500 }),
    );
    await expect(fetchThumbnail('hq5xx', dir, f as unknown as typeof fetch, { sleep })).rejects.toThrow(/hqdefault/);
  });
  it('memo: due chiamate, una sola sequenza di fetch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const f = vi.fn(async () => ok(1280, 720));
    const [a, b] = await Promise.all([
      fetchThumbnail('memo1', dir, f as unknown as typeof fetch, { sleep }),
      fetchThumbnail('memo1', dir, f as unknown as typeof fetch, { sleep }),
    ]);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('un file in cache corrotto viene scartato e riscaricato', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    await writeFile(join(dir, 'yt-bad1.jpg'), 'non sono un jpeg');
    const f = vi.fn(async () => ok(1280, 720));
    const buf = await fetchThumbnail('bad1', dir, f as unknown as typeof fetch, { sleep });
    expect(f).toHaveBeenCalledTimes(1);
    expect((await sharp(await readFile(join(dir, 'yt-bad1.jpg'))).metadata()).width).toBe(1280);
    expect(buf).not.toBeNull();
  });
  it('la scrittura è atomica: nessun .tmp resta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    await fetchThumbnail('atom1', dir, (async () => ok(1280, 720)) as unknown as typeof fetch, { sleep });
    expect(await readdir(dir)).toEqual(['yt-atom1.jpg']);
  });
});
