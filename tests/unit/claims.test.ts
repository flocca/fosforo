import { describe, expect, it } from 'vitest';
import { checkClaims, isIgnoredName, isSongFile, PAGE_NAME } from '../../src/lib/claims';

describe('isSongFile', () => {
  it('riconosce il nome a data', () => {
    expect(isSongFile('2026-11-10.md')).toBe(true);
  });
  it('rifiuta gli altri nomi', () => {
    for (const n of ['leggimi.md', '2026-11-10.txt', '2026-1-1.md']) expect(isSongFile(n), n).toBe(false);
  });
});

describe('isIgnoredName', () => {
  it('ignora README, CLAUDE, AGENTS e i file col punto', () => {
    for (const n of ['README.md', 'CLAUDE.md', 'AGENTS.md', '.bozza.md']) expect(isIgnoredName(n), n).toBe(true);
  });
  it('non ignora una pagina', () => {
    expect(isIgnoredName('leggimi.md')).toBe(false);
  });
});

describe('PAGE_NAME', () => {
  it('kebab-case con una lettera all’inizio', () => {
    for (const n of ['leggimi', 'a', 'nota-2']) expect(PAGE_NAME.test(n), n).toBe(true);
    for (const n of ['Leggimi', '2026-11-10', 'note_varie', 'a--b', '-a']) expect(PAGE_NAME.test(n), n).toBe(false);
  });
});

describe('checkClaims', () => {
  it('insiemi uguali: nessun errore', () => {
    expect(() => checkClaims('canzoni', ['a', 'b'], ['b', 'a'])).not.toThrow();
  });
  it('un nome in più da una parte: errore che lo nomina', () => {
    expect(() => checkClaims('canzoni', ['a', 'b'], ['a'])).toThrow(/^fosforo: canzoni:.*b/);
    expect(() => checkClaims('messaggi', ['a'], ['a', 'c'])).toThrow(/^fosforo: messaggi:.*c/);
  });
});
