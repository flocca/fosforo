// Livello 1: trasforma la pagina statica in un terminale vivo (tastiera e clic).
import type { Block } from '../lib/blocks';
import { findByPath, type FsNode } from '../lib/fs-tree';
import { promptCommand } from '../lib/level0';
import { complete } from './complete';
import { createHistory } from './history';
import { createRouter, currentPath } from './router';
import { createScreen, isDesktop, type Screen } from './screen';
import { createShell, PHOSPHORS, type Phosphor, type Terminal } from './shell';

type SiteIndex = {
  root: FsNode;
  site: { host: string; user: string; boot: { welcome: string; welcomeTouch?: string } };
  latestSong?: { path: string; label: string; date: string };
};

// Unico punto che scrive le preferenze (Task 8 lo sostituisce con il modulo delle preferenze).
function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage non disponibile: la scelta vale solo per questa visita
  }
}

const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');

async function main() {
  const pre = document.querySelector<HTMLPreElement>('#screen pre.term');
  if (!pre) return;
  let index: SiteIndex;
  try {
    const res = await fetch('/_fs/index.json');
    if (!res.ok) throw new Error(`index.json: ${res.status}`);
    index = await res.json();
  } catch (e) {
    // senza indice resta la pagina statica, che funziona da sola
    console.error('terminale non avviato', e);
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
      const v = document.documentElement.dataset.fosfori as Phosphor;
      return PHOSPHORS.includes(v) ? v : 'verde';
    },
    setPhosphor(p) {
      document.documentElement.dataset.fosfori = p;
      savePref('fosforo.fosfori', p);
    },
    sound: {
      muted: false,
      setMuted(m) {
        term.sound.muted = m;
        if (indicator) indicator.textContent = `suono: ${m ? 'spento' : 'acceso'}`;
      },
    },
    // Riavvio e disco arrivano con l'accensione e il suono (Task 8 e 9)
    reboot() {},
    diskSeek() {},
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

  // ── avvio: un'unica funzione per tipo di pagina ───────────────────────────
  // Task 8 sostituisce startHome con l'interruttore e il boot.
  async function startHome() {
    screen.clear();
    screen.print([{ type: 'line', spans: [{ text: site.boot.welcome }] }, { type: 'blank' }]);
    await runEcho('ls');
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

  if (isDesktop()) screen.focus();
}

function setInput(screen: Screen, value: string) {
  screen.input.value = value;
  screen.input.setSelectionRange(value.length, value.length);
}

main();
