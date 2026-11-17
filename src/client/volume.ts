// Livelli del suono: modello puro, senza dipendenze, testabile senza matchMedia.
export const SOUND_LEVELS = ['alto', 'medio', 'basso'] as const;
export type SoundLevel = (typeof SOUND_LEVELS)[number];
export type SoundSetting = SoundLevel | 'spento';

// Ordine del ciclo e delle scelte del comando.
export const SOUND_SETTINGS: readonly SoundSetting[] = ['alto', 'medio', 'basso', 'spento'];

export function nextSetting(s: SoundSetting): SoundSetting {
  return SOUND_SETTINGS[(SOUND_SETTINGS.indexOf(s) + 1) % SOUND_SETTINGS.length];
}

// Livello di partenza quando il visitatore non ha scelto: su touch (puntatore "coarse") più basso.
export function deviceLevel(coarse: boolean): SoundLevel {
  return coarse ? 'basso' : 'medio';
}

export function isSoundSetting(v: unknown): v is SoundSetting {
  return (SOUND_SETTINGS as readonly unknown[]).includes(v);
}
