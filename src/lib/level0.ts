// Livello 0: i blocchi del terminale come HTML statico (crawler e visitatori senza JavaScript).
import type { Block, Line, Span } from './blocks';
import { wrapBlocks } from './wrap';

export const COLUMNS = 72;

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `cat /x` -> `/x`; `cd /x && ls` -> `/x`; la radice -> `/`. Senza URL, null.
export function cmdToUrl(cmd: string): string | null {
  const m = /^(?:cat|cd)\s+(\S+)/.exec(cmd.trim());
  if (!m) return null;
  const url = '/' + m[1].replace(/^~?\//, '').replace(/\/+$/, '');
  return url === '/' || url === '//' ? '/' : url;
}

function spanHtml(s: Span): string {
  let html = escapeHtml(s.text);
  if (s.style) html = `<span class="${s.style}">${html}</span>`;
  if (s.cmd) {
    const url = cmdToUrl(s.cmd);
    if (url) html = `<a href="${escapeHtml(url)}">${html}</a>`;
  } else if (s.href) {
    // mailto: apre il programma di posta, non una scheda vuota
    const blank = s.href.startsWith('mailto:') ? '' : ' rel="noopener" target="_blank"';
    html = `<a href="${escapeHtml(s.href)}"${blank}>${html}</a>`;
  }
  return html;
}

function lineHtml(l: Line): string {
  if (l.type === 'image') {
    return `<span class="ph-img"><img src="${escapeHtml(l.src)}" alt="${escapeHtml(l.alt)}" width="${l.width}" height="${l.height}" loading="lazy" decoding="async"></span>`;
  }
  return l.spans.map(spanHtml).join('');
}

export function level0Html(prompt: Span[], blocks: Block[], cols: number = COLUMNS): string {
  const promptHtml = prompt.map(spanHtml).join('');
  return [promptHtml, ...wrapBlocks(blocks, cols).map(lineHtml)].join('\n');
}

// Riga di comando che il livello 0 mostra per un percorso.
export function promptCommand(path: string, isDir: boolean): string {
  if (path === '') return 'ls';
  return isDir ? `cd /${path} && ls` : `cat /${path}`;
}
