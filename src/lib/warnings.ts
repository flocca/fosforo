// Avvisi della build (zona libera): una riga per avviso, e sotto GitHub Actions anche un'annotazione sulla PR.
import type { Warning } from './folder-page';

// Caratteri speciali dei workflow command di GitHub.
const escData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s: string) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function formatWarnings(warnings: Warning[], env: Record<string, string | undefined>): string[] {
  const gh = env.GITHUB_ACTIONS === 'true';
  return warnings.flatMap((w) => [
    `fosforo: avviso: ${w.file}: ${w.message}`,
    ...(gh ? [`::warning file=${escProp(w.file)}::${escData(w.message)}`] : []),
  ]);
}

// Con FOSFORO_STRICT=1 (le build delle pull request) un avviso ferma la build: chi scrive vede gli errori prima del merge.
export function strictError(warnings: Warning[], env: Record<string, string | undefined>): Error | null {
  if (env.FOSFORO_STRICT !== '1' || !warnings.length) return null;
  const n = warnings.length;
  return new Error(`fosforo: ${n} ${n === 1 ? 'avviso' : 'avvisi'} con FOSFORO_STRICT=1: la build si ferma`);
}
