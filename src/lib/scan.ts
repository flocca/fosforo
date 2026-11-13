// Lettore delle cartelle dei contenuti (solo in build): i `.md` che diventano pagine e i file dei gestori tipizzati.
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { FOLDER_PAGE_DIRS, isIgnoredName, isSongFile } from './claims';

export type Scan = {
  folderFiles: { file: string; raw: string }[];
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

export async function scanFolders(dir: string): Promise<Scan> {
  const out: Scan = { folderFiles: [], songNames: [], postFolders: [] };
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
