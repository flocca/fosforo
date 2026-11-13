import { describe, expect, it } from 'vitest';
import { parseFolderPage } from '../../src/lib/folder-page';

describe('parseFolderPage', () => {
  it('pagina valida', () => {
    const r = parseFolderPage('canzoni/leggimi.md', '---\ntitle: Nota sulle canzoni\norder: 1\n---\n\nTesto.');
    expect(r.warnings).toEqual([]);
    expect(r.page).toMatchObject({ dir: 'canzoni', name: 'leggimi', data: { title: 'Nota sulle canzoni', order: 1 } });
    expect(r.page?.body.trim()).toBe('Testo.');
  });

  it('nome non valido: saltata con un avviso', () => {
    for (const file of ['canzoni/Leggimi.md', 'messaggi/note_varie.md']) {
      const r = parseFolderPage(file, '---\ntitle: X\n---\nTesto.');
      expect(r.page, file).toBeUndefined();
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0].file).toBe(file);
      expect(r.warnings[0].message).toMatch(/kebab-case/);
    }
  });

  const fallbacks: [string, string, string][] = [
    ['YAML rotto', '---\ntitle: [aperta\n---\nTesto.', 'Testo.'],
    ['schema non rispettato', '---\ntitolo: x\n---\nTesto.', 'Testo.'],
    ['senza frontmatter', 'Solo testo.', 'Solo testo.'],
    ['sintassi Obsidian', '---\ntitle: X\n---\nvedi [[altro]]', 'vedi [[altro]]'],
    ['frontmatter senza chiusura', '---\ntitle: X\nTesto.', '---\ntitle: X\nTesto.'],
    ['frontmatter vuoto', '---\n---\nTesto.', 'Testo.'],
  ];
  for (const [what, raw, body] of fallbacks) {
    it(`${what}: il nome del file come titolo e un avviso`, () => {
      const r = parseFolderPage('canzoni/leggimi.md', raw);
      expect(r.page?.data).toEqual({ title: 'leggimi' });
      expect(r.page?.body.trim()).toBe(body);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0].file).toBe('canzoni/leggimi.md');
    });
  }

  it('CRLF: frontmatter letto', () => {
    const r = parseFolderPage('canzoni/leggimi.md', '---\r\ntitle: X\r\n---\r\nTesto.');
    expect(r.page?.data).toEqual({ title: 'X' });
    expect(r.page?.body.trim()).toBe('Testo.');
    expect(r.warnings).toEqual([]);
  });

  it('BOM iniziale: frontmatter letto', () => {
    const r = parseFolderPage('canzoni/leggimi.md', '﻿---\ntitle: X\n---\nTesto.');
    expect(r.page?.data).toEqual({ title: 'X' });
    expect(r.warnings).toEqual([]);
  });
});
