// Registrazioni di terzi (solo CC0 o CC BY) per il confronto nel banco dei suoni.
// I file stanno in .cache/suoni/ (fuori da git, non vanno in produzione): li scarica
// dev/scarica-suoni.sh. Da Freesound senza account si scarica solo l'anteprima MP3 a
// 128 kb/s; l'originale a piena qualità va scaricato a mano.
import type { VoiceId } from '../src/client/sound/profiles';

export type Recording = {
  id: string;
  /** nome del file in .cache/suoni, senza estensione (.webm Opus, .m4a AAC) */
  file?: string;
  title: string;
  author: string;
  url: string;
  licence: 'CC0 1.0' | 'CC BY 3.0' | 'CC BY 4.0';
  /** cosa c'è dentro e cosa vale */
  note: string;
  /** cosa si è scaricato; assente: da scaricare a mano */
  got?: string;
};

export type Clip = {
  recording: string;
  label: string;
  voice: VoiceId;
  /** inizio e durata nel file (s), modificabili dal banco */
  start: number;
  duration: number;
  loop?: boolean;
  /** file proprio, se diverso da quello della registrazione (l'archivio Amiga ha un file per suono) */
  file?: string;
  /** raccordi (s): entrata cortissima per non smussare lo scatto, uscita sulla coda */
  fadeIn?: number;
  fadeOut?: number;
  /** livello di partenza (le registrazioni hanno volumi diversi) */
  gain?: number;
  /** tasti: il rilascio, in un altro punto dello stesso file */
  release?: { start: number; duration: number };
  /** interruttore: scelta di partenza per "accendi" o per "spegni" */
  role?: 'on' | 'off';
  /** disco: non una clip sola ma il floppy fatto a pezzi (DISK_KIT) */
  kit?: boolean;
};

/**
 * Il floppy di MrAuralization diviso in pezzi: passi singoli (un passo di traccia mentre
 * legge), ricerche (raffiche di passi ogni 6,1 ms, il "brrrt") e il motore da solo.
 * Tempi trovati sull'inviluppo (3 ms) dei file: attacco meno 4 ms, così lo scatto resta intero.
 */
export const DISK_KIT = {
  /** passi singoli: ognuno dura `stepDur` */
  steps: [
    ...[1.772, 2.235, 2.699, 3.564, 4.028, 4.492, 5.123, 5.589, 6.053, 6.916, 7.383, 7.847, 8.311, 8.944, 9.407, 9.871, 10.339, 16.481, 16.945, 17.411, 17.875, 18.509, 19.436, 20.066, 20.533, 21.196, 21.66, 22.294, 22.757, 23.221, 23.851, 25.879, 26.343, 26.807, 27.438, 27.905, 28.369, 28.832, 29.466, 29.93, 30.394, 30.861, 31.459].map((start) => ({ file: 'floppy-lettura', start })),
    ...[2.619, 5.97, 6.438, 6.902, 7.366, 11.152, 11.618, 12.082, 12.546, 13.18, 16.966, 17.429, 17.893, 18.524, 18.991].map((start) => ({ file: 'floppy-scrittura', start })),
  ],
  stepDur: 0.08,
  /** ricerche intere (s): si tagliano alla lunghezza del seek richiesto */
  seeks: [
    { file: 'floppy-lettura', start: 0.953, duration: 0.37 },
    { file: 'floppy-lettura', start: 15.25, duration: 0.53 },
    ...[
      [1.888, 0.39], [3.113, 0.39], [3.68, 0.78], [5.473, 0.4], [8.001, 0.42], [8.671, 0.4], [9.08, 0.4], [10.455, 0.42],
      [13.41, 0.45], [14.04, 0.42], [14.618, 0.42], [16.034, 0.44], [19.456, 0.48], [20.018, 0.45], [20.617, 0.45],
    ].map(([start, duration]) => ({ file: 'floppy-scrittura', start, duration })),
  ],
  /** un passo nelle ricerche (s), misurato: righe ogni 163 Hz */
  stepS: 0.0061,
  /** motore senza passi, 3,2 s = 8 periodi della modulazione al giro (0,4 s) */
  motor: { file: 'floppy-lettura', start: 31.95, duration: 3.2 },
};

const PREVIEW = 'anteprima Freesound (MP3 128 kb/s, ricodificata mono): l\'originale a piena qualità va scaricato a mano con un account';

export const RECORDINGS: Recording[] = [
  {
    id: 'sharp',
    file: 'tv-sharp-linytron',
    title: '13 Inch Sharp Linytron TV (Circa 1970s)',
    author: 'OverlookHotelRecords',
    url: 'https://freesound.org/s/784207/',
    licence: 'CC0 1.0',
    note: 'TV portatile vera degli anni 70: interruttore, statica, spegnimento.',
    got: PREVIEW,
  },
  {
    id: 'firefreak',
    file: 'crt-pal-accensione',
    title: 'TV_CRT_PAL_TurnOn.wav',
    author: 'firefreak',
    url: 'https://freesound.org/s/65400/',
    licence: 'CC BY 3.0',
    note: 'TV PAL vera che si accende, con il fischio di riga a 15625 Hz lasciato apposta.',
    got: PREVIEW,
  },
  {
    id: 'sirius',
    file: 'crt-scintille',
    title: 'CRT Screen Static Sparks',
    author: 'SiriusBizdness',
    url: 'https://freesound.org/s/565193/',
    licence: 'CC BY 4.0',
    note: 'Mano strofinata su un CRT acceso: scintille di elettricità statica (fischio filtrato via).',
    got: PREVIEW,
  },
  {
    id: 'erh',
    file: 'tv-bn-ronzio',
    title: 'tv on hum off.wav',
    author: 'ERH',
    url: 'https://freesound.org/s/30950/',
    licence: 'CC BY 4.0',
    note: 'TV in bianco e nero: accensione con forte ronzio di rete, spegnimento.',
    got: PREVIEW,
  },
  {
    id: 'rufuz',
    file: 'pc-dodici-dischi',
    title: 'Inside a computer with 12 hard drives',
    author: 'rufuz',
    url: 'https://freesound.org/s/426151/',
    licence: 'CC0 1.0',
    note: 'Dentro un PC anni 2000: interruttore, dischi che partono, ventole, spegnimento.',
    got: PREVIEW,
  },
  {
    id: 'dell',
    file: 'dell-l600r',
    title: 'Dell Dimension L600r',
    author: 'korndeftones123',
    url: 'https://freesound.org/s/353240/',
    licence: 'CC0 1.0',
    note: 'Dentro un Dell del 2000: interruttore, ventole, floppy da 3,5 pollici, beep.',
    got: PREVIEW,
  },
  {
    id: 'mra-read',
    file: 'floppy-lettura',
    title: 'Floppy disk drive - read',
    author: 'MrAuralization',
    url: 'https://freesound.org/s/259292/',
    licence: 'CC BY 4.0',
    note: 'Floppy che legge (formato non dichiarato), registratore un po\' rumoroso.',
    got: PREVIEW,
  },
  {
    id: 'mra-write',
    file: 'floppy-scrittura',
    title: 'Floppy disk drive - write',
    author: 'MrAuralization',
    url: 'https://freesound.org/s/259291/',
    licence: 'CC BY 4.0',
    note: 'Lo stesso floppy che scrive.',
    got: PREVIEW,
  },
  {
    id: 'amiga',
    file: 'amiga-accesso-1',
    title: 'Amiga 600 floppy drive sounds',
    author: 'asie',
    url: 'https://opengameart.org/content/amiga-600-floppy-drive-sounds',
    licence: 'CC0 1.0',
    note: 'Floppy da 3,5 pollici di un Amiga 600, registrato con un iPad: sei accessi, inserimento, espulsione.',
    got: 'archivio completo (OGG), ricodificato mono',
  },
  // trovate l'11 novembre (licenza letta sulla pagina di ogni suono)
  {
    id: 'fission9',
    file: 'tasto-tv-crt',
    title: 'On/Off Button',
    author: 'Fission9',
    url: 'https://freesound.org/s/693859/',
    licence: 'CC0 1.0',
    note: 'Tasto di accensione di una TV CRT premuto due volte (accende, spegne).',
    got: PREVIEW,
  },
  {
    id: 'magedu-monitor',
    file: 'tasto-monitor-crt',
    title: 'old_crt_monitor_button_turn_on_01.wav',
    author: 'magedu',
    url: 'https://freesound.org/s/263900/',
    licence: 'CC BY 4.0',
    note: 'Tasto di accensione di un vecchio monitor CRT, Fostex FR-2LE e Rode NTG3: pressione e rilascio.',
    got: PREVIEW,
  },
  {
    id: 'pizzazif',
    file: 'tasto-vcr',
    title: 'Clicking VCR power button.mp3',
    author: 'Pizzazif',
    url: 'https://freesound.org/s/639350/',
    licence: 'CC0 1.0',
    note: 'Tasto di accensione di un videoregistratore, corto e asciutto.',
    got: PREVIEW,
  },
  {
    id: 'pfranzen',
    file: 'tasto-gateway',
    title: 'Power button on old computer',
    author: 'pfranzen',
    url: 'https://freesound.org/s/328852/',
    licence: 'CC BY 4.0',
    note: 'Tasto di accensione di un Gateway 2000 premuto e rilasciato quattro volte.',
    got: PREVIEW,
  },
  {
    id: 'teac',
    file: 'tasto-teac',
    title: 'Amplifier Snap Button 1_9',
    author: 'Joao_Janz',
    url: 'https://freesound.org/s/477519/',
    licence: 'CC0 1.0',
    note: "Tasto a scatto di un amplificatore TEAC d'epoca, solo pressione.",
    got: PREVIEW,
  },
  {
    id: 'joedeshon',
    file: 'tasto-vcr-doppio',
    title: 'vcr_switch.wav',
    author: 'joedeshon',
    url: 'https://freesound.org/s/364202/',
    licence: 'CC BY 4.0',
    note: "Interruttore grosso di un videoregistratore dei primi anni, a doppia azione (corsa e aggancio). Un po' rumoroso.",
    got: PREVIEW,
  },
  {
    id: 'freqman',
    file: 'bilanciere-tektronix',
    title: 'rocker switch.wav',
    author: 'FreqMan',
    url: 'https://freesound.org/s/31592/',
    licence: 'CC BY 4.0',
    note: 'Interruttore a bilanciere di un vecchio oscilloscopio Tektronix: acceso e spento.',
    got: PREVIEW,
  },
  {
    id: 'challsmith-tv',
    file: 'tasti-tv-analogica',
    title: 'Analog TV Switches',
    author: 'CHallSmith',
    url: 'https://freesound.org/s/870771/',
    licence: 'CC0 1.0',
    note: 'Pannello di tasti di una vecchia TV analogica: più tasti diversi premuti e rilasciati.',
    got: PREVIEW,
  },
  {
    id: 'magedu-amiga',
    file: 'amiga-alimentatore',
    title: 'Amiga_500_power_supply_unit_turn_off.wav',
    author: 'magedu',
    url: 'https://freesound.org/s/321116/',
    licence: 'CC BY 4.0',
    note: "Interruttore dell'alimentatore di un Amiga 500 che si spegne.",
    got: PREVIEW,
  },
  {
    id: 'chungh',
    file: 'amplificatore-chungh',
    title: 'Power Amp "Chungh" Sound',
    author: 'cookies+policy',
    url: 'https://freesound.org/s/556363/',
    licence: 'CC0 1.0',
    note: "Finale di potenza d'epoca che si accende: colpo pesante e trasformatore che ronza.",
    got: PREVIEW,
  },
  {
    id: 'ibm5150',
    file: 'ibm-5150',
    title: 'Old PC startup, idle & shutdown',
    author: 'nakkivene66',
    url: 'https://freesound.org/s/551405/',
    licence: 'CC0 1.0',
    note: "Un IBM PC 5150 del 1981 vero: interruttore rosso, ventola, floppy e bip all'avvio, spegnimento.",
    got: PREVIEW,
  },
  {
    id: 'challsmith-rele',
    file: 'rele-grandi',
    title: 'Electrical Relays, Very Large',
    author: 'CHallSmith',
    url: 'https://freesound.org/s/870770/',
    licence: 'CC0 1.0',
    note: 'Relè grandi di vecchie luci da set, ripresi in teatro di posa: code lunghe.',
    got: PREVIEW,
  },
  {
    id: 'mra-rele',
    file: 'rele-mrauralization',
    title: 'Relay',
    author: 'MrAuralization',
    url: 'https://freesound.org/s/203600/',
    licence: 'CC BY 4.0',
    note: 'Un relè piccolo da circuito stampato che si chiude e si apre, Zoom H1.',
    got: PREVIEW,
  },
  // da scaricare a mano: BigSoundBank rifiuta i download automatici, OpenGameArt da verificare
  {
    id: 'bsb-switch',
    title: 'Industrial switch #1, #2, #3',
    author: 'Joseph Sardin (BigSoundBank)',
    url: 'https://bigsoundbank.com/industrial-switch-1-s3061.html',
    licence: 'CC0 1.0',
    note: 'Sound design (interruttore più barra di ferro più riverbero): strato per un interruttore pesante. Anche s3062 e s3063.',
  },
  {
    id: 'bsb-thermostat',
    title: 'Thermostat #1',
    author: 'Joseph Sardin (BigSoundBank)',
    url: 'https://bigsoundbank.com/thermostat-1-s2191.html',
    licence: 'CC0 1.0',
    note: 'Piccolo clic meccanico: candidato per i tasti della cornice o per il relè.',
  },
  {
    id: 'bsb-fan',
    title: 'Computer 2 (ventilation)',
    author: 'Joseph Sardin (BigSoundBank)',
    url: 'https://bigsoundbank.com/computer-2-ventilation-s0126.html',
    licence: 'CC0 1.0',
    note: 'Ventola di un Power Mac G5, 10 s, pronta per il loop: il miglior CC0 per la ventola.',
  },
  {
    id: 'bsb-floppy',
    title: 'Floppy disk (3.5"), reading / input / output',
    author: 'Joseph Sardin (BigSoundBank)',
    url: 'https://bigsoundbank.com/floppy-disk-3-5-reading-s1396.html',
    licence: 'CC0 1.0',
    note: 'Floppy esterno da 3,5 pollici registrato in studio (s1396, s1395, s1397).',
  },
  {
    id: 'cloud10',
    title: 'Turning the TV off',
    author: 'Cloud-10',
    url: 'https://freesound.org/s/648174/',
    licence: 'CC0 1.0',
    note: 'Sintetizzato (non una registrazione): non scaricato, solo come eventuale strato.',
  },
];

export const CLIPS: Clip[] = [
  // interruttore / relè: tagliati sull'attacco, senza il ronzio o la TV che parte dopo
  { recording: 'sharp', label: 'Sharp Linytron: scatto di accensione', voice: 'interruttore', start: 0.399, duration: 0.09, fadeOut: 0.04 },
  { recording: 'sharp', label: 'Sharp Linytron: corsa del tasto e scatto', voice: 'interruttore', start: 0.243, duration: 0.245, fadeOut: 0.04 },
  { recording: 'sharp', label: 'Sharp Linytron: spegnimento', voice: 'interruttore', start: 28.349, duration: 0.3, fadeOut: 0.1 },
  { recording: 'erh', label: 'TV in bianco e nero: accensione', voice: 'interruttore', start: 3.066, duration: 0.1, fadeOut: 0.05 },
  { recording: 'erh', label: 'TV in bianco e nero: spegnimento, due scatti', voice: 'interruttore', start: 10.494, duration: 0.55, fadeOut: 0.12 },
  { recording: 'erh', label: 'TV in bianco e nero: secondo scatto da solo', voice: 'interruttore', start: 10.792, duration: 0.25, fadeOut: 0.1 },
  { recording: 'rufuz', label: 'PC: tasto di accensione, premuto e rilasciato', voice: 'interruttore', start: 0.219, duration: 0.36, fadeOut: 0.05, gain: 1.5 },
  { recording: 'dell', label: 'Dell L600r: interruttore', voice: 'interruttore', start: 0.588, duration: 0.42, fadeOut: 0.08 },
  { recording: 'ibm5150', label: 'IBM 5150: interruttore rosso, accensione', voice: 'interruttore', role: 'on', start: 3.24, duration: 0.15, fadeOut: 0.07 },
  { recording: 'ibm5150', label: 'IBM 5150: interruttore e ventola che parte', voice: 'interruttore', start: 3.24, duration: 2.2, fadeOut: 0.3 },
  { recording: 'ibm5150', label: 'IBM 5150: interruttore rosso, spegnimento', voice: 'interruttore', role: 'off', start: 40.366, duration: 0.18, fadeOut: 0.08, gain: 0.5 },
  { recording: 'magedu-amiga', label: 'Amiga 500: alimentatore che si spegne', voice: 'interruttore', start: 0.457, duration: 0.15, fadeOut: 0.05 },
  { recording: 'chungh', label: 'Finale di potenza: colpo e trasformatore', voice: 'interruttore', start: 0.008, duration: 0.5, fadeOut: 0.25, gain: 0.5 },
  { recording: 'mra-rele', label: 'Relè piccolo: si chiude', voice: 'interruttore', start: 0.766, duration: 0.08, fadeOut: 0.03 },
  { recording: 'mra-rele', label: 'Relè piccolo: si apre', voice: 'interruttore', start: 1.686, duration: 0.08, fadeOut: 0.03 },
  { recording: 'challsmith-rele', label: 'Relè grande (coda accorciata)', voice: 'interruttore', start: 0.2, duration: 0.25, fadeOut: 0.12 },
  { recording: 'freqman', label: 'Tektronix: bilanciere acceso', voice: 'interruttore', start: 0.173, duration: 0.24, fadeOut: 0.06 },
  // tubo che si accende
  { recording: 'firefreak', label: 'TV PAL: accensione con fischio di riga', voice: 'tubo', start: 0, duration: 4.5 },
  { recording: 'sharp', label: 'Sharp Linytron: accensione e statica', voice: 'tubo', start: 0.38, duration: 3 },
  { recording: 'erh', label: 'TV in bianco e nero: accensione', voice: 'tubo', start: 3.02, duration: 3 },
  { recording: 'sirius', label: 'Scintille statiche sul vetro', voice: 'tubo', start: 0, duration: 4 },
  // ambiente
  { recording: 'rufuz', label: 'PC dodici dischi: ventole a regime', voice: 'ventola', start: 10, duration: 20, loop: true },
  { recording: 'dell', label: 'Dell L600r: ventole a regime', voice: 'ventola', start: 6.3, duration: 6, loop: true },
  { recording: 'ibm5150', label: 'IBM 5150: ventola e alimentatore a regime', voice: 'ventola', start: 6, duration: 12, loop: true },
  { recording: 'firefreak', label: 'TV PAL a regime (fischio)', voice: 'ventola', start: 5, duration: 4.5, loop: true },
  { recording: 'erh', label: 'TV in bianco e nero: ronzio a regime', voice: 'rete', start: 3.6, duration: 6.5, loop: true },
  { recording: 'sharp', label: 'Sharp Linytron: a regime', voice: 'rete', start: 1, duration: 10, loop: true },
  // disco
  { recording: 'mra-read', label: 'MrAuralization a pezzi: passi, ricerche e motore', voice: 'disco', start: 0, duration: 0, kit: true, gain: 6 }, // le registrazioni stanno attorno a -30 dBFS di picco
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    recording: 'amiga',
    label: `Amiga 600: accesso ${n}`,
    voice: 'disco' as const,
    start: 0,
    duration: 1.5,
    file: `amiga-accesso-${n}`,
  })),
  { recording: 'amiga', label: 'Amiga 600: inserimento', voice: 'disco', start: 0, duration: 0.6, file: 'amiga-inserisci' },
  { recording: 'dell', label: 'Dell L600r: floppy 3,5 pollici', voice: 'disco', start: 13.6, duration: 2.6 },
  { recording: 'mra-read', label: 'MrAuralization: lettura', voice: 'disco', start: 0, duration: 10 },
  { recording: 'mra-write', label: 'MrAuralization: scrittura', voice: 'disco', start: 0, duration: 10 },
  { recording: 'rufuz', label: 'PC dodici dischi: dischi che partono', voice: 'disco', start: 0.5, duration: 4 },
  { recording: 'ibm5150', label: 'IBM 5150: floppy da 5,25 pollici e bip all\'avvio', voice: 'disco', start: 20.2, duration: 1.75, fadeOut: 0.1 },
  { recording: 'ibm5150', label: 'IBM 5150: una ricerca del floppy', voice: 'disco', start: 21.6, duration: 0.33, fadeOut: 0.05 },
  // tasti della cornice: pressione e rilascio
  { recording: 'magedu-monitor', label: 'Monitor CRT: tasto di accensione', voice: 'tasti', start: 0.314, duration: 0.15, fadeOut: 0.05, release: { start: 0.573, duration: 0.12 } },
  { recording: 'fission9', label: 'TV CRT: tasto a due scatti (accende, spegne)', voice: 'tasti', start: 0.014, duration: 0.25, fadeOut: 0.06, release: { start: 0.922, duration: 0.34 } },
  { recording: 'pfranzen', label: 'Gateway 2000: tasto di accensione', voice: 'tasti', start: 0.109, duration: 0.12, fadeOut: 0.04, release: { start: 0.548, duration: 0.17 } },
  { recording: 'pizzazif', label: 'Videoregistratore: tasto corto', voice: 'tasti', start: 0.045, duration: 0.09, fadeOut: 0.03, release: { start: 0.146, duration: 0.1 } },
  { recording: 'challsmith-tv', label: 'TV analogica: tasto del pannello', voice: 'tasti', start: 0.34, duration: 0.15, fadeOut: 0.05, release: { start: 0.564, duration: 0.12 } },
  { recording: 'challsmith-tv', label: 'TV analogica: altro tasto', voice: 'tasti', start: 4.36, duration: 0.14, fadeOut: 0.05, release: { start: 4.566, duration: 0.12 } },
  { recording: 'teac', label: 'Amplificatore TEAC: tasto a scatto (solo pressione)', voice: 'tasti', start: 0, duration: 0.15, fadeOut: 0.05 },
  { recording: 'joedeshon', label: 'Videoregistratore: interruttore a doppia azione', voice: 'tasti', start: 0, duration: 0.33, fadeOut: 0.08, gain: 0.5 },
  { recording: 'freqman', label: 'Tektronix: bilanciere', voice: 'tasti', start: 0.173, duration: 0.24, fadeOut: 0.06, release: { start: 1.365, duration: 0.12 } },
  { recording: 'rufuz', label: 'PC: tasto di accensione', voice: 'tasti', start: 0.219, duration: 0.12, fadeOut: 0.04, gain: 1.5, release: { start: 0.48, duration: 0.09 } },
  { recording: 'erh', label: 'TV in bianco e nero: tasto a due scatti', voice: 'tasti', start: 10.494, duration: 0.2, fadeOut: 0.08, release: { start: 10.792, duration: 0.2 } },
  { recording: 'sharp', label: 'Sharp Linytron: scatto (premi) e spegnimento (rilascia)', voice: 'tasti', start: 0.399, duration: 0.07, fadeOut: 0.03, release: { start: 28.349, duration: 0.2 } },
];

/** File di una clip: quello della registrazione, salvo i file singoli dell'archivio Amiga. */
export function clipFile(c: Clip): string | undefined {
  return c.file ?? RECORDINGS.find((r) => r.id === c.recording)?.file;
}
