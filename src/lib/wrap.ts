// A capo a parole per le righe del terminale, nel browser: gli attributi dei span restano.
import type { Block, Line, Span } from './blocks';

type Piece = Span;
const sameAttrs = (a: Span, b: Span) => a.style === b.style && a.cmd === b.cmd && a.href === b.href;
const attrs = (s: Span): Omit<Span, 'text'> => {
  const { text: _t, ...rest } = s;
  return rest;
};

function push(line: Span[], text: string, from: Span) {
  if (!text) return;
  const last = line[line.length - 1];
  if (last && sameAttrs(last, from)) last.text += text;
  else line.push({ text, ...attrs(from) });
}

const len = (frags: Piece[]) => frags.reduce((n, f) => n + f.text.length, 0);

function wrapLine(spans: Span[], cols: number): Line[] {
  // Parole = sequenze di frammenti senza spazi; gli spazi sono token a parte.
  type Token = { space: boolean; frags: Piece[] };
  const tokens: Token[] = [];
  for (const s of spans) {
    for (const part of s.text.split(/(\s+)/)) {
      if (!part) continue;
      const space = /^\s+$/.test(part);
      const last = tokens[tokens.length - 1];
      if (last && last.space === space) last.frags.push({ ...s, text: part });
      else tokens.push({ space, frags: [{ ...s, text: part }] });
    }
  }

  const out: Line[] = [];
  let cur: Span[] = [];
  let width = 0;
  const flush = () => {
    out.push({ type: 'line', spans: cur });
    cur = [];
    width = 0;
  };

  let pendingSpace: Piece[] | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.space) {
      if (width === 0 && out.length === 0 && cur.length === 0) {
        // Indentazione iniziale della riga: si conserva
        for (const f of t.frags) push(cur, f.text, f);
        width += len(t.frags);
      } else {
        pendingSpace = t.frags;
      }
      continue;
    }
    const wordLen = len(t.frags);
    const spaceLen = pendingSpace ? len(pendingSpace) : 0;
    if (width + spaceLen + wordLen <= cols) {
      if (pendingSpace && width > 0) for (const f of pendingSpace) push(cur, f.text, f);
      width += (width > 0 ? spaceLen : 0) + wordLen;
      for (const f of t.frags) push(cur, f.text, f);
    } else if (wordLen <= cols) {
      if (width > 0) flush();
      for (const f of t.frags) push(cur, f.text, f);
      width = wordLen;
    } else {
      // Parola più lunga di cols: spezzata a forza, riempiendo prima la riga corrente
      if (width + spaceLen >= cols || width > 0 && cols - width - spaceLen < 8) {
        if (width > 0) flush();
      } else if (pendingSpace && width > 0) {
        for (const f of pendingSpace) push(cur, f.text, f);
        width += spaceLen;
      }
      for (const f of t.frags) {
        let rest = f.text;
        while (rest) {
          if (width >= cols) flush();
          const take = rest.slice(0, cols - width);
          push(cur, take, f);
          width += take.length;
          rest = rest.slice(take.length);
        }
      }
    }
    pendingSpace = null;
  }
  if (cur.length || out.length === 0) flush();
  return out;
}

export function wrapBlocks(blocks: Block[], cols: number): Line[] {
  const out: Line[] = [];
  for (const b of blocks) {
    if (b.type === 'image') out.push(b);
    else if (b.type === 'blank') out.push({ type: 'line', spans: [] });
    else out.push(...wrapLine(b.spans, cols));
  }
  return out;
}
