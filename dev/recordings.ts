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
  // interruttore / relè
  { recording: 'sharp', label: 'Sharp Linytron: accensione', voice: 'interruttore', start: 0.38, duration: 0.5 },
  { recording: 'sharp', label: 'Sharp Linytron: spegnimento', voice: 'interruttore', start: 28.28, duration: 0.6 },
  { recording: 'erh', label: 'TV in bianco e nero: accensione', voice: 'interruttore', start: 3.02, duration: 0.6 },
  { recording: 'erh', label: 'TV in bianco e nero: spegnimento', voice: 'interruttore', start: 10.45, duration: 0.7 },
  { recording: 'rufuz', label: 'PC dodici dischi: interruttore', voice: 'interruttore', start: 0.2, duration: 0.4 },
  { recording: 'dell', label: 'Dell L600r: interruttore', voice: 'interruttore', start: 0.45, duration: 0.5 },
  // tubo che si accende
  { recording: 'firefreak', label: 'TV PAL: accensione con fischio di riga', voice: 'tubo', start: 0, duration: 4.5 },
  { recording: 'sharp', label: 'Sharp Linytron: accensione e statica', voice: 'tubo', start: 0.38, duration: 3 },
  { recording: 'erh', label: 'TV in bianco e nero: accensione', voice: 'tubo', start: 3.02, duration: 3 },
  { recording: 'sirius', label: 'Scintille statiche sul vetro', voice: 'tubo', start: 0, duration: 4 },
  // ambiente
  { recording: 'rufuz', label: 'PC dodici dischi: ventole a regime', voice: 'ventola', start: 10, duration: 20, loop: true },
  { recording: 'dell', label: 'Dell L600r: ventole a regime', voice: 'ventola', start: 6.3, duration: 6, loop: true },
  { recording: 'firefreak', label: 'TV PAL a regime (fischio)', voice: 'ventola', start: 5, duration: 4.5, loop: true },
  { recording: 'erh', label: 'TV in bianco e nero: ronzio a regime', voice: 'rete', start: 3.6, duration: 6.5, loop: true },
  { recording: 'sharp', label: 'Sharp Linytron: a regime', voice: 'rete', start: 1, duration: 10, loop: true },
  // disco
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
];

/** File di una clip: quello della registrazione, salvo i file singoli dell'archivio Amiga. */
export function clipFile(c: Clip): string | undefined {
  return c.file ?? RECORDINGS.find((r) => r.id === c.recording)?.file;
}
