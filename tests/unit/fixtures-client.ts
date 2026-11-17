// Albero e terminale finti per i test del client (shell e completamento).
import type { Block } from '../../src/lib/blocks';
import type { FsNode } from '../../src/lib/fs-tree';
import type { Phosphor, Terminal } from '../../src/client/shell';
import { nextSetting, type SoundLevel, type SoundSetting } from '../../src/client/volume';

export const root: FsNode = {
  name: '',
  path: '',
  type: 'dir',
  children: [
    { name: 'canzone-del-giorno', path: 'canzone-del-giorno', type: 'alias', target: 'canzoni/2026-11-10', title: 'canzone del giorno' },
    {
      name: 'canzoni',
      path: 'canzoni',
      type: 'dir',
      children: [
        { name: '2026-11-10', path: 'canzoni/2026-11-10', type: 'file', title: 'Un giorno qualunque' },
        { name: '2026-11-09', path: 'canzoni/2026-11-09', type: 'file', title: 'Seconda canzone' },
      ],
    },
    {
      name: 'lettura',
      path: 'lettura',
      type: 'dir',
      children: [{ name: 'termination-shock', path: 'lettura/termination-shock', type: 'file', title: 'Termination Shock' }],
    },
    { name: 'messaggi', path: 'messaggi', type: 'dir', children: [] },
    { name: 'chi-sono', path: 'chi-sono', type: 'file', title: 'Chi sono' },
    { name: 'owlcavelabs', path: 'owlcavelabs', type: 'link', title: 'Owl Cave Labs', target: 'https://owlcavelabs.it' },
  ],
};

export type FakeTerminal = Omit<Terminal, 'sound'> & {
  sound: Terminal['sound'] & { deviceLevel: SoundLevel }; // scrivibile nei test
  printed: Block[][];
  navigations: [string, string][];
  phosphors: Phosphor[];
  sounds: string[]; // chiamate a `sound`: 'step' oppure 'set <impostazione>'
  seeks: number[];
  clears: number;
  reboots: number;
  shutdowns: number;
  text(): string[]; // righe stampate, come testo semplice
};

export function fakeTerminal(): FakeTerminal {
  let setting: SoundSetting = 'medio';
  const t: FakeTerminal = {
    printed: [],
    navigations: [],
    phosphors: [],
    sounds: [],
    seeks: [],
    clears: 0,
    reboots: 0,
    shutdowns: 0,
    cwd: '',
    phosphor: 'verde',
    print(blocks) {
      t.printed.push(blocks);
    },
    clear() {
      t.clears++;
    },
    setCwd(path) {
      t.cwd = path;
    },
    navigate(path, mode) {
      t.navigations.push([path, mode]);
    },
    async fetchBlocks(path) {
      if (path.startsWith('canzoni/') || path === 'chi-sono' || path.startsWith('lettura/')) {
        return [{ type: 'line', spans: [{ text: `contenuto di ${path}` }] }];
      }
      return null;
    },
    setPhosphor(p) {
      t.phosphors.push(p);
      t.phosphor = p;
    },
    sound: {
      deviceLevel: 'medio',
      step() {
        t.sounds.push('step');
        setting = nextSetting(setting);
        return setting;
      },
      set(s) {
        t.sounds.push(`set ${s}`);
        setting = s;
      },
    },
    reboot() {
      t.reboots++;
    },
    shutdown() {
      t.shutdowns++;
    },
    diskSeek(n) {
      t.seeks.push(n);
    },
    text() {
      return t.printed.flat().map((b) => (b.type === 'line' ? b.spans.map((s) => s.text).join('') : b.type === 'blank' ? '' : `[img ${b.alt}]`));
    },
  };
  return t;
}
