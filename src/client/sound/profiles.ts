// Profili del banco dei suoni: ognuno è un insieme coerente di voci con i loro parametri.
// I valori sono il punto di partenza per l'ascolto; quelli scelti a orecchio tornano qui
// (o in audio.ts) con "copia valori".

export type VoiceId = 'interruttore' | 'tubo' | 'smagnetizzazione' | 'ventola' | 'rete' | 'disco' | 'tasti' | 'cassa';

export const VOICES: readonly VoiceId[] = ['interruttore', 'tubo', 'smagnetizzazione', 'ventola', 'rete', 'disco', 'tasti', 'cassa'];

export type ParamDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** scelta fra valori discreti (un select invece di un cursore) */
  options?: { value: number; label: string }[];
};

export type Params = Record<string, number>;

export type DiskKind = 'otto' | 'cinque' | 'diskii';

export type ProfileId = 'cpm8' | 'ibm5150' | 'appleii' | 'vt100';

export type Profile = {
  id: ProfileId;
  name: string;
  description: string;
  /** tipo di unità a dischi; assente: niente disco (terminale) */
  disk?: DiskKind;
  /** ventola presente (l'Apple II non ne ha) */
  fan: boolean;
  /** seek dopo la ricalibrazione all'avvio (numero di passi ciascuno) */
  bootSeeks: number[];
  params: Record<VoiceId, Params>;
};

export const BUTTON_VARIANTS = [
  { value: 0, label: 'clic morbido di plastica' },
  { value: 1, label: 'scatto a ritenuta' },
  { value: 2, label: 'bilanciere' },
];

const onOff = [
  { value: 0, label: 'no' },
  { value: 1, label: 'sì' },
];

export const SCHEMA: Record<VoiceId, ParamDef[]> = {
  interruttore: [
    { key: 'level', label: 'livello', min: 0, max: 1, step: 0.01 },
    { key: 'bodyHz', label: 'corpo (Hz)', min: 80, max: 800, step: 5 },
    { key: 'bodyT60', label: 'coda del corpo (s)', min: 0.01, max: 0.25, step: 0.005 },
    { key: 'weight', label: 'peso del corpo', min: 0, max: 1, step: 0.01 },
    { key: 'bright', label: 'brillantezza (scala dei modi metallici)', min: 0.4, max: 2, step: 0.01 },
    { key: 'metalT60', label: 'coda metallica (s)', min: 0.004, max: 0.1, step: 0.001 },
    { key: 'bounces', label: 'rimbalzi del contatto', min: 0, max: 5, step: 1 },
    { key: 'bounceMs', label: 'primo rimbalzo (ms)', min: 0.3, max: 6, step: 0.1 },
  ],
  tubo: [
    { key: 'crackle', label: 'crepitio (livello)', min: 0, max: 1, step: 0.01 },
    { key: 'crackleRate', label: 'scariche al secondo', min: 10, max: 800, step: 5 },
    { key: 'crackleDur', label: 'durata del crepitio (s)', min: 0.3, max: 3, step: 0.05 },
    { key: 'hiss', label: 'soffio "fzzzt"', min: 0, max: 1, step: 0.01 },
    { key: 'whine', label: 'fischio del flyback (livello)', min: 0, max: 0.03, step: 0.0005 },
    {
      key: 'lineHz',
      label: 'frequenza di riga',
      min: 15625,
      max: 15734,
      step: 109,
      options: [
        { value: 15625, label: '15625 Hz (PAL)' },
        { value: 15734, label: '15734 Hz (NTSC)' },
      ],
    },
    { key: 'whineRise', label: 'salita del fischio (s)', min: 0.1, max: 3, step: 0.05 },
    { key: 'jitter', label: 'deriva del fischio (Hz)', min: 0, max: 40, step: 1 },
  ],
  smagnetizzazione: [
    { key: 'on', label: 'smagnetizzazione', min: 0, max: 1, step: 1, options: onOff },
    { key: 'level', label: 'livello', min: 0, max: 1, step: 0.01 },
    { key: 'decay', label: 'calo della corrente (s)', min: 0.2, max: 2.5, step: 0.05 },
    { key: 'thump', label: 'colpo iniziale', min: 0, max: 1, step: 0.01 },
    { key: 'thumpHz', label: 'colpo (Hz)', min: 50, max: 250, step: 1 },
    { key: 'buzz', label: 'ronzio a 2x rete', min: 0, max: 1, step: 0.01 },
    { key: 'ring', label: 'risonanze della maschera', min: 0, max: 1, step: 0.01 },
    { key: 'rattle', label: 'sferraglio', min: 0, max: 1, step: 0.01 },
    { key: 'maskScale', label: 'scala delle risonanze', min: 0.5, max: 2, step: 0.01 },
  ],
  ventola: [
    { key: 'level', label: 'livello', min: 0, max: 1, step: 0.01 },
    { key: 'rpm', label: 'giri al minuto', min: 600, max: 3600, step: 10 },
    { key: 'blades', label: 'pale', min: 3, max: 9, step: 1 },
    { key: 'tone', label: 'tono delle pale', min: 0, max: 1, step: 0.01 },
    { key: 'air', label: "flusso d'aria", min: 0, max: 1, step: 0.01 },
    { key: 'airHz', label: 'centro del soffio (Hz)', min: 300, max: 4000, step: 10 },
    { key: 'shaftAm', label: "sbilanciamento dell'albero", min: 0, max: 0.4, step: 0.01 },
    { key: 'wobble', label: 'variazione del flusso', min: 0, max: 0.4, step: 0.01 },
    { key: 'motorHum', label: 'ronzio del motore (2x rete)', min: 0, max: 1, step: 0.01 },
    { key: 'spinUp', label: 'tempo per prendere giri (s)', min: 0.3, max: 8, step: 0.1 },
    { key: 'spinDown', label: 'tempo per fermarsi (s)', min: 0.5, max: 12, step: 0.1 },
  ],
  rete: [
    { key: 'level', label: 'livello', min: 0, max: 0.5, step: 0.005 },
    {
      key: 'mains',
      label: 'rete',
      min: 50,
      max: 60,
      step: 10,
      options: [
        { value: 50, label: '50 Hz (Italia)' },
        { value: 60, label: '60 Hz (USA)' },
      ],
    },
    { key: 'fundamental', label: 'fondamentale (rete)', min: 0, max: 1, step: 0.01 },
    { key: 'rolloff', label: 'calo armoniche (dB/ottava)', min: 0, max: 18, step: 0.5 },
    { key: 'odd', label: 'armoniche dispari', min: 0, max: 1, step: 0.01 },
    { key: 'drive', label: 'saturazione', min: 0.3, max: 4, step: 0.05 },
    { key: 'inrush', label: 'spunto all\'accensione (x)', min: 1, max: 5, step: 0.1 },
    { key: 'inrushS', label: 'durata dello spunto (s)', min: 0.05, max: 0.8, step: 0.01 },
    { key: 'wander', label: 'variazione del livello', min: 0, max: 0.3, step: 0.01 },
  ],
  disco: [
    { key: 'level', label: 'livello', min: 0, max: 1, step: 0.01 },
    { key: 'stepTone', label: 'tono del passo (scala)', min: 0.5, max: 1.8, step: 0.01 },
    { key: 'stepT60', label: 'coda del passo (s)', min: 0.01, max: 0.15, step: 0.005 },
    { key: 'thump', label: 'colpo basso del carrello', min: 0, max: 1, step: 0.01 },
    { key: 'stepMs', label: 'intervallo tra i passi (ms)', min: 2, max: 40, step: 0.5 },
    { key: 'seekN', label: 'passi per seek', min: 1, max: 80, step: 1 },
    { key: 'settleMs', label: 'assestamento dopo il seek (ms)', min: 5, max: 80, step: 1 },
    { key: 'headLoad', label: 'solenoide di carico della testina', min: 0, max: 1, step: 0.01 },
    { key: 'motor', label: 'motore (livello)', min: 0, max: 1, step: 0.01 },
    { key: 'rotationHz', label: 'rotazione (Hz: 5 = 300 giri/min)', min: 3, max: 7, step: 0.1 },
    { key: 'motorSpinUp', label: 'avvio del motore (s)', min: 0.1, max: 2, step: 0.05 },
    { key: 'recalSteps', label: 'passi della ricalibrazione', min: 0, max: 90, step: 1 },
    { key: 'stopBang', label: 'colpi contro il fermo', min: 0, max: 1, step: 0.01 },
  ],
  tasti: [
    { key: 'level', label: 'livello', min: 0, max: 1, step: 0.01 },
    { key: 'tone', label: 'tono (scala dei modi)', min: 0.5, max: 2, step: 0.01 },
    { key: 'decay', label: 'coda (scala)', min: 0.3, max: 3, step: 0.05 },
    { key: 'latchMs', label: 'scatto: ritardo della ritenuta (ms)', min: 4, max: 60, step: 1 },
    { key: 'release', label: 'rilascio (livello)', min: 0, max: 1, step: 0.01 },
    { key: 'sound', label: 'tasto suono', min: 0, max: 2, step: 1, options: BUTTON_VARIANTS },
    { key: 'phosphor', label: 'tasto fosfori', min: 0, max: 2, step: 1, options: BUTTON_VARIANTS },
    { key: 'power', label: 'tasto accensione', min: 0, max: 2, step: 1, options: BUTTON_VARIANTS },
  ],
  cassa: [
    { key: 'wet', label: 'riverbero del mobile', min: 0, max: 0.7, step: 0.01 },
    { key: 'size', label: 'coda del mobile (s)', min: 0.04, max: 0.5, step: 0.01 },
    { key: 'resScale', label: 'risonanze del mobile (scala)', min: 0.5, max: 2, step: 0.01 },
    { key: 'lowpass', label: 'passa basso dei rumori meccanici (Hz)', min: 2000, max: 16000, step: 100 },
  ],
};

// Valori comuni; ogni profilo cambia solo quello che lo distingue.
const BASE: Record<VoiceId, Params> = {
  interruttore: { level: 0.55, bodyHz: 260, bodyT60: 0.08, weight: 0.6, bright: 1, metalT60: 0.03, bounces: 3, bounceMs: 1.6 },
  tubo: { crackle: 0.35, crackleRate: 220, crackleDur: 1.4, hiss: 0.25, whine: 0.0025, lineHz: 15625, whineRise: 0.9, jitter: 8 },
  smagnetizzazione: { on: 1, level: 0.35, decay: 0.7, thump: 0.4, thumpHz: 95, buzz: 0.25, ring: 1, rattle: 0.35, maskScale: 1 },
  ventola: { level: 0.16, rpm: 2700, blades: 7, tone: 0.3, air: 0.7, airHz: 1100, shaftAm: 0.08, wobble: 0.12, motorHum: 0.25, spinUp: 2.6, spinDown: 5 },
  rete: { level: 0.08, mains: 50, fundamental: 0.15, rolloff: 6, odd: 0.25, drive: 1.2, inrush: 2.8, inrushS: 0.22, wander: 0.08 },
  disco: { level: 0.6, stepTone: 1, stepT60: 0.05, thump: 0.5, stepMs: 8, seekN: 6, settleMs: 22, headLoad: 0, motor: 0.35, rotationHz: 5, motorSpinUp: 0.4, recalSteps: 40, stopBang: 0 },
  tasti: { level: 0.5, tone: 1, decay: 1, latchMs: 18, release: 0.55, sound: 0, phosphor: 0, power: 1 },
  cassa: { wet: 0.25, size: 0.16, resScale: 1, lowpass: 9000 },
};

function profile(p: Omit<Profile, 'params'> & { params: Partial<Record<VoiceId, Params>> }): Profile {
  const params = Object.fromEntries(VOICES.map((v) => [v, { ...BASE[v], ...(p.params[v] ?? {}) }])) as Record<VoiceId, Params>;
  return { ...p, params };
}

export const PROFILES: readonly Profile[] = [
  profile({
    id: 'cpm8',
    name: 'CP/M + floppy 8 pollici',
    description:
      'Mobile di lamiera con ventola a corrente alternata e due unità da 8 pollici (tipo Shugart SA800): motore sempre acceso, solenoide della testina che fa "clac", passi pesanti.',
    disk: 'otto',
    fan: true,
    bootSeeks: [2, 12, 1],
    params: {
      interruttore: { level: 0.6, bodyHz: 240, bodyT60: 0.11, weight: 0.75, bright: 0.85, bounces: 3, bounceMs: 2.2 },
      ventola: { rpm: 2800, blades: 5, tone: 0.32, air: 0.75, airHz: 950, motorHum: 0.35 },
      disco: { level: 0.7, stepTone: 0.8, stepT60: 0.07, thump: 0.7, stepMs: 10, headLoad: 0.8, motor: 0.45, rotationHz: 6, motorSpinUp: 0.9, recalSteps: 30, settleMs: 30 },
      cassa: { wet: 0.32, size: 0.22, resScale: 0.85, lowpass: 8500 },
    },
  }),
  profile({
    id: 'ibm5150',
    name: 'IBM PC 5150',
    description:
      'Alimentatore con ventola robusta e unità da 5,25 pollici (tipo Tandon TM100): la ricalibrazione all\'avvio fa "grrr-tac". Il grande interruttore rosso sul fianco fa un "ka-chunk" corposo.',
    disk: 'cinque',
    fan: true,
    bootSeeks: [1, 8, 2],
    params: {
      interruttore: { level: 0.65, bodyHz: 260, bodyT60: 0.1, weight: 0.8, bright: 0.9, bounces: 2, bounceMs: 2.6 },
      ventola: { level: 0.18, rpm: 3000, blades: 7, tone: 0.36, air: 0.8, airHz: 1400, shaftAm: 0.1, motorHum: 0.15, spinUp: 1.8 },
      disco: { level: 0.65, stepTone: 1, stepT60: 0.05, thump: 0.55, stepMs: 6, motor: 0.32, rotationHz: 5, motorSpinUp: 0.45, recalSteps: 40, settleMs: 20 },
      cassa: { wet: 0.28, size: 0.18, resScale: 1, lowpass: 9000 },
    },
  }),
  profile({
    id: 'appleii',
    name: 'Apple II + Disk II',
    description:
      'Nessuna ventola (famoso per il silenzio): si sentono solo il ronzio e il Disk II, con la ricalibrazione che sbatte la testina contro il fermo ("brrrrt") e i passi secchi.',
    disk: 'diskii',
    fan: false,
    bootSeeks: [1, 3, 1, 6],
    params: {
      interruttore: { level: 0.45, bodyHz: 420, bodyT60: 0.05, weight: 0.45, bright: 1.15, bounces: 2, bounceMs: 1.1 },
      tubo: { lineHz: 15734 },
      ventola: { level: 0 },
      rete: { level: 0.06 },
      disco: { level: 0.7, stepTone: 1.15, stepT60: 0.04, thump: 0.45, stepMs: 12, motor: 0.3, rotationHz: 5, motorSpinUp: 0.3, recalSteps: 80, stopBang: 0.75, settleMs: 18 },
      cassa: { wet: 0.2, size: 0.12, resScale: 1.3, lowpass: 10000 },
    },
  }),
  profile({
    id: 'vt100',
    name: 'Terminale tipo VT100',
    description:
      'Terminale con ventola e tubo monocromatico, nessun disco. Un tubo monocromatico non ha la maschera e di solito niente smagnetizzazione: qui parte spenta, si può provare.',
    fan: true,
    bootSeeks: [],
    params: {
      interruttore: { level: 0.5, bodyHz: 330, bodyT60: 0.07, weight: 0.55, bright: 1.05, bounces: 3, bounceMs: 1.4 },
      tubo: { lineHz: 15734, crackle: 0.4 },
      smagnetizzazione: { on: 0 },
      ventola: { level: 0.15, rpm: 2500, blades: 7, tone: 0.28, air: 0.65, airHz: 1000, motorHum: 0.3, spinUp: 3 },
      disco: { level: 0, motor: 0, recalSteps: 0 },
      cassa: { wet: 0.3, size: 0.2, resScale: 0.95, lowpass: 9000 },
    },
  }),
];

export function getProfile(id: string): Profile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[0];
}
