// Tasto della cornice (suono, fosfori): il suono segue il tasto come l'animazione. La
// pressione suona quando il tasto scende (mouse, dito o barra spaziatrice), il rilascio
// quando si lascia, anche fuori dal tasto. Il clic che segue fa l'azione e dice se il
// tasto era stato tenuto premuto: con Invio il browser non lo tiene giù, e l'azione
// suona pressione e rilascio insieme.
export type KeySound = { keyDown(): void; keyUp(): void };

type Key = EventTarget & { disabled: boolean };

export function bezelKey(button: Key, sound: KeySound, act: (held: boolean) => void, win: EventTarget = window) {
  let down = false;
  // la barra spaziatrice è stata premuta e lasciata: il clic che arriva viene da lì
  let spaceClick = false;

  const press = () => {
    down = true;
    sound.keyDown();
  };
  const release = () => {
    if (!down) return;
    down = false;
    sound.keyUp();
  };

  button.addEventListener('pointerdown', (e) => {
    if (button.disabled || (e as PointerEvent).button !== 0) return;
    press();
    // il primo dei due stacca anche l'altro
    const done = new AbortController();
    const up = () => {
      done.abort();
      release();
    };
    win.addEventListener('pointerup', up, { signal: done.signal });
    win.addEventListener('pointercancel', up, { signal: done.signal });
  });

  button.addEventListener('keydown', (e) => {
    const k = e as KeyboardEvent;
    spaceClick = false;
    if (k.key !== ' ' || k.repeat || button.disabled) return;
    press();
  });

  button.addEventListener('keyup', (e) => {
    if ((e as KeyboardEvent).key !== ' ' || !down) return;
    release();
    spaceClick = true;
  });

  button.addEventListener('click', (e) => {
    // un clic del puntatore ha detail >= 1 ed è sempre preceduto dal suo pointerdown
    const held = (e as MouseEvent).detail > 0 || spaceClick;
    spaceClick = false;
    act(held);
  });
}
