// Pagine scritte a mano dentro le cartelle (zona libera): un errore non blocca la build, lascia un avviso.
import { parse } from 'yaml';
import { PAGE_NAME } from './claims';
import { pageSchema, type Page } from './schema';
import { obsidianSyntax } from './text';

export type Warning = { file: string; message: string };
export type FolderPage = { dir: string; name: string; data: Page; body: string };

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(\r?\n|$)/;
const FALLBACK = 'mostrato con il nome del file come titolo';

// `file` è relativo alla cartella dei contenuti, es. `canzoni/leggimi.md`.
// `onInvalid: 'skip'` (pagine alla radice): una pagina sbagliata si salta invece di mostrarla così com'è.
export function parseFolderPage(
  file: string,
  raw: string,
  onInvalid: 'fallback' | 'skip' = 'fallback',
): { page?: FolderPage; warnings: Warning[] } {
  const parts = file.split('/');
  const dir = parts.slice(0, -1).join('/');
  const name = (parts.at(-1) ?? '').replace(/\.md$/, '');
  if (!PAGE_NAME.test(name)) {
    return {
      warnings: [{ file, message: 'nome non valido, serve kebab-case con una lettera all\'inizio (es. leggimi): pagina saltata' }],
    };
  }

  const text = raw.replace(/^﻿/, '');
  const match = FRONTMATTER.exec(text);
  const body = match ? text.slice(match[0].length) : text;
  const fallback = (reason: string): { page?: FolderPage; warnings: Warning[] } =>
    onInvalid === 'skip'
      ? { warnings: [{ file, message: `${reason}: pagina saltata` }] }
      : { page: { dir, name, data: { title: name }, body }, warnings: [{ file, message: `${reason}, ${FALLBACK}` }] };

  if (!match) return fallback('frontmatter assente o senza la riga --- di chiusura');
  let yaml: unknown;
  try {
    yaml = parse(match[1] ?? '');
  } catch {
    return fallback('frontmatter illeggibile');
  }
  const parsed = pageSchema.safeParse(yaml);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
    return fallback(`frontmatter non valido (${issues.join('; ')})`);
  }
  const obsidian = obsidianSyntax(body);
  if (obsidian) return fallback(`sintassi Obsidian non supportata: ${obsidian}`);
  return { page: { dir, name, data: parsed.data, body }, warnings: [] };
}
