import { describe, expect, it } from 'vitest';
import { formatWarnings, strictError } from '../../src/lib/warnings';

const w = [{ file: 'canzoni/x.md', message: 'nome non valido' }];

describe('formatWarnings', () => {
  it('fuori da GitHub Actions: una riga per avviso', () => {
    expect(formatWarnings(w, {})).toEqual(['fosforo: avviso: canzoni/x.md: nome non valido']);
  });
  it('sotto GitHub Actions: anche l\'annotazione', () => {
    expect(formatWarnings(w, { GITHUB_ACTIONS: 'true' })).toEqual([
      'fosforo: avviso: canzoni/x.md: nome non valido',
      '::warning file=canzoni/x.md::nome non valido',
    ]);
  });
});

describe('strictError', () => {
  it('senza avvisi: niente errore anche con FOSFORO_STRICT=1', () => {
    expect(strictError([], { FOSFORO_STRICT: '1' })).toBeNull();
  });
  it('con avvisi ma senza FOSFORO_STRICT: niente errore', () => {
    expect(strictError(w, {})).toBeNull();
    expect(strictError(w, { FOSFORO_STRICT: '0' })).toBeNull();
  });
  it('con FOSFORO_STRICT=1: errore che conta gli avvisi', () => {
    expect(strictError(w, { FOSFORO_STRICT: '1' })?.message).toContain('1 avviso con');
    expect(strictError([...w, ...w], { FOSFORO_STRICT: '1' })?.message).toContain('2 avvisi');
  });
});
