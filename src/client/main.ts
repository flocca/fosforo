// Livello 1: trasforma la pagina statica in un terminale vivo (tastiera e clic).
import type { Block } from '../lib/blocks';
import { localToday } from '../lib/dates';
import { findByPath, type FsNode } from '../lib/fs-tree';
import { promptCommand } from '../lib/level0';
import type { SiteConfig } from '../lib/schema';
import { decideStart, runBoot, welcomeSpans } from './boot';
import { complete } from './complete';
import { createHistory } from './history';
import { createRouter, currentPath } from './router';
import { createScreen, isDesktop, type Screen } from './screen';
import { createShell, PHOSPHORS, type Phosphor, type Terminal } from './shell';
import * as prefs from './prefs';

type SiteIndex = {
  root: FsNode;
  site: { host: string; user: string; boot: SiteConfig['boot'] };
  // `date` arriva già formattata (gg/mm/aaaa) da /_fs/index.json
  latestSong?: { path: string; label: string; date: string };
};

// Suono: lo implementa il Task 9. `powerOn` va chiamato dentro il gestore del clic
// (i browser permettono di creare l'audio solo lì); `diskSeek` è la testina del disco.
const audio = {
  powerOn() {},
  diskSeek(_n: number) {},
};

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
  const indicator = document.querySelector('.sound-indicator');
  const screenEl = document.querySelector<HTMLElement>('.screen')!;
  const led = document.querySelector('.led');
  const powerButton = document.querySelector<HTMLButtonElement>('.power-button');

  // ── accensione ────────────────────────────────────────────────────────────
  // off: home in attesa dell'interruttore; booting: righe della ROM; on: terminale pronto.
  let power: 'off' | 'booting' | 'on' = 'on';
  let booting: { skip(): void } | null = null;
  let poweredAt = 0;

  const setScreenOn = (on: boolean) => {
    screenEl.classList.toggle('is-off', !on);
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
      muted: prefs.isSoundOff(),
      setMuted(m) {
        term.sound.muted = m;
        prefs.setSoundOff(m);
        if (indicator) indicator.textContent = `suono: ${m ? 'spento' : 'acceso'}`;
      },
    },
    // Schermo spento 400 ms, poi boot completo qualunque sia la data, dalla radice
    // (con il movimento ridotto l'avvio rapido).
    async reboot() {
      booting?.skip();
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
    diskSeek: (n) => audio.diskSeek(n),
  };
  term.setCwd('');
  if (indicator) indicator.textContent = `suono: ${term.sound.muted ? 'spento' : 'acceso'}`;

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
      print: (text) => screen.print([text ? { type: 'line', spans: [{ text }] } : { type: 'blank' }]),
      diskSeek: term.diskSeek,
      sleep,
    });
    booting = run;
    await run.done;
    booting = null;
    const touch = matchMedia('(pointer: coarse)').matches;
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
