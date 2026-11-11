import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Esito dello spike (2026-11-11): glob({ base: contentDir() }) con CONTENT_DIR
// assoluto fuori dal repo funziona in `astro build` (collezione con 1 voce
// letta correttamente). Si usa quindi contentDir() ovunque, senza sync-content.
const engineRoot = resolve(fileURLToPath(import.meta.url), '../../..');

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
