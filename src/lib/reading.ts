// Calcoli sulla lettura: barre di avanzamento, totali giornalieri e settimanali.
import type { Book } from './schema';
import { addDays, formatDate, weekStart, weekdayIndex } from './dates';

export function progressBar(p: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(p * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function dailyTotals(books: Book[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const b of books) for (const d of b.days) totals.set(d.date, (totals.get(d.date) ?? 0) + d.seconds);
  return totals;
}

export function lastDays(totals: Map<string, number>, endDate: string, n: number): { date: string; seconds: number }[] {
  const out: { date: string; seconds: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    out.push({ date, seconds: totals.get(date) ?? 0 });
  }
  return out;
}

export function lastWeeks(totals: Map<string, number>, endDate: string, n: number): { weekStart: string; seconds: number }[] {
  const perWeek = new Map<string, number>();
  for (const [date, seconds] of totals) {
    const w = weekStart(date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + seconds);
  }
  const last = weekStart(endDate);
  const out: { weekStart: string; seconds: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const w = addDays(last, -7 * i);
    out.push({ weekStart: w, seconds: perWeek.get(w) ?? 0 });
  }
  return out;
}

// Barra lunga `width` caratteri (completata da spazi); un valore > 0 mostra almeno un blocco.
export function bar(seconds: number, max: number, width: number): string {
  let filled = max > 0 ? Math.round((seconds / max) * width) : 0;
  if (seconds > 0 && max > 0 && filled === 0) filled = 1;
  filled = Math.min(width, filled);
  return '█'.repeat(filled) + ' '.repeat(width - filled);
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const BAR_WIDTH = 11;
const row = (label: string, seconds: number, max: number) =>
  `${label}  ${bar(seconds, max, BAR_WIDTH)} ${(seconds > 0 ? formatDuration(seconds) : '-').padStart(11)}`;

// Righe di testo del ritmo di lettura (34 colonne esatte).
export function dailyRows(totals: Map<string, number>, endDate: string, n: number): string[] {
  const days = lastDays(totals, endDate, n);
  const max = Math.max(...days.map((d) => d.seconds));
  return days.map((d) => row(`${WEEKDAYS[weekdayIndex(d.date)]} ${formatDate(d.date).slice(0, 5)}`, d.seconds, max));
}

export function weeklyRows(totals: Map<string, number>, endDate: string, n: number): string[] {
  const weeks = lastWeeks(totals, endDate, n);
  const max = Math.max(...weeks.map((w) => w.seconds));
  return weeks.map((w) => row(`dal ${formatDate(w.weekStart).slice(0, 5)}`, w.seconds, max));
}
