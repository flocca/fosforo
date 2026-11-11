// Preferenze del visitatore: l'unico modulo che tocca lo storage del browser.
// Ogni accesso è protetto: senza storage (navigazione privata, dati bloccati) valgono i predefiniti.
import { PHOSPHORS, type Phosphor } from './shell';

const KEY_PHOSPHOR = 'fosforo.fosfori';
const KEY_SOUND = 'fosforo.suono';
const KEY_LAST_BOOT = 'fosforo.ultimoBoot';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
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

export function isSoundOff(): boolean {
  return read(KEY_SOUND) === 'spento';
}

// Si salva solo "spento"; il suono acceso è l'assenza della chiave.
export function setSoundOff(off: boolean) {
  write(KEY_SOUND, off ? 'spento' : null);
}

export function getLastBoot(): string | null {
  const v = read(KEY_LAST_BOOT);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function setLastBoot(date: string) {
  write(KEY_LAST_BOOT, date);
}
