// Più registrazioni brevi in un file solo, separate da silenzio: i pezzi si ritrovano
// dopo la decodifica cercando il silenzio, non con tempi scritti a mano. Così un ritardo
// del codificatore (l'AAC aggiunge campioni all'inizio) non sposta gli attacchi.

export type Segment = { start: number; end: number };

/**
 * Pezzi sopra la soglia, in secondi. Un buco più corto di `minGapS` resta dentro il pezzo
 * (le pause fra due scatti dello stesso suono); il silenzio fra i pezzi è più lungo.
 */
export function findSegments(data: Float32Array, sampleRate: number, thresholdDb = -60, minGapS = 0.04): Segment[] {
  const th = 10 ** (thresholdDb / 20);
  const gap = Math.round(minGapS * sampleRate);
  const out: Segment[] = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) < th) continue;
    if (start >= 0 && i - last > gap) {
      out.push({ start: start / sampleRate, end: (last + 1) / sampleRate });
      start = -1;
    }
    if (start < 0) start = i;
    last = i;
  }
  if (start >= 0) out.push({ start: start / sampleRate, end: (last + 1) / sampleRate });
  return out;
}
