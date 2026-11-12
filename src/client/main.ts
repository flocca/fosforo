// Livello 1: trasforma la pagina statica in un terminale vivo (tastiera e clic).
import type { Block } from '../lib/blocks';
import { localToday } from '../lib/dates';
import { findByPath, type FsNode } from '../lib/fs-tree';
import { promptCommand } from '../lib/level0';
import type { SiteConfig } from '../lib/schema';
import { createAudio } from './audio';
import { bezelKey } from './bezel-key';
import { decideStart, runBoot, welcomeSpans } from './boot';
import { collapse, COLLAPSE_MS, HALT_PAUSE_MS, WARMUP_MS, warmUp } from './power-fx';
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
// la pausa più lunga prima del risultato di un comando che usa il disco (cat, ls)
const DISK_WAIT_MAX_S = 0.5;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// reboot con il movimento ridotto: niente collasso, schermo spento per questo tempo
const REBOOT_OFF_MS = 400;
// pulsante, INVIO o clic sullo schermo entro questo tempo dall'ultimo scatto non fanno niente:
// il doppio clic che accende (o spegne) resta uno scatto solo, anche col movimento ridotto
const SWITCH_GUARD_MS = 400;
// Nome del pulsante di accensione su un link aperto spento, seguito dal titolo della pagina.
// Bozza, da approvare da Giacomo.
const POWER_ON_LINK_LABEL = 'Accendi il monitor: ';

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

// Stesso percorso del comando `suono` e del tasto del suono: spia e tasto mostrano la
// preferenza del visitatore, anche quando l'audio non è ancora partito.
function showSound(muted: boolean) {
  document.querySelector('.sound-led')?.classList.toggle('is-on', !muted);
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
  // Spegnendo, pressione e rilascio si sentono prima che il suono vada via. Riaccendendo,
  // il tasto è sceso a suono spento: dopo si sente il rilascio (o tutto il tasto, con Invio).
  bezelKey(button, audio, (held) => {
    const muting = !audio.muted;
    if (muting && !held) audio.press();
    applySound(muting);
    if (!muting) {
      if (held) audio.keyUp();
      else audio.press();
    }
  });
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
  bezelKey(button, audio, (held) => {
    if (!held) audio.press();
    const i = PHOSPHORS.indexOf(currentPhosphor());
    applyPhosphor(PHOSPHORS[(i + 1) % PHOSPHORS.length]);
  });
}

// Il percorso di ritorno di un indirizzo inesistente, come nella pagina 404 statica:
// `lettura/` sotto /lettura/*, altrimenti la radice.
const backFor = (path: string) => (path.startsWith('lettura/') ? 'lettura' : '');

async function loadIndex(cache?: RequestCache): Promise<SiteIndex> {
  const res = await fetch('/_fs/index.json', cache ? { cache } : undefined);
  if (!res.ok) throw new Error(`index.json: ${res.status}`);
  return res.json();
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
    index = await loadIndex();
  } catch (e) {
    // senza indice resta la pagina statica, che funziona da sola: si riaccende lo schermo
    console.error('terminale non avviato', e);
    html.classList.remove('power-pending');
    return;
  }

  const { root, site } = index;
  const page = document.body.dataset.page ?? 'item';
  // Il livello 0 della pagina di un elemento, com'era prima del terminale: lo schermo lo
  // sposta nel suo output, qui ne resta una copia per l'accensione da link.
  const level0: Node[] = page === 'item' ? [...pre.childNodes].map((n) => n.cloneNode(true)) : [];
  // La pagina di un elemento tiene il livello 0 finché il gemello JSON non è arrivato:
  // senza rete resta il contenuto statico, con il prompt sotto.
  const screen = createScreen(pre, { keep: page !== 'home' });
  const titles = new Map<string, string>();
  const cache = new Map<string, Block[]>();

  const titleFor = (path: string) => {
    if (path === '') return site.host;
    const node = findByPath(root, path);
    return `${titles.get(path) ?? node?.title ?? node?.name ?? path} · ${site.host}`;
  };

  const router = createRouter({
    title: titleFor,
    onPop: (path) => {
      // durante il collasso si ignora: lo spegnimento torna comunque a /
      if (power === 'collapsing') return;
      if (power === 'off') {
        // a monitor spento / resta spento; un elemento si riaccende come un link profondo
        if (path === '') return;
        audio.spinUp();
        setScreenOn(true);
        setPower('on');
        screen.showPrompt(true);
        if (isDesktop()) screen.focus();
      }
      // spento mentre aspettava (Indietro durante la pausa di SYSTEM HALTED): niente, resta /
      exec(() => (power === 'on' ? router.replay(() => showPath(path)) : Promise.resolve()));
    },
  });

  const promptLabel = (cwd: string) => `${site.user}@${site.host} ${cwd ? `~/${cwd}` : '~'} $ `;
  const screenEl = document.querySelector<HTMLElement>('.screen')!;
  const led = document.querySelector('.power-led');
  const powerButton = document.querySelector<HTMLButtonElement>('.power-button');

  // ── accensione ────────────────────────────────────────────────────────────
  // off: monitor spento, in attesa dell'interruttore; warming: alone fino alla prima riga;
  // booting: righe della ROM; on: terminale pronto; collapsing: collasso dello spegnimento
  // (o del reboot). Durante alone e collasso pulsante, clic sullo schermo e INVIO non fanno niente.
  type Power = 'off' | 'warming' | 'booting' | 'on' | 'collapsing';
  let power: Power = 'on';
  let booting: { skip(): void; cancel(): void } | null = null;
  // ultimo scatto dell'interruttore, acceso o spento
  let switchedAt = -Infinity;
  // Link aperto spento: il percorso da mostrare dopo l'accensione (null sulla home e dopo
  // ogni spegnimento), il nome del pulsante e il gemello JSON scaricato mentre è spento.
  let linkPath: string | null = null;
  let linkName = '';
  let linkTwin: Promise<Block[] | null> = Promise.resolve(null);
  const justSwitched = () => performance.now() - switchedAt < SWITCH_GUARD_MS;

  // Comandi rapidi del telefono: visibili solo a schermo acceso e con il tocco.
  // Durante il boot un tocco salta alla fine, come ogni tocco sullo schermo.
  const chips = createChips(document.querySelector<HTMLElement>('.chips')!, {
    onCommand: (cmd) => exec(() => runEcho(cmd)),
    onWrite: () => screen.focus(),
    onTap: () => {
      if (power === 'on') return false;
      // durante il boot il tocco salta alla fine; con alone e collasso non fa niente
      if (power === 'booting') booting?.skip();
      return true;
    },
  });

  // Il collasso finisce qui: con is-collapsing la scritta "premi INVIO" resterebbe nascosta.
  const setScreenOn = (on: boolean) => {
    screenEl.classList.remove('is-collapsing');
    screenEl.classList.toggle('is-off', !on);
    chips.show(on);
    led?.classList.toggle('is-on', on);
    html.classList.remove('power-pending');
  };
  // Il pulsante segue lo stato: "Accendi" a monitor spento (e mentre si spegne), "Spegni" acceso;
  // su un link aperto spento il nome dice anche quale pagina si accende.
  const setPower = (next: Power) => {
    power = next;
    if (!powerButton) return;
    const name = next === 'off' && linkPath !== null ? linkName : next === 'off' || next === 'collapsing' ? 'Accendi' : 'Spegni';
    powerButton.disabled = next === 'warming' || next === 'collapsing';
    powerButton.setAttribute('aria-label', name);
    powerButton.title = name;
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
    // Gira dentro la coda (è un comando): lo spegnimento si fa qui, senza rimettersi in coda.
    async shutdown() {
      await sleep(HALT_PAUSE_MS);
      // il pulsante premuto durante la pausa ha già avviato lo spegnimento, che segue in coda
      if (beginPowerOff()) await finishPowerOff();
    },
    // Lo stesso collasso dello spegnimento, senza la scritta "premi INVIO", poi boot completo
    // qualunque sia la data, dalla radice (con il movimento ridotto l'avvio rapido).
    async reboot() {
      const reduced = reducedMotion();
      setPower('collapsing');
      // a contesto già nato (qui non siamo dentro il gesto): l'interruttore scatta, il tubo si
      // spegne e si riaccende quando il punto è sparito
      if (audio.started) audio.reboot(reduced ? REBOOT_OFF_MS / 1000 : COLLAPSE_MS / 1000);
      led?.classList.remove('is-on');
      screen.showPrompt(false);
      chips.show(false);
      if (reduced) {
        // niente collasso: schermo spento, con is-collapsing che nasconde la scritta
        screenEl.classList.add('is-off', 'is-collapsing');
        await sleep(REBOOT_OFF_MS);
      } else {
        await collapse(screenEl);
      }
      screen.clear();
      term.setCwd('');
      router.navigate('', 'push');
      linkPath = null;
      await boot(reduced ? 'warm' : 'cold');
    },
    // il risultato di un comando aspetta la testina, ma non più di DISK_WAIT_MAX_S
    diskSeek: (n) => {
      const s = audio.seek(n);
      return s > 0 ? sleep(Math.min(s, DISK_WAIT_MAX_S) * 1000) : undefined;
    },
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

  // Finché il comando lavora (disco, rete) si va solo a capo: il prompt torna con il risultato.
  // I comandi rimasti in coda (chip, link, righe battute) non fanno niente se il monitor non è acceso.
  const runEcho = async (cmd: string) => {
    if (power !== 'on') return;
    screen.echo(cmd);
    screen.setBusy(true);
    try {
      await shell.run(cmd);
    } finally {
      screen.setBusy(false);
    }
  };

  // L'indice può essere vecchio (cache del browser): un percorso che manca, o un alias che
  // punta altrove rispetto alla pagina statica, fa riscaricare l'indice una volta sola.
  let refreshed = false;
  async function nodeFor(path: string, aliasTarget?: string): Promise<FsNode | null> {
    const node = findByPath(root, path);
    const stale = !node || (aliasTarget !== undefined && node.type === 'alias' && node.target !== aliasTarget);
    if (!stale || refreshed) return node;
    refreshed = true;
    try {
      const fresh = await loadIndex('no-cache');
      // stesso oggetto: la shell e il completamento usano questa radice
      Object.assign(root, fresh.root);
      index.latestSong = fresh.latestSong;
      cache.clear();
    } catch (e) {
      console.error('indice non aggiornato', e);
    }
    return findByPath(root, path);
  }

  // Mostra l'elemento di un indirizzo come se fosse stato aperto dalla radice; la cartella
  // attuale diventa quella dell'elemento (la cartella stessa per una cartella).
  // Con `clear: false` (accensione da un link) quello che è a schermo resta sopra il comando.
  async function showPath(path: string, { clear = true }: { clear?: boolean } = {}) {
    const node = await nodeFor(path);
    if (clear) screen.clear();
    term.setCwd('');
    await runEcho(promptCommand(path, node?.type === 'dir'));
    if (!node) {
      const back = backFor(path);
      screen.print([{ type: 'line', spans: [{ text: 'Prova ' }, { text: `ls /${back}`, cmd: `cd /${back} && ls` }] }]);
      return;
    }
    const shown = node.type === 'alias' && node.target ? node.target : node.path;
    if (node.type !== 'dir') term.setCwd(parentOf(shown));
    router.navigate(shown, 'push');
  }

  // Righe della ROM, poi benvenuto e prompt. Gira dentro la coda dei comandi.
  // L'alone dura fino alla prima riga; il giorno si salva solo a boot finito, così un boot
  // interrotto dallo spegnimento si rifà completo alla prossima accensione.
  // Con `link` (link aperto spento): niente benvenuto, la riga della ROM resta e sotto compare
  // il contenuto del link; il giorno del boot non si scrive, quello dell'accensione sì (a contenuto
  // a schermo).
  async function boot(kind: 'cold' | 'warm', link?: string) {
    setPower('warming');
    screen.clear();
    screen.showPrompt(false);
    setScreenOn(true);
    warmUp(screenEl);
    const song = index.latestSong;
    const run = runBoot({
      kind,
      rom: site.boot.rom,
      tokens: song ? { canzone: song.label, data: song.date } : {},
      print: (text) => {
        if (power === 'warming') setPower('booting');
        screen.printRom(text);
      },
      diskSeek: term.diskSeek,
      sleep,
      warmupMs: reducedMotion() ? 0 : WARMUP_MS,
    });
    booting = run;
    const completed = await run.done;
    booting = null;
    // interrotto dallo spegnimento: niente benvenuto né prompt
    if (!completed) return;
    if (link !== undefined) return showLink(link);
    prefs.setLastPowerOn(localToday());
    prefs.setLastBoot(localToday());
    const touch = isCoarsePointer();
    const welcome = (touch && site.boot.welcomeTouch) || site.boot.welcome;
    screen.print([{ type: 'blank' }, { type: 'line', spans: welcomeSpans(welcome) }, { type: 'blank' }]);
    setPower('on');
    screen.showPrompt(true);
    if (isDesktop()) screen.focus();
  }

  // Dopo la riga della ROM: una riga vuota, il `cat` del link e il suo contenuto, con il
  // gemello scaricato a monitor spento. Senza gemello torna il livello 0 della pagina, con la
  // cartella dell'elemento. L'indirizzo si sostituisce, come aprendo il link acceso.
  async function showLink(link: string) {
    screen.print([{ type: 'blank' }]);
    // il comando del link si scrive solo a monitor acceso; da qui il monitor è come la home
    setPower('on');
    linkPath = null;
    const twin = await linkTwin;
    const node = findByPath(root, link);
    await router.replay(async () => {
      if (twin || node?.type === 'link') return showPath(link, { clear: false });
      screen.printStatic(level0);
      const shown = node?.type === 'alias' && node.target ? node.target : node?.path;
      if (node?.type === 'dir') term.setCwd(node.path);
      else if (shown !== undefined) term.setCwd(parentOf(shown));
      router.navigate(link, 'push');
    });
    // spento mentre aspettava il gemello: resta spento, e l'accensione non conta
    if (power !== 'on') return;
    prefs.setLastPowerOn(localToday());
    screen.showPrompt(true);
    if (isDesktop()) screen.focus();
  }

  // Clic sull'interruttore (o INVIO, o clic sullo schermo spento): una sola accensione.
  function powerOn() {
    if (power !== 'off' || justSwitched()) return;
    setPower('warming');
    switchedAt = performance.now();
    audio.powerOn();
    if (linkPath !== null) {
      const link = linkPath;
      exec(() => boot('warm', link));
      return;
    }
    const start = decideStart({ page: 'home', lastBoot: prefs.getLastBoot(), lastPowerOn: prefs.getLastPowerOn(), today: localToday(), reducedMotion: reducedMotion() });
    exec(() => boot(start === 'power-cold' ? 'cold' : 'warm'));
  }

  // Spegnimento, prima parte, subito allo scatto: il boot in corso si ferma, la spia si spegne,
  // parte il collasso insieme al suono, il campo si svuota e perde il fuoco (sul telefono si
  // chiude la tastiera). Da qui pulsante, clic, INVIO e comandi in coda non fanno niente.
  // Dice false se il monitor non era acceso.
  let collapsing: Promise<void> = Promise.resolve();
  function beginPowerOff(): boolean {
    if (power !== 'on' && power !== 'booting') return false;
    booting?.cancel();
    setPower('collapsing');
    switchedAt = performance.now();
    led?.classList.remove('is-on');
    audio.powerOff();
    collapsing = collapse(screenEl);
    screen.input.value = '';
    screen.input.blur();
    screen.showPrompt(false);
    chips.show(false);
    return true;
  }

  // Seconda parte, nella coda (dopo il comando che stava lavorando, che stampa sotto il collasso):
  // fine del collasso, schermo vuoto, radice e indirizzo / (sostituito se è già /), poi lo
  // stato spento con la scritta.
  async function finishPowerOff() {
    await collapsing;
    screen.clear();
    term.setCwd('');
    router.navigate('', 'push');
    linkPath = null;
    setScreenOn(false);
    setPower('off');
  }

  // dal pulsante: subito dopo un'accensione non spegne
  function powerOff() {
    if (justSwitched()) return;
    if (beginPowerOff()) exec(finishPowerOff);
  }

  // Durante il boot un tasto o un clic sullo schermo salta alla fine
  // (non il secondo clic di un doppio clic che ha acceso).
  function skipBoot() {
    if (power === 'booting' && performance.now() - switchedAt > 250) booting?.skip();
  }

  // Link profondo: il primo tocco o tasto fa ripartire ventola e ronzio. I gesti dopo
  // sbloccano il contesto se il browser l'ha lasciato sospeso (un tocco su iOS e Android
  // non basta: serve il rilascio). La home aspetta l'interruttore.
  // Se il primo gesto è il pulsante (che spegne) l'ambiente non parte: lo spegnimento è muto.
  // A monitor spento l'audio nasce con l'interruttore, non qui.
  const unlockAudio = (e: Event) => {
    if (audio.started) audio.resume();
    else if (page !== 'home' && power === 'on' && !(e.target as Element | null)?.closest?.('.power-button')) audio.spinUp();
  };
  for (const type of ['pointerdown', 'keydown', 'pointerup', 'touchend']) {
    document.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }

  powerButton?.addEventListener('click', () => (power === 'off' ? powerOn() : powerOff()));
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
    setPower('off');
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

  // L'elemento di un link profondo e il suo gemello JSON, con il font pronto per andare a capo.
  // Il gemello è null se l'albero non conosce l'elemento, se è un link o se non arriva.
  async function itemTwin(path: string, aliasTarget: string | undefined) {
    const node = await nodeFor(path, aliasTarget);
    const shown = node?.type === 'alias' ? node.target : node?.path;
    if (node?.type === 'link') return { node, shown, twin: null };
    // un alias che punta ancora altrove (indice non aggiornato) mostra la pagina statica
    const agrees = !(node?.type === 'alias' && aliasTarget !== undefined && shown !== aliasTarget);
    const twin = node && shown !== undefined && agrees ? await term.fetchBlocks(shown) : null;
    if (twin) {
      // si va a capo con le colonne di Fira Mono: se il font non è ancora arrivato si aspetta
      // (al massimo un secondo), altrimenti il testo andrebbe a capo con le misure del font di riserva
      // (`fonts.ready` non basta: prima del primo disegno il font non è ancora richiesto)
      await Promise.race([document.fonts?.load('400 1em "Fira Mono"', 'M').catch(() => {}), sleep(1000)]);
      screen.remeasure();
    }
    return { node, shown, twin };
  }

  // Link profondo: la pagina statica esiste, quindi l'elemento c'è. Se l'albero non lo
  // conosce o il gemello JSON non arriva, resta il livello 0 e sotto compare il prompt.
  async function startItem() {
    const path = document.body.dataset.path ?? currentPath();
    const { node, shown, twin } = await itemTwin(path, document.body.dataset.aliasTarget);
    if (node?.type === 'link') return showPath(path);
    if (!twin) {
      if (node && node.type !== 'dir' && shown !== undefined) term.setCwd(parentOf(shown));
      else if (node?.type === 'dir') term.setCwd(node.path);
      window.history.replaceState({ path: currentPath() }, '');
      return;
    }
    await showPath(path);
  }

  // Link profondo la prima volta del giorno: monitor spento come la home, ma il livello 0 resta
  // nella pagina sotto lo schermo spento. Il gemello si scarica subito, senza stampare: lo
  // mostra l'accensione. Non aspetta il gemello, così l'interruttore risponde da subito.
  function startItemOff() {
    const path = document.body.dataset.path ?? currentPath();
    linkPath = path;
    linkName = `${POWER_ON_LINK_LABEL}${findByPath(root, path)?.title ?? document.title}`;
    screen.showPrompt(false);
    setScreenOn(false);
    setPower('off');
    window.history.replaceState({ path: currentPath() }, '');
    linkTwin = itemTwin(path, document.body.dataset.aliasTarget).then(
      (r) => r.twin,
      () => null,
    );
  }

  const start = async () => {
    if (page === 'home') return router.replay(startHome);
    if (page === 'item') {
      const kind = decideStart({ page, lastBoot: prefs.getLastBoot(), lastPowerOn: prefs.getLastPowerOn(), today: localToday(), reducedMotion: reducedMotion() });
      if (kind === 'power-link') return startItemOff();
    }
    setScreenOn(true);
    setPower('on');
    if (page === '404') return startNotFound();
    return router.replay(startItem);
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

// Lo script in testa alla pagina toglie power-pending al `load` se il client non è partito.
(window as { fosforoClient?: boolean }).fosforoClient = true;
main().catch((e) => {
  console.error('terminale non avviato', e);
  document.documentElement.classList.remove('power-pending');
});
