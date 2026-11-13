// Lettore delle cartelle dei contenuti (solo in build): i `.md` che diventano pagine e i file dei gestori tipizzati.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FOLDER_PAGE_DIRS, isIgnoredName, isSongFile } from './claims';

export type Scan = {
  folderFiles: { file: string; raw: string }[];
  songNames: string[]; // nomi senza `.md` dei file canzone in `canzoni/`
  postFolders: string[]; // sottocartelle di `messaggi/` con un `index.md`
};

const entries = async (dir: string) =>
  (await readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

export async function scanFolders(dir: string): Promise<Scan> {
  const out: Scan = { folderFiles: [], songNames: [], postFolders: [] };
  for (const folder of FOLDER_PAGE_DIRS) {
    for (const e of await entries(join(dir, folder))) {
      // Come i glob delle collezioni: i nomi col punto non li prende nessuno.
      if (isIgnoredName(e.name)) continue;
      if (e.isFile() && e.name.endsWith('.md')) {
        if (folder === 'canzoni' && isSongFile(e.name)) out.songNames.push(e.name.slice(0, -3));
        else out.folderFiles.push({ file: `${folder}/${e.name}`, raw: await readFile(join(dir, folder, e.name), 'utf8') });
      } else if (folder === 'messaggi' && e.isDirectory()) {
        const inside = await entries(join(dir, folder, e.name));
        if (inside.some((f) => f.isFile() && f.name === 'index.md')) out.postFolders.push(e.name);
      }
    }
  }
  return out;
}
