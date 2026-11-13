import { describe, expect, it } from 'vitest';
import { formatWarnings } from '../../src/lib/warnings';

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
