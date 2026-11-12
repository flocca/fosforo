// Schermo del terminale: righe di output nel <pre class="term"> e prompt con un <input> vero.
import type { Block, Line, Span } from '../lib/blocks';
import { cmdToUrl } from '../lib/level0';
import { wrapBlocks } from '../lib/wrap';

export const MAX_LINES = 500;
const MIN_COLS = 20;

export type Screen = {
  input: HTMLInputElement;
  cols(): number;
  /** Ricalcola le colonne (dopo che il font è arrivato). */
  remeasure(): void;
  print(blocks: Block[]): void;
  printRom(text: string): void; // riga della ROM: mai a capo, ritagliata a destra
  echo(command: string): void; // riga del prompt con il comando, come se fosse stato scritto
  clear(): void;
  setPrompt(label: string): void;
  showPrompt(show: boolean): void; // nascosto durante il boot
  // un comando sta lavorando: la riga del prompt resta (con il campo a fuoco) ma senza
  // l'etichetta, come un terminale che è solo andato a capo
  setBusy(busy: boolean): void;
  focus(): void;
  onCommand(cb: (cmd: string) => void): void;
};

function spanNode(s: Span): Node {
  let node: Node = document.createTextNode(s.text);
  if (s.style) {
    const el = document.createElement('span');
    el.className = s.style;
    el.append(node);
    node = el;
  }
  if (s.cmd) {
    const a = document.createElement('a');
    // L'href è l'indirizzo dell'elemento: clic centrale e ctrl/cmd-clic aprono la pagina vera
    a.href = cmdToUrl(s.cmd) ?? '#';
    a.dataset.cmd = s.cmd;
    a.append(node);
    node = a;
  } else if (s.href) {
    const a = document.createElement('a');
    a.href = s.href;
    // mailto: apre il programma di posta, non una scheda vuota
    if (!s.href.startsWith('mailto:')) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.append(node);
    node = a;
  }
  return node;
}

function lineNode(l: Line): HTMLElement {
  const el = document.createElement('span');
  el.className = 'term-line';
  if (l.type === 'image') {
    const wrap = document.createElement('span');
    wrap.className = 'ph-img';
    const img = document.createElement('img');
    Object.assign(img, { src: l.src, alt: l.alt, width: l.width, height: l.height, loading: 'lazy', decoding: 'async' });
    wrap.append(img);
    el.append(wrap);
  } else {
    el.append(...l.spans.map(spanNode));
  }
  el.append('\n');
  return el;
}

export const isDesktop = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

// `keep`: l'output già presente (la pagina 404) resta in cima allo schermo.
export function createScreen(pre: HTMLPreElement, { keep = false } = {}): Screen {
  const out = document.createElement('span');
  out.className = 'term-out';
  out.setAttribute('role', 'log');
  out.setAttribute('aria-live', 'polite');

  if (keep && pre.childNodes.length) {
    const kept = document.createElement('span');
    kept.className = 'term-line';
    kept.append(...pre.childNodes, '\n');
    out.append(kept);
  }

  const promptLine = document.createElement('span');
  promptLine.className = 'term-prompt';
  const label = document.createElement('span');
  label.className = 'dim';
  const input = document.createElement('input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, enterKeyHint: 'send' });
  input.setAttribute('aria-label', 'Comando');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  promptLine.append(label, input);

  // Sonda per la larghezza di un carattere
  const probe = document.createElement('span');
  probe.className = 'term-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.textContent = 'M'.repeat(100);

  pre.replaceChildren(out, promptLine, probe);

  let cols = 72;
  const measure = () => {
    const cs = getComputedStyle(pre);
    const inner = pre.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ch = probe.getBoundingClientRect().width / 100;
    // Solo l'output nuovo usa le colonne ricalcolate: quello già stampato resta com'è
    if (ch > 0 && inner > 0) cols = Math.max(MIN_COLS, Math.floor((inner + 0.5) / ch));
  };
  measure();
  new ResizeObserver(measure).observe(pre);
  document.fonts?.ready.then(measure).catch(() => {});

  let lastEcho: HTMLElement | null = null;
  // Se l'output dell'ultimo comando non sta nello schermo se ne mostra l'inizio, altrimenti il fondo.
  const reveal = () => {
    const padTop = parseFloat(getComputedStyle(pre).paddingTop);
    const bottom = pre.scrollHeight - pre.clientHeight;
    pre.scrollTop = lastEcho ? Math.min(bottom, lastEcho.offsetTop - padTop) : bottom;
  };

  const appendNodes = (nodes: HTMLElement[]) => {
    out.append(...nodes);
    while (out.childElementCount > MAX_LINES) {
      const first = out.firstElementChild!;
      if (first === lastEcho) lastEcho = null;
      first.remove();
    }
    reveal();
  };
  const append = (lines: Line[]) => appendNodes(lines.map(lineNode));

  const listeners: ((cmd: string) => void)[] = [];
  pre.addEventListener('click', (e) => {
    const target = e.target as Element;
    const a = target.closest?.('a[data-cmd]') as HTMLAnchorElement | null;
    if (a) {
      // Clic centrale o con modificatori: comportamento nativo del link
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      for (const cb of listeners) cb(a.dataset.cmd!);
      return;
    }
    if (target.closest?.('a')) return;
    if (isDesktop() && !getSelection()?.toString()) input.focus({ preventScroll: true });
  });

  return {
    input,
    cols: () => cols,
    remeasure: measure,
    print(blocks) {
      append(wrapBlocks(blocks, cols));
    },
    printRom(text) {
      if (!text) return append(wrapBlocks([{ type: 'blank' }], cols));
      const el = lineNode({ type: 'line', spans: [{ text }] });
      el.classList.add('rom');
      el.lastChild?.remove(); // la riga ROM è un blocco: niente "\n" finale
      appendNodes([el]);
    },
    echo(command) {
      const lines = wrapBlocks([{ type: 'line', spans: [{ text: label.textContent ?? '', style: 'dim' }, { text: command }] }], cols);
      const before = out.lastElementChild;
      append(lines);
      // con l'a capo l'eco può occupare più righe: si parte dalla prima
      lastEcho = (before ? before.nextElementSibling : out.firstElementChild) as HTMLElement | null;
      reveal();
    },
    clear() {
      out.replaceChildren();
      lastEcho = null;
      pre.scrollTop = 0;
    },
    setPrompt(text) {
      label.textContent = text;
    },
    showPrompt(show) {
      promptLine.hidden = !show;
    },
    setBusy(busy) {
      promptLine.classList.toggle('is-busy', busy);
    },
    focus() {
      input.focus({ preventScroll: true });
    },
    onCommand(cb) {
      listeners.push(cb);
    },
  };
}
