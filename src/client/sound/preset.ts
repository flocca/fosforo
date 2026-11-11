// I suoni del sito, scelti da Giacomo a orecchio sul banco dei suoni (/_suoni) l'11 novembre:
// dev/scelte/2026-11-11-preferita.json. Profilo CP/M con floppy da 8 pollici per tubo,
// ventola, ronzio e mobile (sintesi); interruttore rosso dell'IBM 5150, tasto di una TV
// analogica e floppy di MrAuralization registrati (src/client/sound/registrazioni, fatti
// da dev/ritaglia-suoni.sh). Per cambiarli: si torna sul banco, si salva una configurazione
// e si riportano qui i valori.
import type { Params } from './profiles';

export const MAINS = 50;

export const TUBE: Params = { crackle: 0.35, crackleRate: 220, crackleDur: 1.4, hiss: 0.25, whine: 0.0025, lineHz: 15625, whineRise: 0.9, jitter: 8 };

export const FAN: Params = {
  level: 0.16,
  rpm: 2800,
  blades: 5,
  tone: 0.32,
  air: 0.75,
  airHz: 950,
  shaftAm: 0.08,
  wobble: 0.12,
  motorHum: 0.35,
  whine: 0.15,
  whineHz: 504,
  whineCenter: 8000,
  spinUp: 2.6,
  spinDown: 5,
};

export const HUM: Params = { level: 0.08, mains: MAINS, fundamental: 0.15, rolloff: 6, odd: 0.25, drive: 1.2, inrush: 2.8, inrushS: 0.22, wander: 0.08 };

export const CASE: Params = { on: 1, wet: 0.32, size: 0.22, resScale: 0.85, lowpass: 8500 };

/** Pezzi di registrazioni/meccanica.*, nell'ordine di dev/ritaglia-suoni.sh, e i loro livelli. */
export const MECH = {
  file: 'meccanica',
  pieces: ['switchOn', 'switchOff', 'press', 'release'] as const,
  gain: { switchOn: 1, switchOff: 0.5, press: 1, release: 1 },
  /** dopo quanto arriva il rilascio del tasto (s) */
  releaseAfter: 0.14,
};

/** Pezzi di registrazioni/floppy.*: 12 passi, 6 ricerche dalla più corta, il motore in fondo. */
export const FLOPPY = {
  file: 'floppy',
  steps: 12,
  seeks: 6,
  gain: 6,
  /** un passo nelle ricerche (s): righe ogni 163 Hz */
  stepS: 0.0061,
  motorSpinUp: 0.9,
  recalSteps: 30,
  /** il motore si ferma dopo tanti secondi senza accessi, come un floppy vero */
  motorIdle: 2.5,
};
