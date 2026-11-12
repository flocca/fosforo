// Date come stringhe YYYY-MM-DD; l'aritmetica è in UTC per evitare scarti di fuso.
const MS_DAY = 86_400_000;

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// "dal 12/11/2026", con l'elisione davanti a un giorno che si legge con una vocale: "dall'11/11/2026".
export function fromDate(iso: string): string {
  const d = iso.slice(8, 10);
  return `${d === '01' || d === '08' || d === '11' ? "dall'" : 'dal '}${formatDate(iso)}`;
}

// Data locale del visitatore (non UTC).
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  return fromMs(toMs(iso) + n * MS_DAY);
}

// 0 = lunedì ... 6 = domenica
export function weekdayIndex(iso: string): number {
  return (new Date(toMs(iso)).getUTCDay() + 6) % 7;
}

export function weekStart(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}
