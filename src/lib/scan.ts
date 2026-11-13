// Lettore delle cartelle dei contenuti (solo in build): i `.md` che diventano pagine, i file delle cartelle
// dichiarate in site.yaml e i file dei gestori tipizzati.
import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { FOLDER_PAGE_DIRS, isIgnoredName, isSongFile } from './claims';

export type Scan = {
  // `raw` solo per i `.md`; gli altri file delle cartelle dichiarate arrivano senza, per l'avviso.
  folderFiles: { file: string; raw?: string }[];
  songNames: string[]; // nomi senza `.md` dei file canzone in `canzoni/`
  postFolders: string[]; // sottocartelle di `messaggi/` con un `index.md`
};

const entries = async (dir: string) =>
  (await readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

// File o cartella; un collegamento simbolico si segue, come fanno i glob delle collezioni.
async function kind(dir: string, e: Dirent): Promise<'file' | 'dir' | null> {
  if (e.isFile()) return 'file';
  if (e.isDirectory()) return 'dir';
  if (!e.isSymbolicLink()) return null;
  const s = await stat(join(dir, e.name)).catch(() => null);
  return s?.isFile() ? 'file' : s?.isDirectory() ? 'dir' : null;
}

// `freeFolders`: le cartelle dichiarate in `site.cartelle`, lette a ogni profondità.
export async function scanFolders(dir: string, freeFolders: string[] = []): Promise<Scan> {
  const out: Scan = { folderFiles: [], songNames: [], postFolders: [] };
  const read = (rel: string) => readFile(join(dir, rel), 'utf8');

  // Radice: solo i `.md`, mai le cartelle (il resto del repo non si pubblica).
  for (const e of await entries(dir)) {
    if (isIgnoredName(e.name) || !e.name.endsWith('.md')) continue;
    if ((await kind(dir, e)) === 'file') out.folderFiles.push({ file: e.name, raw: await read(e.name) });
  }

  // Cartelle dichiarate: ogni file a ogni profondità. Una cartella già visitata (per percorso reale) non si
  // riapre, così un collegamento simbolico che torna indietro non gira in tondo e non duplica pagine.
  const visited = new Set<string>([await realpath(dir).catch(() => dir)]);
  const walk = async (rel: string): Promise<void> => {
    const real = await realpath(join(dir, rel)).catch(() => null);
    if (real === null || visited.has(real)) return;
    visited.add(real);
    for (const e of await entries(join(dir, rel))) {
      if (isIgnoredName(e.name)) continue;
      const child = `${rel}/${e.name}`;
      const k = await kind(join(dir, rel), e);
      if (k === 'dir') await walk(child);
      else if (k === 'file') out.folderFiles.push(e.name.endsWith('.md') ? { file: child, raw: await read(child) } : { file: child });
    }
  };
  for (const folder of freeFolders) await walk(folder);

  for (const folder of FOLDER_PAGE_DIRS) {
    const base = join(dir, folder);
    for (const e of await entries(base)) {
      // Come i glob delle collezioni: i nomi col punto non li prende nessuno.
      if (isIgnoredName(e.name)) continue;
      const k = await kind(base, e);
      if (k === 'file' && e.name.endsWith('.md')) {
        if (folder === 'canzoni' && isSongFile(e.name)) out.songNames.push(e.name.slice(0, -3));
        else out.folderFiles.push({ file: `${folder}/${e.name}`, raw: await readFile(join(dir, folder, e.name), 'utf8') });
      } else if (folder === 'messaggi' && k === 'dir') {
        const index = await stat(join(base, e.name, 'index.md')).catch(() => null);
        if (index?.isFile()) out.postFolders.push(e.name);
      }
    }
  }
  return out;
}
