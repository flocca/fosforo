// Generatori puri per la sintesi dei suoni: restituiscono Float32Array, senza AudioContext.
// Sono testabili in vitest e si rendono una volta sola in buffer all'apertura del contesto.
//
// Modello dei transitori meccanici (relè, interruttori, passi della testina, tasti):
// un impulso (più eventuali rimbalzi del contatto) eccita pochi modi risonanti discreti,
// ognuno una sinusoide che decade in modo esponenziale. Un rumore brevissimo aggiunge
// lo sfregamento del contatto. Le varianti cambiano i modi di qualche percento, con un seme.

export type Rng = () => number;

/** Generatore pseudo-casuale con seme (mulberry32): stesso seme, stessa sequenza. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Valore casuale in [-1, 1). */
const bi = (r: Rng) => r() * 2 - 1;

// ln(1000): un modo con `t60` scende di 60 dB in `t60` secondi
const LN1000 = Math.log(1000);

/** Un modo risonante: frequenza, tempo di decadimento a -60 dB, guadagno lineare. */
export type Mode = { hz: number; t60: number; gain: number };

/** Un colpo che eccita i modi: istante (s) e guadagno lineare. */
export type Impulse = { at: number; gain: number };

export type ClickSpec = {
  modes: Mode[];
  impulses: Impulse[];
  /** livello del rumore di sfregamento a ogni colpo */
  noise: number;
  /** decadimento a -60 dB del rumore (s) */
  noiseT60: number;
  /** variazione relativa delle frequenze tra le varianti (0.03 = ±3 %) */
  jitter: number;
};

/** Contatto con rimbalzi: il primo colpo pieno, poi `count` rimbalzi sempre più vicini e più deboli. */
export function bounces(count: number, firstGapS: number, gapRatio = 0.6, stepDb = 8): Impulse[] {
  const out: Impulse[] = [{ at: 0, gain: 1 }];
  let at = 0;
  let gap = firstGapS;
  for (let i = 1; i <= count; i++) {
    at += gap;
    out.push({ at, gain: 10 ** ((-stepDb * i) / 20) });
    gap *= gapRatio;
  }
  return out;
}

/** Durata in campioni del clic: ultimo colpo più il decadimento più lungo (rimbalzi spostati al massimo del 10 %). */
export function clickLength(spec: ClickSpec, sampleRate: number): number {
  const lastHit = Math.max(0, ...spec.impulses.map((i) => i.at)) * 1.1;
  const tail = Math.max(spec.noiseT60, ...spec.modes.map((m) => m.t60));
  return Math.ceil((lastHit + tail) * sampleRate) + 1;
}

/** Rende un clic modale. Non normalizzato: il livello segue i guadagni dei modi. */
export function renderClick(spec: ClickSpec, sampleRate: number, seed: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(clickLength(spec, sampleRate));
  const modes = spec.modes.map((m) => ({
    w: (2 * Math.PI * m.hz * (1 + bi(r) * spec.jitter)) / sampleRate,
    k: LN1000 / (m.t60 * sampleRate),
    g: m.gain * (1 + bi(r) * 0.15),
    n: Math.min(out.length, Math.ceil(m.t60 * sampleRate)),
  }));
  const nk = LN1000 / (Math.max(spec.noiseT60, 1e-4) * sampleRate);
  const nn = Math.ceil(spec.noiseT60 * sampleRate);
  spec.impulses.forEach((imp, idx) => {
    // i rimbalzi non cadono mai due volte nello stesso punto
    const at = imp.at * (idx === 0 ? 1 : 1 + bi(r) * 0.1);
    const start = Math.round(at * sampleRate);
    for (const m of modes) {
      const end = Math.min(out.length, start + m.n);
      for (let i = start; i < end; i++) {
        const t = i - start;
        out[i] += imp.gain * m.g * Math.sin(m.w * t) * Math.exp(-m.k * t);
      }
    }
    // sfregamento: rumore derivato (passa alto) che si spegne subito
    let prev = 0;
    const end = Math.min(out.length, start + nn);
    for (let i = start; i < end; i++) {
      const w = bi(r);
      out[i] += imp.gain * spec.noise * (w - prev) * 0.5 * Math.exp(-nk * (i - start));
      prev = w;
    }
  });
  return out;
}

/** `count` varianti dello stesso clic, deterministiche dato il seme. */
export function renderVariants(spec: ClickSpec, sampleRate: number, count: number, seed: number): Float32Array[] {
  return Array.from({ length: count }, (_, i) => renderClick(spec, sampleRate, seed + i * 7919));
}

/** Scala il buffer in modo che il picco valga `peak`. Un buffer muto resta muto. */
export function normalize(buf: Float32Array, peak = 1): Float32Array {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] / max) * peak;
  return buf;
}

/** Rumore rosa (filtro di Paul Kellet) con seme, normalizzato a picco 1. */
export function pinkNoise(seconds: number, sampleRate: number, seed: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sampleRate));
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = bi(r);
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  // raccordo di 50 ms agli estremi: il giro del loop non fa clic
  const fade = Math.min(out.length >> 1, Math.floor(0.05 * sampleRate));
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i] = out[i] * a + out[out.length - fade + i] * (1 - a);
  }
  return normalize(out.subarray(0, out.length - fade).slice());
}

/**
 * Variazione lenta e casuale in [-1, 1] (non un LFO): punti casuali ogni `1/rateHz` secondi
 * raccordati con il coseno. Serve per il flusso d'aria, il ronzio, la deriva del flyback.
 */
export function wander(seconds: number, sampleRate: number, rateHz: number, seed: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sampleRate));
  const step = sampleRate / rateHz;
  const points = Array.from({ length: Math.ceil(out.length / step) + 2 }, () => bi(r));
  // l'ultimo punto uguale al primo: il loop non salta
  points[points.length - 1] = points[0];
  points[points.length - 2] = points[0];
  for (let i = 0; i < out.length; i++) {
    const x = i / step;
    const k = Math.floor(x);
    const f = (1 - Math.cos(Math.PI * (x - k))) / 2;
    out[i] = points[k] * (1 - f) + points[k + 1] * f;
  }
  return out;
}

export type CrackleSpec = {
  /** durata del buffer (s) */
  duration: number;
  /** istante di massima densità (s) */
  peakAt: number;
  /** scariche al secondo al massimo */
  rate: number;
  /** durata di una scarica (s), 0.1-5 ms */
  tick: number;
  /** livello del soffio "fzzzt" mentre l'alta tensione sale */
  hiss: number;
};

/** Densità relativa (0-1) delle scariche all'istante t: sale fino a `peakAt`, poi si spegne. */
export function crackleShape(spec: CrackleSpec, t: number): number {
  if (t < 0 || t > spec.duration) return 0;
  if (t < spec.peakAt) return (t / spec.peakAt) ** 2;
  return Math.exp((-3 * (t - spec.peakAt)) / Math.max(spec.duration - spec.peakAt, 1e-3));
}

/** Crepitio dell'alta tensione (EHT): scariche sparse in 2-9 kHz, densità che sale e scende, soffio che le accompagna. */
export function renderCrackle(spec: CrackleSpec, sampleRate: number, seed: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.ceil(spec.duration * sampleRate) + 1);
  const tickN = Math.max(2, Math.round(spec.tick * sampleRate));
  // processo di Poisson con sfoltimento secondo la forma
  let t = 0;
  for (;;) {
    t += -Math.log(1 - r()) / spec.rate;
    if (t >= spec.duration) break;
    if (r() > crackleShape(spec, t)) continue;
    const amp = 10 ** (-r() * 1.6); // da 0 a -32 dB: poche forti, molte deboli
    const start = Math.floor(t * sampleRate);
    // ogni scarica è un colpetto di rumore in un risonatore a frequenza casuale (2-9 kHz)
    const bp = bandpass(2000 + r() * 7000, 1.5 + r() * 2, sampleRate);
    const len = tickN * 6;
    for (let i = 0; i < len && start + i < out.length; i++) {
      const x = i < tickN ? bi(r) * Math.exp((-4 * i) / tickN) : 0;
      out[start + i] += amp * bp(x);
    }
  }
  if (spec.hiss > 0) {
    const bp = bandpass(4500, 0.6, sampleRate);
    for (let i = 0; i < out.length; i++) out[i] += spec.hiss * bp(bi(r)) * crackleShape(spec, i / sampleRate);
  }
  return out;
}

/** Passa banda biquad (RBJ, guadagno 0 dB al centro) come funzione campione per campione. */
export function bandpass(hz: number, q: number, sampleRate: number): (x: number) => number {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

export type DegaussSpec = {
  /** frequenza di rete (Hz): la bobina vibra al doppio */
  mains: number;
  /** durata del buffer (s) */
  duration: number;
  /** costante di tempo del termistore PTC: la corrente cala come exp(-t/decay) */
  decay: number;
  /** colpo iniziale della maschera (modo basso) */
  thump: number;
  thumpHz: number;
  /** ronzio diretto a 2x rete con armoniche (saturazione) */
  buzz: number;
  /** risonanze di maschera e telaio eccitate dalla forza */
  ring: number;
  modes: Mode[];
  /** sferragliare delle parti lente, solo finché la corrente è alta */
  rattle: number;
};

/**
 * Smagnetizzazione: la forza sulla maschera è proporzionale al quadrato della corrente,
 * quindi vibra a 2x rete; la corrente cala con il PTC in 1-3 s. La forza eccita un banco
 * di risonatori disarmonici (200 Hz-3 kHz); un colpo basso all'inizio fa il "bwong".
 */
export function renderDegauss(spec: DegaussSpec, sampleRate: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.ceil(spec.duration * sampleRate);
  const out = new Float32Array(n);
  // modi della maschera e del telaio: suonano dal colpo d'avvio e restano scossi finché c'è corrente
  const modes = spec.modes.map((m) => ({
    w: (2 * Math.PI * m.hz * (1 + bi(r) * 0.02)) / sampleRate,
    k: LN1000 / (m.t60 * sampleRate),
    g: m.gain,
    ph: r() * Math.PI * 2,
  }));
  const tw = (2 * Math.PI * spec.thumpHz) / sampleRate;
  const tk = LN1000 / (0.45 * sampleRate);
  const fade = Math.floor(0.05 * sampleRate);
  let ringNorm = 0;
  for (const m of modes) ringNorm += m.g;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / spec.decay);
    const drive = env * Math.sin(2 * Math.PI * spec.mains * t);
    // forza ~ corrente²: componente a 2x rete senza la continua
    const force = drive * drive - env * env * 0.5;
    // saturazione: a corrente alta quasi un'onda quadra a 2x rete (ricca di armoniche), poi si addolcisce
    const buzz = Math.tanh(force * 6) / Math.tanh(3);
    // sferraglio: rumore che passa solo sui picchi di corrente
    const rattle = Math.abs(drive) > 0.55 ? bi(r) * (Math.abs(drive) - 0.55) : 0;
    // ogni modo: risposta al colpo d'avvio più la scossa a 2x rete (modulazione a 100/120 Hz)
    const shake = env * (0.3 + 0.7 * Math.abs(drive));
    let ring = 0;
    for (const m of modes) ring += m.g * Math.sin(m.w * i + m.ph) * (Math.exp(-m.k * i) * 0.7 + shake);
    const thump = Math.sin(tw * i) * Math.exp(-tk * i);
    let v = spec.buzz * buzz + (spec.ring * ring) / ringNorm + spec.thump * thump + spec.rattle * rattle * 0.5;
    if (i < 48) v *= i / 48; // 1 ms di attacco: niente clic digitale
    if (i > n - fade) v *= (n - i) / fade;
    out[i] = v;
  }
  return out;
}

export type CaseSpec = {
  /** durata della coda (s) */
  seconds: number;
  /** risonanze del mobile (lamiera o plastica) */
  modes: Mode[];
  /** prime riflessioni (s) */
  taps: number[];
};

/** Risposta all'impulso del mobile: rumore che decade, colorato da poche risonanze, più due riflessioni. */
export function renderCaseIR(spec: CaseSpec, sampleRate: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.ceil(spec.seconds * sampleRate);
  const out = new Float32Array(n);
  const k = LN1000 / (spec.seconds * sampleRate);
  for (let i = 0; i < n; i++) out[i] = bi(r) * Math.exp(-k * i) * 0.3;
  for (const m of spec.modes) {
    const w = (2 * Math.PI * m.hz) / sampleRate;
    const mk = LN1000 / (m.t60 * sampleRate);
    for (let i = 0; i < n; i++) out[i] += m.gain * Math.sin(w * i) * Math.exp(-mk * i);
  }
  out[0] += 1;
  spec.taps.forEach((s, j) => {
    const i = Math.round(s * sampleRate);
    if (i < n) out[i] += 0.5 / (j + 1);
  });
  return normalize(out);
}

/** Armoniche del ronzio del trasformatore, per createPeriodicWave sulla frequenza di rete. */
export type HumSpec = {
  /** livello della fondamentale a frequenza di rete (debole: la magnetostrizione è a 2x) */
  fundamental: number;
  /** pendenza delle armoniche pari dopo 2x rete, in dB per ottava */
  rolloffDb: number;
  /** armoniche dispari (3x, 5x) dal raddrizzatore, relative alla 2x */
  odd: number;
  /** armonica pari più alta (2x rete = 2) */
  maxHarmonic: number;
};

export function humHarmonics(spec: HumSpec): { real: Float32Array; imag: Float32Array } {
  const size = spec.maxHarmonic + 1;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  imag[1] = spec.fundamental;
  for (let k = 2; k < size; k++) {
    if (k % 2 === 0) imag[k] = 10 ** ((-spec.rolloffDb * Math.log2(k / 2)) / 20);
    else if (k <= 5) imag[k] = spec.odd * 10 ** ((-spec.rolloffDb * Math.log2(k / 2)) / 20);
  }
  return { real, imag };
}

/** Curva per una WaveShaper: tanh normalizzata (saturazione morbida). */
export function softClipCurve(size: number, drive: number): Float32Array {
  const out = new Float32Array(size);
  const norm = Math.tanh(drive);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    out[i] = Math.tanh(x * drive) / norm;
  }
  return out;
}

/**
 * Giri relativi (0-1) di un motore che parte da `from`: salita rapida, poi si avvicina
 * piano al regime (costante di tempo = seconds/4). In discesa (`to` < `from`) l'attrito
 * frena di più ad alti giri: la curva è più ripida all'inizio.
 */
export function spinCurve(from: number, to: number, seconds: number, points = 64): Float32Array {
  const out = new Float32Array(points);
  const tau = seconds / 4;
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * seconds;
    const k = (1 - Math.exp(-t / tau)) / (1 - Math.exp(-4));
    out[i] = from + (to - from) * k;
  }
  out[points - 1] = to;
  return out;
}

/** Valore di una curva di spinCurve all'istante t (s dall'inizio). */
export function curveAt(curve: Float32Array, seconds: number, t: number): number {
  if (t <= 0) return curve[0];
  if (t >= seconds) return curve[curve.length - 1];
  const x = (t / seconds) * (curve.length - 1);
  const k = Math.floor(x);
  return curve[k] + (curve[k + 1] - curve[k]) * (x - k);
}

/** Indice della prossima variante: a giro casuale, mai uguale alla precedente. */
export function nextVariant(count: number, last: number, r: Rng): number {
  if (count <= 1) return 0;
  const k = Math.floor(r() * (count - 1));
  return k >= last ? k + 1 : k;
}
