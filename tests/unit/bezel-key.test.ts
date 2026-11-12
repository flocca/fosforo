import { describe, expect, it } from 'vitest';
import { bezelKey } from '../../src/client/bezel-key';

// Il tasto e la finestra sono EventTarget di Node: bastano gli eventi con qualche campo.
const ev = (type: string, fields: Record<string, unknown> = {}) => Object.assign(new Event(type), fields);

function setup() {
  const button = Object.assign(new EventTarget(), { disabled: false });
  const win = new EventTarget();
  const log: string[] = [];
  bezelKey(button, { keyDown: () => log.push('giù'), keyUp: () => log.push('su') }, (held) => log.push(held ? 'azione' : 'azione senza pressione'), win);
  // clic del puntatore (detail 1) o da tastiera (detail 0)
  const click = (detail: number) => button.dispatchEvent(ev('click', { detail }));
  return { button, win, log, click };
}

describe('bezelKey', () => {
  it('mouse: pressione quando scende, rilascio quando si lascia, poi l\'azione', () => {
    const { button, win, log, click } = setup();
    button.dispatchEvent(ev('pointerdown', { button: 0 }));
    expect(log).toEqual(['giù']);
    win.dispatchEvent(ev('pointerup'));
    click(1);
    expect(log).toEqual(['giù', 'su', 'azione']);
  });

  it('rilasciato fuori dal tasto o con il gesto annullato: il rilascio suona una volta sola', () => {
    const { button, win, log } = setup();
    button.dispatchEvent(ev('pointerdown', { button: 0 }));
    win.dispatchEvent(ev('pointercancel'));
    win.dispatchEvent(ev('pointerup'));
    expect(log).toEqual(['giù', 'su']);
  });

  it('il tasto destro e un tasto disabilitato non suonano', () => {
    const { button, win, log } = setup();
    button.dispatchEvent(ev('pointerdown', { button: 2 }));
    button.disabled = true;
    button.dispatchEvent(ev('pointerdown', { button: 0 }));
    win.dispatchEvent(ev('pointerup'));
    expect(log).toEqual([]);
  });

  it('barra spaziatrice: pressione al keydown, rilascio al keyup, la ripetizione non suona', () => {
    const { button, log, click } = setup();
    button.dispatchEvent(ev('keydown', { key: ' ' }));
    button.dispatchEvent(ev('keydown', { key: ' ', repeat: true }));
    button.dispatchEvent(ev('keyup', { key: ' ' }));
    click(0);
    expect(log).toEqual(['giù', 'su', 'azione']);
  });

  it('Invio: il clic arriva senza pressione', () => {
    const { button, log, click } = setup();
    button.dispatchEvent(ev('keydown', { key: 'Enter' }));
    click(0);
    expect(log).toEqual(['azione senza pressione']);
  });

  it('una barra spaziatrice lasciata senza clic non segna il clic successivo come premuto', () => {
    const { button, log, click } = setup();
    button.dispatchEvent(ev('keydown', { key: ' ' }));
    button.dispatchEvent(ev('keyup', { key: ' ' }));
    button.dispatchEvent(ev('keydown', { key: 'Enter' }));
    click(0);
    expect(log).toEqual(['giù', 'su', 'azione senza pressione']);
  });
});
