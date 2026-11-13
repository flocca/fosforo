// Cornice di ricezione: riempie e allinea le righe del modello `reception` di site.yaml.
// Modulo puro: niente store, render o node:fs.

export const STAMP_PLACEHOLDERS = ['data'] as const;
export const MESSAGE_PLACEHOLDERS = ['data', 'ora', 'byte', 'controllo', 'allegati'] as const;
export type Placeholder = (typeof MESSAGE_PLACEHOLDERS)[number];
export const MAX_COLUMNS = 34;

export type ReceptionRow = { label: string; value: string; link?: string };
export type ReceptionValues = Partial<Record<Placeholder, string>>;
export type FilledRow = { lead: string; value: string; link?: string };

const PLACEHOLDER = /\{(\w+)\}/g;

export function placeholdersIn(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

// Colonna del valore: etichetta più lunga + spazio, almeno quattro puntini, spazio.
export function valueColumn(rows: ReceptionRow[]): number {
  return Math.max(0, ...rows.map((r) => r.label.length)) + 6;
}

export function fillRow(row: ReceptionRow, values: ReceptionValues, column: number, where: string): FilledRow | null {
  let missing = false;
  const value = row.value.replace(PLACEHOLDER, (_, name: string) => {
    const v = values[name as Placeholder];
    if (v === undefined) {
      missing = true;
      return '';
    }
    return v;
  });
  if (missing) return null;
  const lead = `${row.label} ${'.'.repeat(column - row.label.length - 2)} `;
  const text = lead + value;
  if (text.length > MAX_COLUMNS) throw new Error(`${where}: la riga "${text}" supera ${MAX_COLUMNS} colonne`);
  return row.link === undefined ? { lead, value } : { lead, value, link: row.link };
}
