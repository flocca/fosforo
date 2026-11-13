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
