// Completamento con Tab: comandi per la prima parola, percorsi per le altre.
import { findByPath, resolvePath, type FsNode } from '../lib/fs-tree';
import { COMMANDS } from './shell';

const commonPrefix = (xs: string[]) =>
  xs.reduce((p, x) => {
    let i = 0;
    while (i < p.length && p[i] === x[i]) i++;
    return p.slice(0, i);
  });

export function complete(root: FsNode, cwd: string, line: string): { line: string; options: string[] } {
  // Si completa l'ultima parola dell'ultimo comando della catena `&&`
  const amp = line.lastIndexOf('&&');
  const segStart = amp < 0 ? 0 : amp + 2;
  const segment = line.slice(segStart);
  const wordStart = segStart + Math.max(segment.lastIndexOf(' '), segment.lastIndexOf('\t')) + 1;
  const word = line.slice(wordStart);
  const isCommand = line.slice(segStart, wordStart).trim() === '';

  let prefix = ''; // parte del percorso già scritta fino all'ultima barra
  let candidates: string[];
  if (isCommand) {
    candidates = COMMANDS.filter((c) => c.startsWith(word));
  } else {
    const slash = word.lastIndexOf('/');
    prefix = word.slice(0, slash + 1);
    const base = word.slice(slash + 1);
    // resolvePath tratta '' come la radice: senza prefisso si parte dalla cartella attuale
    const dir = prefix ? resolvePath(root, cwd, prefix) : findByPath(root, cwd);
    if (!dir || dir.type !== 'dir') return { line, options: [] };
    candidates = (dir.children ?? [])
      .filter((c) => c.name.startsWith(base))
      .map((c) => (c.type === 'dir' ? `${c.name}/` : c.name));
  }

  if (candidates.length === 0) return { line, options: [] };
  const head = line.slice(0, wordStart) + prefix;
  if (candidates.length === 1) return { line: head + candidates[0], options: [] };
  return { line: head + commonPrefix(candidates), options: candidates };
}
