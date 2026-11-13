import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { introText, plainText } from '../../src/lib/text';

// Casi condivisi con il servizio delle canzoni (che li esegue in Python): tests/contract/text-cases.json
type Case = { name: string; input: string; repeat?: number; expect: { plainText?: boolean; intro?: boolean } };

const raw = readFileSync(new URL('../contract/text-cases.json', import.meta.url));
const { cases } = JSON.parse(raw.toString('utf8')) as { version: number; cases: Case[] };

describe('casi condivisi', () => {
  it('il file è tutto ASCII', () => expect([...raw].every((b) => b < 0x80)).toBe(true));
  it('src/lib/text.ts non ha caratteri speciali letterali (le classi usano gli escape)', () => {
    // Ammessi ASCII stampabile, a capo e lettere accentate dei commenti e dei messaggi.
    const src = readFileSync(new URL('../../src/lib/text.ts', import.meta.url), 'utf8');
    expect([...src].filter((ch) => !/[\u0020-\u007E\n]|\p{L}/u.test(ch))).toEqual([]);
  });
  it('plainText falso implica intro falso', () => {
    for (const c of cases) if (c.expect.plainText === false) expect(c.expect.intro).toBe(false);
  });
  for (const c of cases) {
    const input = c.input.repeat(c.repeat ?? 1);
    if (c.expect.plainText !== undefined)
      it(`plainText: ${c.name}`, () => expect(plainText.safeParse(input).success).toBe(c.expect.plainText));
    if (c.expect.intro !== undefined)
      it(`intro: ${c.name}`, () => expect(introText.safeParse(input).success).toBe(c.expect.intro));
  }
});
