import { afterEach, describe, expect, it, vi } from 'vitest';
import * as prefs from '../../src/client/prefs';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
}

const throwing = () => {
  throw new Error('SecurityError');
};

afterEach(() => vi.unstubAllGlobals());

describe('prefs senza storage (Review Focus 2)', () => {
  it('i metodi che lanciano danno i valori predefiniti e non lanciano', () => {
    vi.stubGlobal('localStorage', { getItem: throwing, setItem: throwing, removeItem: throwing });
    expect(prefs.getPhosphor()).toBe('verde');
    expect(prefs.isSoundOff()).toBe(false);
    expect(prefs.getLastBoot()).toBeNull();
    expect(() => prefs.setPhosphor('ambra')).not.toThrow();
    expect(() => prefs.setSoundOff(true)).not.toThrow();
    expect(() => prefs.setSoundOff(false)).not.toThrow();
    expect(() => prefs.setLastBoot('2026-11-11')).not.toThrow();
  });

  it('anche l\'accesso a localStorage che lancia', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: throwing });
    try {
      expect(prefs.getPhosphor()).toBe('verde');
      expect(() => prefs.setLastBoot('2026-11-11')).not.toThrow();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('prefs con storage', () => {
  it('legge e scrive le chiavi concordate', () => {
    const s = memoryStorage();
    vi.stubGlobal('localStorage', s);
    prefs.setPhosphor('ambra');
    expect(s.data.get('fosforo.fosfori')).toBe('ambra');
    expect(prefs.getPhosphor()).toBe('ambra');
    prefs.setSoundOff(true);
    expect(s.data.get('fosforo.suono')).toBe('spento');
    expect(prefs.isSoundOff()).toBe(true);
    prefs.setLastBoot('2026-11-11');
    expect(prefs.getLastBoot()).toBe('2026-11-11');
  });

  it('setSoundOff(false) toglie la chiave', () => {
    const s = memoryStorage();
    vi.stubGlobal('localStorage', s);
    prefs.setSoundOff(true);
    prefs.setSoundOff(false);
    expect(s.data.has('fosforo.suono')).toBe(false);
    expect(prefs.isSoundOff()).toBe(false);
  });

  it('valori sconosciuti danno i predefiniti', () => {
    const s = memoryStorage();
    s.data.set('fosforo.fosfori', 'viola');
    s.data.set('fosforo.suono', 'boh');
    s.data.set('fosforo.ultimoBoot', 'ieri');
    vi.stubGlobal('localStorage', s);
    expect(prefs.getPhosphor()).toBe('verde');
    expect(prefs.isSoundOff()).toBe(false);
    expect(prefs.getLastBoot()).toBeNull();
  });
});
