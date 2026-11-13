import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildStoreFrom, formatCrc32, postReceipt, type StoreInput } from '../../src/lib/store';

const site = { host: 'h', user: 'u', links: [], boot: { rom: [], welcome: 'w', welcomeTouch: 'wt' } };

describe('postReceipt', () => {
  it('legge byte, CRC-32 e allegati dal messaggio d\'esempio', async () => {
    const buf = readFileSync(join(process.cwd(), 'example-content/messaggi/2026-01-05-prova/index.md'));
    const r = await postReceipt('2026-01-05-prova');
    expect(r.bytes).toBe(buf.length);
    expect(r.crc32).toBe(crc32(buf).toString(16).toUpperCase().padStart(8, '0'));
    expect(r.crc32).toMatch(/^[0-9A-F]{8}$/);
    expect(r.attachments).toBe(1);
  });

  it('conta i byte grezzi con gli a capo CRLF, senza allegati', async () => {
    const base = mkdtempSync(join(tmpdir(), 'fosforo-receipt-'));
    const text = '---\r\ntitle: T\r\ndate: 2026-01-01\r\n---\r\n\r\nCiao\r\n';
    mkdirSync(join(base, 'messaggi', 'x'), { recursive: true });
    writeFileSync(join(base, 'messaggi', 'x', 'index.md'), text);
    const r = await postReceipt('x', base);
    expect(r.bytes).toBe(Buffer.byteLength(text, 'utf8'));
    expect(r.attachments).toBe(0);
  });
});

describe('formatCrc32', () => {
  it('8 cifre maiuscole con gli zeri iniziali', () => {
    expect(formatCrc32(0x0a07f248)).toBe('0A07F248');
    expect(formatCrc32(0)).toBe('00000000');
  });
});

describe('buildStoreFrom', () => {
  it('tiene receipt sull\'elemento del messaggio', () => {
    const receipt = { bytes: 290, crc32: '0A07F248', attachments: 1 };
    const input: StoreInput = {
      songs: [], books: [], bookNotes: [], pages: [], folderFiles: [], site,
      posts: [{ slug: '2026-01-05-prova', body: 'x', data: { title: 'Prova', date: '2026-01-05', draft: false }, receipt }],
    };
    const item = buildStoreFrom(input).items.get('messaggi/2026-01-05-prova');
    expect(item?.kind === 'post' && item.receipt).toEqual(receipt);
  });
});
