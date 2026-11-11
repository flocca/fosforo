import { mkdtemp } from 'node:fs/promises';
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
  it('restituisce null se falliscono entrambe o la rete cade', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fosforo-yt-'));
    const nope = async () => new Response('', { status: 404 });
    expect(await fetchThumbnail('abc', dir, nope as unknown as typeof fetch)).toBeNull();
    const boom = async () => {
      throw new Error('rete assente');
    };
    expect(await fetchThumbnail('abd', dir, boom as unknown as typeof fetch)).toBeNull();
  });
});
