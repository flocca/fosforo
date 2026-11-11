// Livello 1: trasforma la pagina statica in un terminale vivo (tastiera e clic).
import type { Block } from '../lib/blocks';
import { localToday } from '../lib/dates';
import { findByPath, type FsNode } from '../lib/fs-tree';
import { promptCommand } from '../lib/level0';
import type { SiteConfig } from '../lib/schema';
import { createAudio } from './audio';
import { decideStart, runBoot, welcomeSpans } from './boot';
import { complete } from './complete';
import { createHistory } from './history';
import { createRouter, currentPath } from './router';
import { createScreen, isDesktop, type Screen } from './screen';
import { createShell, PHOSPHORS, type Phosphor, type Terminal } from './shell';
import * as prefs from './prefs';
import { createChips, isCoarsePointer } from './touch';

type SiteIndex = {
  root: FsNode;
  site: { host: string; user: string; boot: SiteConfig['boot'] };
  // `date` arriva già formattata (gg/mm/aaaa) da /_fs/index.json
  latestSong?: { path: string; label: string; date: string };
};

// Il contesto audio nasce solo dentro un gesto: clic sull'interruttore, o il primo
// tocco o tasto su un link profondo. Prima di allora `seek` non fa niente.
const audio = createAudio();

const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const REBOOT_OFF_MS = 400;
const FLASH_MS = 500;

const currentPhosphor = (): Phosphor => {
  const v = document.documentElement.dataset.fosfori as Phosphor;
  return PHOSPHORS.includes(v) ? v : 'verde';
};

// Stesso percorso del comando `fosfori` e del tasto del pannello.
function applyPhosphor(p: Phosphor) {
  document.documentElement.dataset.fosfori = p;
  prefs.setPhosphor(p);
  const button = document.querySelector<HTMLButtonElement>('.phosphor-button');
  if (button) button.title = `Fosfori: ${p}`;
}

// Stesso percorso del comando `suono` e del tasto del suono: etichetta e tasto mostrano la
// preferenza del visitatore, anche quando l'audio non è ancora partito.
function showSound(muted: boolean) {
  const state = document.querySelector<HTMLElement>('.sound-state');
  if (state) state.textContent = `suono: ${muted ? 'spento' : 'acceso'}`;
  const button = document.querySelector<HTMLButtonElement>('.sound-button');
  if (button) {
    const name = muted ? 'Suono spento' : 'Suono acceso';
    button.setAttribute('aria-label', name);
    button.title = name;
    button.setAttribute('aria-pressed', String(!muted));
  }
}

function applySound(muted: boolean) {
  audio.setMuted(muted);
  prefs.setSoundOff(muted);
  showSound(muted);
}

// Il tasto funziona subito, come il selettore dei fosfori: cambia il suono senza scrivere nel terminale.
function initSoundButton() {
  const button = document.querySelector<HTMLButtonElement>('.sound-button');
  if (!button) return;
  showSound(audio.muted);
  button.disabled = false;
  button.addEventListener('click', () => applySound(!audio.muted));
}

// Pagina nascosta: il contesto si ferma; tornando visibile riparte (se non è muto).
function initVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend();
    else audio.resume();
  });
}

// Il selettore dei fosfori funziona subito, a monitor spento o acceso, anche senza indice.
function initPhosphorButton() {
  const button = document.querySelector<HTMLButtonElement>('.phosphor-button');
  if (!button) return;
  button.title = `Fosfori: ${currentPhosphor()}`;
  button.disabled = false;
  button.addEventListener('click', () => {
    const i = PHOSPHORS.indexOf(currentPhosphor());
    applyPhosphor(PHOSPHORS[(i + 1) % PHOSPHORS.length]);
  });
}

async function main() {
  initPhosphorButton();
  initSoundButton();
  initVisibility();
  const html = document.documentElement;
  const pre = document.querySelector<HTMLPreElement>('#screen pre.term');
  if (!pre) {
    html.classList.remove('power-pending');
    return;
  }
  let index: SiteIndex;
  try {
    const res = await fetch('/_fs/index.json');
    if (!res.ok) throw new Error(`index.json: ${res.status}`);
    index = await res.json();
  } catch (e) {
    // senza indice resta la pagina statica, che funziona da sola: si riaccende lo schermo
    console.error('terminale non avviato', e);
    html.classList.remove('power-pending');
    return;
  }

  const { root, site } = index;
  const page = document.body.dataset.page ?? 'item';
  const screen = createScreen(pre, { keep: page === '404' });
  const titles = new Map<string, string>();
  const cache = new Map<string, Block[]>();

  const titleFor = (path: string) => {
    if (path === '') return site.host;
    const node = findByPath(root, path);
    return `${titles.get(path) ?? node?.title ?? node?.name ?? path} · ${site.host}`;
  };

  const router = createRouter({
    title: titleFor,
    onPop: (path) => exec(() => router.replay(() => showPath(path))),
  });

  const promptLabel = (cwd: string) => `${site.user}@${site.host} ${cwd ? `~/${cwd}` : '~'} $ `;
  const screenEl = document.querySelector<HTMLElement>('.screen')!;
  const led = document.querySelector('.led');
  const powerButton = document.querySelector<HTMLButtonElement>('.power-button');

  // ── accensione ────────────────────────────────────────────────────────────
  // off: home in attesa dell'interruttore; booting: righe della ROM; on: terminale pronto.
  let power: 'off' | 'booting' | 'on' = 'on';
  let booting: { skip(): void } | null = null;
  let poweredAt = 0;

  // Comandi rapidi del telefono: visibili solo a schermo acceso e con il tocco.
  // Durante il boot un tocco salta alla fine, come ogni tocco sullo schermo.
  const chips = createChips(document.querySelector<HTMLElement>('.chips')!, {
    onCommand: (cmd) => exec(() => runEcho(cmd)),
    onWrite: () => screen.focus(),
    onTap: () => {
      if (power !== 'booting') return false;
      booting?.skip();
      return true;
    },
  });

  const setScreenOn = (on: boolean) => {
    screenEl.classList.toggle('is-off', !on);
    chips.show(on);
    led?.classList.toggle('is-on', on);
    html.classList.remove('power-pending');
  };
  const setPowerButton = (enabled: boolean) => {
    if (!powerButton) return;
    powerButton.disabled = !enabled;
    powerButton.setAttribute('aria-label', enabled ? 'Accendi' : 'Acceso');
  };

  const term: Terminal = {
    cwd: '',
    print: (blocks) => screen.print(blocks),
    clear: () => screen.clear(),
    setCwd(path) {
      term.cwd = path;
      screen.setPrompt(promptLabel(path));
    },
    navigate: (path, mode) => router.navigate(path, mode),
    async fetchBlocks(path) {
      const hit = cache.get(path);
      if (hit) return hit;
      try {
        const res = await fetch(`/_fs/${path === '' ? 'root' : path}.json`);
        if (!res.ok) return null;
        const json = (await res.json()) as { title: string; blocks: Block[] };
        titles.set(path, json.title);
        cache.set(path, json.blocks);
        return json.blocks;
      } catch {
        return null;
      }
    },
    get phosphor(): Phosphor {
      return currentPhosphor();
    },
    setPhosphor: applyPhosphor,
    sound: {
      get muted() {
        return audio.muted;
      },
      setMuted: applySound,
    },
    // Schermo spento 400 ms, poi boot completo qualunque sia la data, dalla radice
    // (con il movimento ridotto l'avvio rapido).
    async reboot() {
      booting?.skip();
      // a contesto già nato (qui non siamo dentro il gesto): relè e smagnetizzazione
      if (audio.started) audio.powerOn();
      power = 'booting';
      setPowerButton(false);
      screen.clear();
      screen.showPrompt(false);
      setScreenOn(false);
      await sleep(REBOOT_OFF_MS);
      term.setCwd('');
      router.navigate('', 'push');
      await boot(reducedMotion() ? 'warm' : 'cold');
    },
    diskSeek: (n) => audio.seek(n),
  };
  term.setCwd('');

  const shell = createShell(root, term);
  const history = createHistory();

  // Comandi uno alla volta, nell'ordine in cui arrivano (tastiera, clic, avanti e indietro).
  let queue: Promise<void> = Promise.resolve();
  const exec = (fn: () => Promise<void>) => {
    queue = queue.then(fn).catch((e) => console.error('errore del terminale', e));
    return queue;
  };

  const runEcho = async (cmd: string) => {
    screen.echo(cmd);
    await shell.run(cmd);
  };

  // Mostra l'elemento di un indirizzo come se fosse stato aperto dalla radice; la cartella
  // attuale diventa quella dell'elemento (la cartella stessa per una cartella).
  async function showPath(path: string) {
    screen.clear();
    term.setCwd('');
    const node = findByPath(root, path);
    await runEcho(promptCommand(path, node?.type === 'dir'));
    if (!node) {
      screen.print([{ type: 'line', spans: [{ text: 'Prova ' }, { text: 'ls /', cmd: 'cd / && ls' }] }]);
      return;
    }
    const shown = node.type === 'alias' && node.target ? node.target : node.path;
    if (node.type !== 'dir') term.setCwd(parentOf(shown));
    router.navigate(shown, 'push');
  }

  // Righe della ROM, poi benvenuto e prompt. Gira dentro la coda dei comandi.
  async function boot(kind: 'cold' | 'warm') {
    power = 'booting';
    prefs.setLastBoot(localToday());
    screen.clear();
    screen.showPrompt(false);
    setScreenOn(true);
    if (!reducedMotion()) {
      screenEl.classList.remove('is-powering');
      void screenEl.offsetWidth; // riparte l'animazione anche al reboot
      screenEl.classList.add('is-powering');
      setTimeout(() => screenEl.classList.remove('is-powering'), FLASH_MS);
    }
    const song = index.latestSong;
    const run = runBoot({
      kind,
      rom: site.boot.rom,
      tokens: song ? { canzone: song.label, data: song.date } : {},
      print: (text) => screen.printRom(text),
      diskSeek: term.diskSeek,
      sleep,
    });
    booting = run;
    await run.done;
    booting = null;
    const touch = isCoarsePointer();
    const welcome = (touch && site.boot.welcomeTouch) || site.boot.welcome;
    screen.print([{ type: 'blank' }, { type: 'line', spans: welcomeSpans(welcome) }, { type: 'blank' }]);
    power = 'on';
    screen.showPrompt(true);
    if (isDesktop()) screen.focus();
  }

  // Primo clic sull'interruttore (o INVIO, o clic sullo schermo spento): una sola accensione.
  function powerOn() {
    if (power !== 'off') return;
    power = 'booting';
    poweredAt = performance.now();
    setPowerButton(false);
    audio.powerOn();
    const start = decideStart({ page: 'home', lastBoot: prefs.getLastBoot(), today: localToday(), reducedMotion: reducedMotion() });
    exec(() => boot(start === 'power-cold' ? 'cold' : 'warm'));
  }

  // Durante il boot un tasto o un clic sullo schermo salta alla fine
  // (non il secondo clic di un doppio clic che ha acceso).
  function skipBoot() {
    if (power === 'booting' && performance.now() - poweredAt > 250) booting?.skip();
  }

  // Link profondo: il primo tocco o tasto fa ripartire ventola e ronzio. I gesti dopo
  // sbloccano il contesto se il browser l'ha lasciato sospeso (un tocco su iOS e Android
  // non basta: serve il rilascio). La home aspetta l'interruttore.
  const unlockAudio = () => {
    if (audio.started) audio.resume();
    else if (page !== 'home') audio.spinUp();
  };
  for (const type of ['pointerdown', 'keydown', 'pointerup', 'touchend']) {
    document.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }

  powerButton?.addEventListener('click', powerOn);
  screenEl.addEventListener('click', () => (power === 'off' ? powerOn() : skipBoot()));
  document.addEventListener('keydown', (e) => {
    if (power === 'off') {
      // INVIO su un tasto del pannello lo preme già da sé
      if (e.key === 'Enter' && !(e.target as Element | null)?.closest?.('button')) {
        e.preventDefault();
        powerOn();
      }
    } else if (power === 'booting' && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      skipBoot();
    }
  });

  // ── avvio: un'unica funzione per tipo di pagina ───────────────────────────
  // La home parte spenta e aspetta l'interruttore.
  async function startHome() {
    screen.clear();
    screen.showPrompt(false);
    setScreenOn(false);
    power = 'off';
    setPowerButton(true);
    router.navigate('', 'push');
  }

  // La pagina 404 resta com'è (con il link per tornare) e sotto compare il prompt.
  async function startNotFound() {
    const back = pre!.querySelector<HTMLAnchorElement>('#back');
    if (back) {
      const target = new URL(back.href).pathname.replace(/^\/+/, '');
      back.dataset.cmd = target ? `cd /${target} && ls` : 'cd / && ls';
    }
    window.history.replaceState({ path: currentPath() }, '');
  }

  const start = () => {
    if (page === 'home') return router.replay(startHome);
    setScreenOn(true);
    setPowerButton(false);
    if (page === '404') return startNotFound();
    return router.replay(() => showPath(document.body.dataset.path ?? currentPath()));
  };
  await exec(start);

  // ── tastiera e clic ───────────────────────────────────────────────────────
  const input = screen.input;
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = input.value;
      input.value = '';
      history.push(line);
      exec(() => runEcho(line));
    } else if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) {
      // Con la riga vuota Tab sposta il fuoco come al solito
      e.preventDefault();
      const r = complete(root, term.cwd, input.value);
      if (r.options.length > 1) {
        screen.echo(input.value);
        screen.print([{ type: 'line', spans: [{ text: r.options.join('  ') }] }]);
      }
      setInput(screen, r.line);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const v = e.key === 'ArrowUp' ? history.up() : history.down();
      if (v !== null) setInput(screen, v);
    }
  });

  screen.onCommand((cmd) => {
    history.push(cmd);
    exec(() => runEcho(cmd));
  });

  if (power === 'on' && isDesktop()) screen.focus();
}

function setInput(screen: Screen, value: string) {
  screen.input.value = value;
  screen.input.setSelectionRange(value.length, value.length);
}

main();
