// Markdown (mdast) -> blocchi del terminale.
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Block, Span } from './blocks';

type Node = ReturnType<typeof fromMarkdown>['children'][number] | { type: string; [k: string]: any };
type Sizes = Record<string, { width: number; height: number }>;
// `isDir`: dice se un percorso interno (senza barra iniziale) è una cartella dell'albero,
// così un link a una cartella diventa `cd /x && ls` invece di `cat /x`.
type Opts = { imageBase: string; sizes?: Sizes; isDir?: (path: string) => boolean };
type Style = Span['style'];

const MAX_WIDTH = 640;
const FALLBACK = { width: MAX_WIDTH, height: 360 };
const BLANK: Block = { type: 'blank' };

const stemOf = (url: string) => {
  const file = decodeURIComponent(url.split(/[?#]/)[0]).split('/').pop() ?? url;
  return file.replace(/\.[^.]+$/, '');
};

// Link interno -> comando del terminale: cartella `cd /x && ls`, altrimenti `cat /x`.
export function internalCmd(url: string, opts: { isDir?: (path: string) => boolean }): string {
  const path = url.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  if (opts.isDir?.(path)) return path ? `cd /${path} && ls` : 'cd / && ls';
  return `cat ${url}`;
}

const plain = (n: any): string =>
  typeof n.value === 'string' ? n.value : (n.children ?? []).map(plain).join('');

// Contenuto inline di un paragrafo o titolo: righe di span, con le immagini come blocchi.
function inline(nodes: Node[], opts: Opts, base: Style = undefined): Block[] {
  const blocks: Block[] = [];
  let spans: Span[] = [];
  const flush = () => {
    if (spans.length) blocks.push({ type: 'line', spans });
    spans = [];
  };
  const add = (text: string, extra: Partial<Span> = {}, style: Style = base) => {
    if (!text) return;
    spans.push({ text, ...(style ? { style } : {}), ...extra });
  };
  const walk = (list: Node[], style: Style) => {
    for (const n of list as any[]) {
      switch (n.type) {
        case 'text':
          add(String(n.value).replace(/\n/g, ' '), {}, style);
          break;
        case 'strong':
        case 'emphasis':
          walk(n.children, 'bold');
          break;
        case 'inlineCode':
          add(n.value, {}, 'inverse');
          break;
        case 'break':
          flush();
          break;
        case 'link': {
          const url: string = n.url;
          const extra: Partial<Span> = url.startsWith('/') && !url.startsWith('//') ? { cmd: internalCmd(url, opts) } : { href: url };
          const before = spans.length;
          walk(n.children, style);
          for (let i = before; i < spans.length; i++) Object.assign(spans[i], extra);
          break;
        }
        case 'image': {
          flush();
          const stem = stemOf(n.url);
          const size = opts.sizes?.[stem] ?? FALLBACK;
          blocks.push({ type: 'image', src: `${opts.imageBase}/${stem}.png`, alt: n.alt ?? '', width: size.width, height: size.height });
          break;
        }
        default:
          add(plain(n), {}, style);
      }
    }
  };
  walk(nodes, base);
  flush();
  return blocks;
}

function prefixed(blocks: Block[], first: Span[], rest: Span[]): Block[] {
  let isFirst = true;
  return blocks.map((b) => {
    if (b.type !== 'line') return b;
    const p = isFirst ? first : rest;
    isFirst = false;
    return { type: 'line', spans: [...p.map((s) => ({ ...s })), ...b.spans] };
  });
}

function blockNode(n: any, opts: Opts): Block[] {
  switch (n.type) {
    case 'heading': {
      const b = inline(n.children, opts, 'bold');
      return b.map((x) => (x.type === 'line' ? { ...x, spans: x.spans.map((s) => ({ ...s, text: s.text.toUpperCase() })) } : x));
    }
    case 'paragraph':
      return inline(n.children, opts);
    case 'list': {
      const out: Block[] = [];
      (n.children as any[]).forEach((item, i) => {
        const marker = n.ordered ? `${(n.start ?? 1) + i}. ` : '• ';
        const inner = children(item.children, opts, false);
        out.push(...prefixed(inner, [{ text: `  ${marker}` }], [{ text: ' '.repeat(marker.length + 2) }]));
      });
      return out;
    }
    case 'blockquote':
      return children(n.children, opts, false).map((b) =>
        b.type === 'line' ? { type: 'line', spans: [{ text: '> ', style: 'dim' }, ...b.spans] } : b,
      );
    case 'code':
      return String(n.value).split('\n').map((t): Block => ({ type: 'line', spans: [{ text: t }] }));
    case 'thematicBreak':
      return [{ type: 'line', spans: [{ text: '────────', style: 'dim' }] }];
    default: {
      const t = plain(n);
      return t ? [{ type: 'line', spans: [{ text: t }] }] : [];
    }
  }
}

function children(nodes: any[], opts: Opts, spaced: boolean): Block[] {
  const out: Block[] = [];
  for (const n of nodes) {
    const b = blockNode(n, opts);
    if (!b.length) continue;
    if (spaced && out.length) out.push(BLANK);
    out.push(...b);
  }
  return out;
}

export function markdownToBlocks(md: string, opts: Opts): Block[] {
  return children(fromMarkdown(md).children, opts, true);
}
