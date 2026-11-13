// Albero dei file del terminale: puro, usato sia in build sia nel browser.
import type { Block, Span } from './blocks';

export type FsNode = {
  name: string;
  path: string; // '' per la radice, 'canzoni', 'canzoni/2026-11-10'
  type: 'dir' | 'file' | 'alias' | 'link';
  title?: string;
  target?: string; // alias: percorso di destinazione; link: URL esterno
  children?: FsNode[];
  section?: 'head' | 'tail'; // pagine prima ('head') o dopo ('tail') l'archivio; assente = archivio
};

function normalizeParts(path: string): string[] {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out;
}

// Percorso senza `.`, `..` e barre in più: `canzoni/../canzoni/x/` -> `canzoni/x`.
export const normalizePath = (path: string): string => normalizeParts(path).join('/');

export function findByPath(root: FsNode, path: string): FsNode | null {
  let node = root;
  for (const part of normalizeParts(path)) {
    const next = node.type === 'dir' ? node.children?.find((c) => c.name === part) : undefined;
    if (!next) return null;
    node = next;
  }
  return node;
}

export function resolvePath(root: FsNode, cwd: string, arg: string): FsNode | null {
  const a = arg.trim();
  if (a === '' || a === '~' || a === '/') return root;
  const absolute = a.startsWith('/') || a.startsWith('~/');
  const base = absolute ? '' : cwd;
  return findByPath(root, `${base}/${a.replace(/^~?\//, '')}`);
}

// Una riga vuota dove cambia la sezione (pagine, archivio, altre pagine): l'ordine lo decide la build.
export function listing(node: FsNode): Block[] {
  const out: Block[] = [];
  let prev: FsNode | undefined;
  for (const child of node.children ?? []) {
    if (prev && prev.section !== child.section) out.push({ type: 'blank' });
    out.push(line(child));
    prev = child;
  }
  return out;
}

function line(child: FsNode): Block {
  const spans: Span[] = [];
  if (child.type === 'link') {
    spans.push({ text: child.name, href: child.target });
  } else if (child.type === 'dir') {
    spans.push({ text: `${child.name}/`, cmd: `cd /${child.path} && ls` });
  } else {
    spans.push({ text: child.name, cmd: `cat /${child.path}` });
  }
  if (child.title) spans.push({ text: `  ${child.title}`, style: 'dim' });
  return { type: 'line', spans };
}
