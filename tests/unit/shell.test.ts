import { describe, expect, it } from 'vitest';
import { listing } from '../../src/lib/fs-tree';
import { createShell } from '../../src/client/shell';
import { fakeTerminal, root } from './fixtures-client';

const lineText = (blocks: ReturnType<typeof listing>) =>
  blocks.map((b) => (b.type === 'line' ? b.spans.map((s) => s.text).join('') : ''));

async function run(line: string, prepare?: (t: ReturnType<typeof fakeTerminal>) => void) {
  const term = fakeTerminal();
  prepare?.(term);
  const shell = createShell(root, term);
  await shell.run(line);
  return term;
}

describe('shell', () => {
  it('ls alla radice stampa l\'elenco della radice', async () => {
    const t = await run('ls');
    expect(t.text()).toEqual(lineText(listing(root)));
  });

  it('ls su un file stampa il suo nome', async () => {
    const t = await run('ls chi-sono');
    expect(t.text()).toEqual(['chi-sono']);
  });

  it('cd canzoni cambia cartella e indirizzo', async () => {
    const t = await run('cd canzoni');
    expect(t.cwd).toBe('canzoni');
    expect(t.navigations).toEqual([['canzoni', 'push']]);
  });

  it('cd senza argomento torna alla radice', async () => {
    const t = await run('cd', (t) => (t.cwd = 'canzoni'));
    expect(t.cwd).toBe('');
    expect(t.navigations).toEqual([['', 'push']]);
  });

  it('cd su un file è un errore', async () => {
    const t = await run('cd chi-sono');
    expect(t.text()).toEqual(['cd: chi-sono: non è una cartella']);
    expect(t.cwd).toBe('');
  });

  it('cd su un percorso inesistente è un errore', async () => {
    const t = await run('cd nope');
    expect(t.text()).toEqual(['cd: nope: file o cartella inesistente']);
  });

  it('cat di un file stampa i blocchi, muove il disco e cambia indirizzo', async () => {
    const t = await run('cat chi-sono');
    expect(t.text()).toEqual(['contenuto di chi-sono']);
    expect(t.seeks).toEqual([4]);
    expect(t.navigations).toEqual([['chi-sono', 'push']]);
  });

  it('cat canzone-del-giorno va alla canzone più recente', async () => {
    const t = await run('cat canzone-del-giorno');
    expect(t.text()).toEqual(['contenuto di canzoni/2026-11-10']);
    expect(t.navigations).toEqual([['canzoni/2026-11-10', 'push']]);
  });

  it('cat relativo alla cartella attuale', async () => {
    const t = await run('cat 2026-11-09', (t) => (t.cwd = 'canzoni'));
    expect(t.navigations).toEqual([['canzoni/2026-11-09', 'push']]);
  });

  it('cat di un link stampa titolo e URL', async () => {
    const t = await run('cat owlcavelabs');
    expect(t.text()).toEqual(['Owl Cave Labs: https://owlcavelabs.it']);
    const spans = t.printed[0][0].type === 'line' ? t.printed[0][0].spans : [];
    expect(spans.find((s) => s.href)?.href).toBe('https://owlcavelabs.it');
    expect(t.navigations).toEqual([]);
  });

  it('cat di un percorso inesistente', async () => {
    const t = await run('cat nope');
    expect(t.text()).toEqual(['cat: nope: file o cartella inesistente']);
    expect(t.navigations).toEqual([]);
  });

  it('cat di una cartella', async () => {
    const t = await run('cat canzoni');
    expect(t.text()).toEqual(['cat: canzoni: è una cartella']);
  });

  it('cat senza argomento', async () => {
    const t = await run('cat');
    expect(t.text()).toEqual(['cat: specifica un file']);
  });

  it('comando sconosciuto, con help cliccabile', async () => {
    const t = await run('foo');
    expect(t.text()).toEqual(['foo: comando non trovato. Prova help.']);
    const spans = t.printed[0][0].type === 'line' ? t.printed[0][0].spans : [];
    expect(spans.find((s) => s.text === 'help')?.cmd).toBe('help');
  });

  it('cd /lettura && ls finisce in lettura con un elenco', async () => {
    const t = await run('cd /lettura && ls');
    expect(t.cwd).toBe('lettura');
    expect(t.text()).toEqual(['termination-shock  Termination Shock']);
  });

  it('cd nope && ls stampa solo l\'errore di cd', async () => {
    const t = await run('cd nope && ls');
    expect(t.text()).toEqual(['cd: nope: file o cartella inesistente']);
  });

  it('pwd', async () => {
    expect((await run('pwd')).text()).toEqual(['/']);
    expect((await run('pwd', (t) => (t.cwd = 'canzoni'))).text()).toEqual(['/canzoni']);
  });

  it('clear e reboot', async () => {
    expect((await run('clear')).clears).toBe(1);
    expect((await run('reboot')).reboots).toBe(1);
  });

  it('suono senza argomento alterna', async () => {
    const t = fakeTerminal();
    const shell = createShell(root, t);
    await shell.run('suono');
    await shell.run('suono');
    expect(t.mutes).toEqual([true, false]);
    expect(t.text()).toEqual(['Suono spento.', 'Suono acceso.']);
  });

  it('suono acceso e spento', async () => {
    const t = await run('suono spento');
    expect(t.mutes).toEqual([true]);
    expect(t.text()).toEqual(['Suono spento.']);
  });

  it('fosfori ambra', async () => {
    const t = await run('fosfori ambra');
    expect(t.phosphors).toEqual(['ambra']);
    expect(t.text()).toEqual(['Fosfori: ambra.']);
  });

  it('fosfori senza argomento mostra quello attuale e le scelte cliccabili', async () => {
    const t = await run('fosfori');
    expect(t.text()[0]).toContain('Fosfori: verde.');
    const spans = t.printed.flat().flatMap((b) => (b.type === 'line' ? b.spans : []));
    expect(spans.filter((s) => s.cmd).map((s) => s.cmd)).toEqual(['fosfori verde', 'fosfori ambra', 'fosfori bianco']);
  });

  it('fosfori viola è un errore che elenca le tre scelte', async () => {
    const t = await run('fosfori viola');
    expect(t.phosphors).toEqual([]);
    const out = t.text().join('\n');
    expect(out).toContain('fosfori: viola');
    for (const p of ['verde', 'ambra', 'bianco']) expect(out).toContain(p);
  });

  it('help: una riga per comando, nomi cliccabili', async () => {
    const t = await run('help');
    const shell = createShell(root, t);
    expect(t.printed[0]).toHaveLength(shell.commands.length);
    const names = t.printed[0].map((b) => (b.type === 'line' ? b.spans[0] : null));
    expect(names.map((s) => s?.cmd)).toEqual(['ls', 'cd', 'cat', 'pwd', 'clear', 'suono', 'fosfori', 'reboot', 'help']);
    expect(t.text()[0]).toMatch(/^ls\s+elenca i file$/);
    expect(t.text()).toContain(t.text().find((l) => l.endsWith('cambia colore: verde, ambra, bianco')));
  });

  it('riga vuota: nessun output', async () => {
    expect((await run('   ')).printed).toEqual([]);
  });
});
