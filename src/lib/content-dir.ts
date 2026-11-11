import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Esito dello spike (2026-11-11): glob({ base: contentDir() }) con CONTENT_DIR
// assoluto fuori dal repo funziona in `astro build` (collezione con 1 voce
// letta correttamente). Si usa quindi contentDir() ovunque, senza sync-content.
//
// Nel codice impacchettato dalla build (dist/.prerender/chunks) `import.meta.url`
// non è più in src/lib: si risale fino alla cartella che contiene example-content.
function findEngineRoot(from: string): string {
  let dir = dirname(from);
  for (;;) {
    if (existsSync(join(dir, 'example-content'))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(dirname(from), '../..');
    dir = up;
  }
}
export const engineRoot = findEngineRoot(fileURLToPath(import.meta.url));

// Cartella dei contenuti: CONTENT_DIR risolto rispetto alla cwd, altrimenti
// l'example-content del motore. cwd e env sono parametri per poterla testare.
export function contentDir(
  cwd: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = env.CONTENT_DIR;
  if (fromEnv) return resolve(cwd, fromEnv);
  return resolve(engineRoot, 'example-content');
}
