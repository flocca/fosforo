import { describe, expect, it } from 'vitest';
import { fillRow, placeholdersIn, valueColumn } from '../../src/lib/reception';

describe('valueColumn', () => {
  it('etichetta più lunga + 6', () => {
    const rows = ['RICEZIONE', 'OPERATORE', 'DIMENSIONE', 'CONTROLLO', 'RISPOSTE'].map((label) => ({ label, value: 'x' }));
    expect(valueColumn(rows)).toBe(16);
  });
});

describe('fillRow', () => {
  it('riga senza segnaposto: puntini fino alla colonna', () => {
    expect(fillRow({ label: 'OPERATORE', value: 'flocca' }, {}, 16, 'x')).toEqual({ lead: 'OPERATORE ..... ', value: 'flocca' });
  });

  it('sostituisce {byte}', () => {
    const r = fillRow({ label: 'DIMENSIONE', value: '{byte} byte' }, { byte: '290' }, 16, 'x');
    expect(r).toEqual({ lead: 'DIMENSIONE .... ', value: '290 byte' });
  });

  it('timbro con {data}', () => {
    const r = fillRow({ label: 'RICEZIONE', value: '{data}' }, { data: '12/11/2026' }, 16, 'x')!;
    expect(r.lead + r.value).toBe('RICEZIONE ..... 12/11/2026');
  });

  it('valore mancante: riga saltata', () => {
    expect(fillRow({ label: 'ORA', value: '{ora}' }, {}, 16, 'x')).toBeNull();
  });

  it('porta il link', () => {
    expect(fillRow({ label: 'RISPOSTE', value: 'rispondi', link: '/rispondi' }, {}, 16, 'x')!.link).toBe('/rispondi');
  });

  it('34 colonne passano, 35 fanno fallire con il percorso', () => {
    const ok = fillRow({ label: 'A', value: 'x'.repeat(34 - 16) }, {}, 16, 'messaggi/a')!;
    expect((ok.lead + ok.value).length).toBe(34);
    expect(() => fillRow({ label: 'A', value: 'x'.repeat(35 - 16) }, {}, 16, 'messaggi/a')).toThrow(/messaggi\/a/);
  });
});

describe('placeholdersIn', () => {
  it('elenca i nomi fra graffe', () => {
    expect(placeholdersIn('{controllo} OK {byte}')).toEqual(['controllo', 'byte']);
  });
});
