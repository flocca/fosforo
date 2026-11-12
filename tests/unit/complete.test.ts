import { describe, expect, it } from 'vitest';
import { complete } from '../../src/client/complete';
import { createHistory } from '../../src/client/history';
import { root } from './fixtures-client';

describe('completamento', () => {
  it('prima parola: i comandi', () => {
    expect(complete(root, '', 'he')).toEqual({ line: 'help', options: [] });
  });

  it('shutdown si completa, i sinonimi silenziosi no', () => {
    expect(complete(root, '', 'shu')).toEqual({ line: 'shutdown', options: [] });
    expect(complete(root, '', 'spe').line).toBe('spe');
    expect(complete(root, '', 'hal').line).toBe('hal');
    expect(complete(root, '', 'po').line).toBe('po');
  });

  it('più corrispondenze: prefisso comune e opzioni', () => {
    expect(complete(root, '', 'cat can')).toEqual({ line: 'cat canzon', options: ['canzone-del-giorno', 'canzoni/'] });
  });

  it('una cartella si completa con la barra', () => {
    expect(complete(root, '', 'cd let')).toEqual({ line: 'cd lettura/', options: [] });
  });

  it('un file si completa senza spazio finale', () => {
    expect(complete(root, '', 'cat chi')).toEqual({ line: 'cat chi-sono', options: [] });
  });

  it('percorsi dentro una cartella e relativi alla cartella attuale', () => {
    expect(complete(root, '', 'cat lettura/ter').line).toBe('cat lettura/termination-shock');
    expect(complete(root, 'canzoni', 'cat 2026-11-1').line).toBe('cat 2026-11-10');
    expect(complete(root, 'canzoni', 'cat /chi').line).toBe('cat /chi-sono');
  });

  it('dopo && si completa di nuovo un comando', () => {
    expect(complete(root, '', 'cd canzoni && cl').line).toBe('cd canzoni && clear');
  });

  it('nessuna corrispondenza: riga invariata', () => {
    expect(complete(root, '', 'cat zzz')).toEqual({ line: 'cat zzz', options: [] });
  });
});

describe('cronologia', () => {
  it('su e giù tra i comandi', () => {
    const h = createHistory();
    expect(h.up()).toBeNull();
    h.push('ls');
    h.push('pwd');
    h.push('pwd');
    h.push('  ');
    expect(h.up()).toBe('pwd');
    expect(h.up()).toBe('ls');
    expect(h.up()).toBeNull();
    expect(h.down()).toBe('pwd');
    expect(h.down()).toBe('');
    expect(h.down()).toBeNull();
  });
});
