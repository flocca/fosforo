// Chi prende cosa nelle cartelle dei contenuti: i glob delle collezioni Astro e i predicati equivalenti.
// Il lettore delle cartelle e le collezioni devono dare gli stessi file, lo verifica `checkClaims`.

export const SONG_GLOB = 'canzoni/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md';
export const POST_GLOB = 'messaggi/*/index.md';

// Cartelle in cui un `.md` che nessun gestore prende diventa una pagina.
export const FOLDER_PAGE_DIRS = ['canzoni', 'messaggi'] as const;

// Nome di una pagina in una cartella: kebab-case con una lettera all'inizio (non si confonde con date e anni).
export const PAGE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const SONG_FILE = /^\d{4}-\d{2}-\d{2}\.md$/;
const IGNORED = new Set(['README.md', 'CLAUDE.md', 'AGENTS.md']);

export const isSongFile = (name: string) => SONG_FILE.test(name);

export const isIgnoredName = (name: string) => name.startsWith('.') || IGNORED.has(name);

// I file che il lettore attribuisce a un gestore devono essere quelli della collezione, né più né meno.
export function checkClaims(what: string, scanned: string[], collected: string[]): void {
  const s = new Set(scanned);
  const c = new Set(collected);
  const onlyScanned = [...s].filter((n) => !c.has(n)).sort();
  const onlyCollected = [...c].filter((n) => !s.has(n)).sort();
  if (!onlyScanned.length && !onlyCollected.length) return;
  const parts: string[] = [];
  if (onlyScanned.length) parts.push(`sul disco ma non nella collezione: ${onlyScanned.join(', ')}`);
  if (onlyCollected.length) parts.push(`nella collezione ma non sul disco: ${onlyCollected.join(', ')}`);
  // Di solito è un nome che la collezione riscrive (maiuscole, spazi, accenti).
  throw new Error(
    `fosforo: ${what}: i file non coincidono (${parts.join('; ')}). I nomi vanno scritti con minuscole, cifre e trattini.`,
  );
}
