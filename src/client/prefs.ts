// Preferenze del visitatore: l'unico modulo che tocca lo storage del browser.
// Ogni accesso è protetto: senza storage (navigazione privata, dati bloccati) valgono i predefiniti.
import { PHOSPHORS, type Phosphor } from './shell';
import { isSoundSetting, type SoundSetting } from './volume';

const KEY_PHOSPHOR = 'fosforo.fosfori';
const KEY_SOUND = 'fosforo.suono';
const KEY_LAST_BOOT = 'fosforo.ultimoBoot';
const KEY_LAST_POWER_ON = 'fosforo.ultimaAccensione';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage non disponibile: la scelta vale solo per questa visita
  }
}

export function getPhosphor(): Phosphor {
  const v = read(KEY_PHOSPHOR);
  return (PHOSPHORS as readonly (string | null)[]).includes(v) ? (v as Phosphor) : 'verde';
}

export function setPhosphor(p: Phosphor) {
  write(KEY_PHOSPHOR, p);
}

// null: il visitatore non ha mai scelto, oppure il valore salvato non è riconosciuto.
export function getSoundSetting(): SoundSetting | null {
  const v = read(KEY_SOUND);
  return isSoundSetting(v) ? v : null;
}

export function setSoundSetting(s: SoundSetting) {
  write(KEY_SOUND, s);
}

export function getLastBoot(): string | null {
  const v = read(KEY_LAST_BOOT);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function setLastBoot(date: string) {
  write(KEY_LAST_BOOT, date);
}

// Giorno in cui il visitatore ha acceso il monitor (con l'interruttore o da una pagina di un elemento).
export function getLastPowerOn(): string | null {
  const v = read(KEY_LAST_POWER_ON);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function setLastPowerOn(date: string) {
  write(KEY_LAST_POWER_ON, date);
}
