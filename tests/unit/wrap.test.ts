import { describe, expect, it } from 'vitest';
import { wrapBlocks } from '../../src/lib/wrap';
import type { Block } from '../../src/lib/blocks';

const line = (...spans: { text: string; style?: 'dim' | 'bold' | 'inverse'; href?: string }[]): Block => ({ type: 'line', spans });
const text = (l: any) => l.spans.map((s: any) => s.text).join('');

describe('wrapBlocks', () => {
  it('manda a capo alle parole', () => {
    const out = wrapBlocks([line({ text: 'aaa bbb ccc' })], 7);
    expect(out.map(text)).toEqual(['aaa bbb', 'ccc']);
  });
  it('spezza un URL lungo mantenendo href', () => {
    const url = 'https://example.com/' + 'a'.repeat(30);
    expect(url.length).toBe(50);
    const out = wrapBlocks([line({ text: url, href: url })], 34) as any[];
    expect(out).toHaveLength(2);
    for (const l of out) expect(l.spans.every((s: any) => s.href === url)).toBe(true);
    expect(out.map(text).join('')).toBe(url);
  });
  it('un grassetto spezzato mantiene lo stile', () => {
    const out = wrapBlocks([line({ text: 'pre ' }, { text: 'uno due tre', style: 'bold' })], 8) as any[];
    expect(out.length).toBeGreaterThan(1);
    for (const l of out) for (const s of l.spans) if (s.text.trim() && !s.text.startsWith('pre')) expect(s.style).toBe('bold');
  });
  it('nessuna riga supera cols', () => {
    const blocks: Block[] = [
      line({ text: '  • un elemento di lista abbastanza lungo ' }, { text: 'x'.repeat(70), href: 'u' }, { text: ' fine' }),
      line({ text: 'a b c d e f g h i j k l m n o p q r s t u v w x y z' }),
    ];
    for (const cols of [10, 34, 80]) {
      for (const l of wrapBlocks(blocks, cols)) expect(text(l).length).toBeLessThanOrEqual(cols);
    }
  });
  it('blank diventa riga vuota, immagine passa invariata', () => {
    const img: Block = { type: 'image', src: '/a.png', alt: 'a', width: 1, height: 1 };
    const out = wrapBlocks([{ type: 'blank' }, img], 20);
    expect(out[0]).toEqual({ type: 'line', spans: [] });
    expect(out[1]).toEqual(img);
  });
  it('conserva l\'indentazione iniziale', () => {
    const out = wrapBlocks([line({ text: '  • ciao mondo' })], 40);
    expect(text(out[0])).toBe('  • ciao mondo');
  });
});
