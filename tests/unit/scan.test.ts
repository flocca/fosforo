import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scanFolders } from '../../src/lib/scan';

const dirs: string[] = [];
async function tree(files: Record<string, string>, emptyDirs: string[] = []): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fosforo-scan-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  for (const d of emptyDirs) await mkdir(join(dir, d), { recursive: true });
  return dir;
}
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

describe('scanFolders', () => {
  it('separa pagine, canzoni e messaggi', async () => {
    const dir = await tree(
      {
        'canzoni/2026-11-10.md': 'canzone',
        'canzoni/leggimi.md': 'nota canzoni',
        'canzoni/.nascosta.md': 'x',
        'canzoni/README.md': 'x',
        'canzoni/foto.jpg': 'x',
        'messaggi/leggimi.md': 'nota messaggi',
        'messaggi/2026-01-05-prova/index.md': 'post',
        'messaggi/.nascosto/index.md': 'x',
      },
      ['messaggi/vuota'],
    );
    const r = await scanFolders(dir);
    expect(r.folderFiles).toEqual([
      { file: 'canzoni/leggimi.md', raw: 'nota canzoni' },
      { file: 'messaggi/leggimi.md', raw: 'nota messaggi' },
    ]);
    expect(r.songNames).toEqual(['2026-11-10']);
    expect(r.postFolders).toEqual(['2026-01-05-prova']);
  });

  it('segue i collegamenti simbolici, come i glob delle collezioni', async () => {
    const outside = await tree({ 'nota.md': 'nota collegata', 'canzone.md': 'canzone', 'post/index.md': 'post' });
    const dir = await tree({ 'canzoni/.tieni': '', 'messaggi/.tieni': '' });
    await symlink(join(outside, 'nota.md'), join(dir, 'canzoni/collegata.md'));
    await symlink(join(outside, 'canzone.md'), join(dir, 'canzoni/2026-11-10.md'));
    await symlink(join(outside, 'post'), join(dir, 'messaggi/2026-01-05-prova'));
    const r = await scanFolders(dir);
    expect(r.folderFiles).toEqual([{ file: 'canzoni/collegata.md', raw: 'nota collegata' }]);
    expect(r.songNames).toEqual(['2026-11-10']);
    expect(r.postFolders).toEqual(['2026-01-05-prova']);
  });

  it('cartelle assenti: liste vuote', async () => {
    const dir = await tree({ 'site.yaml': 'x' });
    expect(await scanFolders(dir)).toEqual({ folderFiles: [], songNames: [], postFolders: [] });
  });

  it('radice e cartelle dichiarate a ogni profondità, senza girare in tondo', async () => {
    const dir = await tree({
      'leggimi.md': 'radice',
      'README.md': 'x',
      '.bozza.md': 'x',
      'site.yaml': 'x',
      'firebase.json': '{}',
      'documenti/a.md': 'a',
      'documenti/sotto/b.md': 'b',
      'documenti/foto.jpg': 'jpg',
      'documenti/.privata/x.md': 'x',
      'docs/piano.md': 'privato',
    });
    await symlink(dir, join(dir, 'documenti/giro'));
    const r = await scanFolders(dir, ['documenti', 'assente']);
    const files = r.folderFiles.map((f) => f.file).sort();
    expect(files).toEqual(['documenti/a.md', 'documenti/foto.jpg', 'documenti/sotto/b.md', 'leggimi.md']);
    expect(r.folderFiles.find((f) => f.file === 'documenti/foto.jpg')).toEqual({ file: 'documenti/foto.jpg' });
    expect(r.folderFiles.find((f) => f.file === 'documenti/sotto/b.md')?.raw).toBe('b');
    expect(r.folderFiles.find((f) => f.file === 'leggimi.md')?.raw).toBe('radice');
  });
});
