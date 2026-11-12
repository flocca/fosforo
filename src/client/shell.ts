// Interprete dei comandi del terminale: puro, parla con lo schermo solo tramite `Terminal`.
import type { Block, Span } from '../lib/blocks';
import { findByPath, listing, resolvePath, type FsNode } from '../lib/fs-tree';

export const PHOSPHORS = ['verde', 'ambra', 'bianco'] as const;
export type Phosphor = (typeof PHOSPHORS)[number];

export interface Terminal {
  print(blocks: Block[]): void;
  clear(): void;
  cwd: string;
  setCwd(path: string): void;
  navigate(path: string, mode: 'push' | 'none'): void;
  fetchBlocks(path: string): Promise<Block[] | null>;
  phosphor: Phosphor; // fosfori attuali, per `fosfori` senza argomento
  setPhosphor(p: Phosphor): void;
  sound: { muted: boolean; setMuted(m: boolean): void };
  reboot(): void | Promise<void>; // finisce quando il nuovo boot è concluso
  /** Muove il disco; finisce quando il risultato può comparire (subito, se il disco non suona). */
  diskSeek(n: number): Promise<void> | void;
}

// Nell'ordine di `help`.
const HELP: [string, string][] = [
  ['ls', 'elenca i file'],
  ['cd', 'cambia cartella'],
  ['cat', 'mostra un file'],
  ['pwd', 'mostra la cartella attuale'],
  ['clear', 'pulisce lo schermo'],
  ['suono', 'accende o spegne il suono'],
  ['fosfori', 'cambia colore: verde, ambra, bianco'],
  ['reboot', 'riavvia il terminale'],
  ['help', 'questo elenco'],
];

export const COMMANDS = HELP.map(([name]) => name);

const line = (...spans: Span[]): Block => ({ type: 'line', spans });
const t = (text: string, extra: Omit<Span, 'text'> = {}): Span => ({ text, ...extra });

// Le scelte come comandi cliccabili: "verde, ambra, bianco".
function choices(cmd: string, values: readonly string[], sep = ', '): Span[] {
  return values.flatMap((v, i) => (i ? [t(sep), t(v, { cmd: `${cmd} ${v}` })] : [t(v, { cmd: `${cmd} ${v}` })]));
}

type Result = boolean; // false = errore, ferma la catena `&&`

export function createShell(root: FsNode, term: Terminal) {
  const err = (...spans: Span[]): Result => {
    term.print([line(...spans)]);
    return false;
  };
  const notFound = (cmd: string, arg: string) => err(t(`${cmd}: ${arg}: file o cartella inesistente`));

  const commands: Record<string, (args: string[]) => Promise<Result> | Result> = {
    help() {
      const width = Math.max(...COMMANDS.map((c) => c.length)) + 2;
      term.print(HELP.map(([name, desc]) => line(t(name, { cmd: name }), t(' '.repeat(width - name.length) + desc))));
      return true;
    },

    async ls([arg = '']) {
      // resolvePath tratta '' come la radice: senza argomento si elenca la cartella attuale
      const node = arg ? resolvePath(root, term.cwd, arg) : findByPath(root, term.cwd);
      if (!node) return notFound('ls', arg);
      // il disco legge la cartella, come per `cat` ma più breve: parte subito, e il
      // risultato compare quando ha finito
      const disk = term.diskSeek(2);
      if (node.type !== 'dir') {
        await disk;
        term.print([line(t(node.name))]);
        return true;
      }
      // La forma di una cartella è quella del suo gemello JSON (`lettura/` ha il riepilogo
      // delle letture); senza rete basta l'elenco dell'albero.
      const blocks = (await term.fetchBlocks(node.path)) ?? listing(node);
      await disk;
      term.print(blocks);
      return true;
    },

    cd([arg = '']) {
      const node = resolvePath(root, term.cwd, arg);
      if (!node) return notFound('cd', arg);
      if (node.type !== 'dir') return err(t(`cd: ${arg}: non è una cartella`));
      term.setCwd(node.path);
      term.navigate(node.path, 'push');
      return true;
    },

    async cat([arg]) {
      if (!arg) return err(t('cat: specifica un file'));
      let node = resolvePath(root, term.cwd, arg);
      if (node?.type === 'alias') node = node.target ? resolvePath(root, '', `/${node.target}`) : null;
      if (!node) return notFound('cat', arg);
      if (node.type === 'dir') return err(t(`cat: ${arg}: è una cartella`));
      if (node.type === 'link') {
        term.print([line(t(`${node.title ?? node.name}: `), t(node.target ?? '', { href: node.target }))]);
        return true;
      }
      // il disco parte subito e lavora mentre il file arriva dalla rete
      const disk = term.diskSeek(4);
      const blocks = await term.fetchBlocks(node.path);
      await disk;
      if (!blocks) return err(t(`cat: ${arg}: impossibile leggere il file`));
      term.print(blocks);
      term.navigate(node.path, 'push');
      return true;
    },

    pwd() {
      term.print([line(t(`/${term.cwd}`))]);
      return true;
    },

    clear() {
      term.clear();
      return true;
    },

    suono([arg]) {
      let muted: boolean;
      if (arg === undefined) muted = !term.sound.muted;
      else if (arg === 'acceso' || arg === 'spento') muted = arg === 'spento';
      else return err(t(`suono: ${arg}: scegli tra `), ...choices('suono', ['acceso', 'spento'], ' e '));
      term.sound.setMuted(muted);
      term.print([line(t(muted ? 'Suono spento.' : 'Suono acceso.'))]);
      return true;
    },

    fosfori([arg]) {
      if (arg === undefined) {
        term.print([line(t(`Fosfori: ${term.phosphor}. Scegli tra `), ...choices('fosfori', PHOSPHORS), t('.'))]);
        return true;
      }
      if (!(PHOSPHORS as readonly string[]).includes(arg)) {
        return err(t(`fosfori: ${arg}: scegli tra `), ...choices('fosfori', PHOSPHORS), t('.'));
      }
      term.setPhosphor(arg as Phosphor);
      term.print([line(t(`Fosfori: ${arg}.`))]);
      return true;
    },

    async reboot() {
      await term.reboot();
      return true;
    },
  };

  async function runOne(segment: string): Promise<Result> {
    const [name, ...args] = segment.trim().split(/\s+/);
    if (!name) return true;
    const cmd = Object.hasOwn(commands, name) ? commands[name] : undefined;
    if (!cmd) return err(t(`${name}: comando non trovato. Prova `), t('help', { cmd: 'help' }), t('.'));
    return cmd(args);
  }

  return {
    commands: COMMANDS,
    async run(input: string): Promise<void> {
      for (const segment of input.split('&&')) {
        if (!(await runOne(segment))) return;
      }
    },
  };
}
