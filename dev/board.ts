// Banco dei suoni (/_suoni, solo `astro dev`): ascoltare, confrontare e regolare le voci.
// Per ogni voce: nuovo (sintesi modale di src/client/sound), attuale (le voci di audio.ts),
// registrazione (CC0 / CC BY da .cache/suoni). "copia valori" copia il JSON dei parametri.
import { PROFILES, SCHEMA, VOICES, getProfile, type Params, type Profile, type VoiceId } from '../src/client/sound/profiles';
import { Synth, createCase, type Case, type Handle } from '../src/client/sound/voices';
import { Legacy } from './legacy';
import { CLIPS, RECORDINGS, clipFile, type Clip } from './recordings';

type Source = 'nuovo' | 'attuale' | 'registrazione';

const TITLES: Record<VoiceId, string> = {
  interruttore: 'Interruttore e relè',
  tubo: 'Tubo che si accende',
  smagnetizzazione: 'Smagnetizzazione',
  ventola: 'Ventola',
  rete: 'Ronzio di rete',
  disco: 'Disco',
  tasti: 'Tasti della cornice',
  cassa: 'Mobile (comune a tutte le voci nuove)',
};

const HINTS: Record<VoiceId, string> = {
  interruttore: 'Il clic del contatto con i rimbalzi e il corpo del mobile che risuona.',
  tubo: "Crepitio dell'alta tensione che si carica e fischio del flyback che sale in un secondo.",
  smagnetizzazione: 'Il "bwong": la bobina vibra al doppio della rete e la corrente cala in un secondo o due.',
  ventola: 'Soffio largo, tono del passaggio delle pale, sbilanciamento al giro, variazione casuale del flusso.',
  rete: 'Magnetostrizione del trasformatore: soprattutto il doppio della rete e le armoniche pari.',
  disco: 'Passi della testina a ritmo costante, seek che si fondono in un "brrrt", motore che gira.',
  tasti: 'I tre tasti fisici sulla cornice: pressione e rilascio, tre caratteri diversi.',
  cassa: 'Risposta del mobile e passa basso: le voci nuove suonano dallo stesso oggetto.',
};

// azioni di ogni voce: etichetta e identificativo
const ACTIONS: Record<VoiceId, [string, string][]> = {
  interruttore: [
    ['accendi', 'on'],
    ['spegni', 'off'],
  ],
  tubo: [
    ['accendi', 'on'],
    ['spegni', 'off'],
  ],
  smagnetizzazione: [['suona', 'play']],
  ventola: [
    ['avvia (prende giri)', 'start'],
    ['avvia a regime', 'run'],
    ['ferma', 'stop'],
  ],
  rete: [
    ['avvia con lo spunto', 'start'],
    ['avvia senza spunto', 'run'],
    ['ferma', 'stop'],
  ],
  disco: [
    ['un passo', 'step'],
    ['seek', 'seek'],
    ['seek di 1, 4, 10', 'seeks'],
    ['ricalibra', 'recal'],
    ['carica la testina', 'headload'],
    ['motore: avvia', 'motor'],
    ['motore: ferma', 'motorstop'],
  ],
  tasti: [
    ['suono: premi e rilascia', 'sound'],
    ['fosfori: premi e rilascia', 'phosphor'],
    ['accensione: premi e rilascia', 'power'],
    ['accensione: solo premi', 'power-press'],
    ['accensione: solo rilascia', 'power-release'],
  ],
  cassa: [],
};

// le voci che esistono anche in audio.ts
const HAS_LEGACY: VoiceId[] = ['interruttore', 'tubo', 'smagnetizzazione', 'ventola', 'rete', 'disco'];

type ClipState = { clip: Clip; start: number; duration: number; gain: number };

const state = {
  profile: PROFILES[0] as Profile,
  params: {} as Record<VoiceId, Params>,
  source: {} as Record<VoiceId, Source>,
  clips: {} as Partial<Record<VoiceId, ClipState>>,
  master: 0.5,
  phone: false,
};

function loadProfile(p: Profile) {
  state.profile = p;
  state.params = structuredClone(p.params);
  for (const v of VOICES) {
    state.source[v] = 'nuovo';
    const c = CLIPS.find((x) => x.voice === v);
    if (c) state.clips[v] = { clip: c, start: c.start, duration: c.duration, gain: 1 };
  }
}

// ---------- catena audio ----------

class Rig {
  readonly master: GainNode;
  readonly direct: GainNode;
  readonly case: Case;
  readonly synth: Synth;
  readonly legacy: Legacy;
  private hp: BiquadFilterNode;
  private lp: BiquadFilterNode;
  private phoneIn: GainNode;
  private dryOut: GainNode;
  running: Partial<Record<VoiceId, Handle[]>> = {};
  private decoded = new Map<string, AudioBuffer | null>();

  constructor(
    readonly ctx: BaseAudioContext,
    seed = 1,
  ) {
    this.master = ctx.createGain();
    this.master.gain.value = state.master;
    // anteprima altoparlante del telefono: passa banda ~300 Hz-6 kHz
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 300;
    this.hp.Q.value = 0.7;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 6000;
    this.lp.Q.value = 0.7;
    this.phoneIn = ctx.createGain();
    this.dryOut = ctx.createGain();
    this.master.connect(this.phoneIn).connect(this.hp).connect(this.lp).connect(ctx.destination);
    this.master.connect(this.dryOut).connect(ctx.destination);
    this.setPhone(state.phone);
    this.direct = ctx.createGain();
    this.direct.connect(this.master);
    this.case = createCase(ctx, this.master, state.params.cassa);
    this.synth = new Synth(ctx, { mech: this.case.input, direct: this.direct }, seed);
    this.legacy = new Legacy(ctx, this.direct);
  }

  setPhone(on: boolean) {
    this.phoneIn.gain.value = on ? 1 : 0;
    this.dryOut.gain.value = on ? 0 : 1;
  }

  keep(v: VoiceId, h: Handle) {
    (this.running[v] ??= []).push(h);
  }

  stop(v: VoiceId, at = this.ctx.currentTime) {
    for (const h of this.running[v] ?? []) h.stop(at);
    this.running[v] = [];
  }

  async clipBuffer(c: Clip): Promise<AudioBuffer | null> {
    const file = clipFile(c);
    if (!file) return null;
    if (this.decoded.has(file)) return this.decoded.get(file)!;
    let buf: AudioBuffer | null = null;
    for (const ext of ['webm', 'm4a']) {
      try {
        const res = await fetch(`/_suoni/registrazioni/${file}.${ext}`);
        if (!res.ok) continue;
        buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        break;
      } catch {
        // Opus non decodificato (Safari vecchio): si prova l'AAC
      }
    }
    this.decoded.set(file, buf);
    return buf;
  }

  /** Suona una clip: un colpo solo o in loop, con 10 ms di raccordo agli estremi. */
  playClip(cs: ClipState, buf: AudioBuffer, at: number, loop: boolean): Handle {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    src.connect(g).connect(this.direct);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(cs.gain, at + 0.01);
    if (loop) {
      src.loop = true;
      src.loopStart = cs.start;
      src.loopEnd = cs.start + cs.duration;
      src.start(at, cs.start);
    } else {
      src.start(at, cs.start, cs.duration);
      g.gain.setValueAtTime(cs.gain, at + Math.max(0.02, cs.duration - 0.03));
      g.gain.linearRampToValueAtTime(0, at + cs.duration);
    }
    return {
      stop: (t = this.ctx.currentTime) => {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.05);
        src.stop(t + 0.06);
      },
    };
  }
}

const mains = () => state.params.rete.mains;

/** Esegue un'azione di una voce con la sorgente scelta. Restituisce la durata stimata (s). */
async function act(rig: Rig, v: VoiceId, action: string, at: number, source: Source = state.source[v]): Promise<number> {
  const p = state.params[v];
  const kind = state.profile.disk ?? 'cinque';
  const s = rig.synth;
  const L = rig.legacy;

  if (source === 'registrazione') {
    const cs = state.clips[v];
    if (!cs) return 0;
    if (action.startsWith('stop') || action === 'off' || action === 'motorstop') {
      rig.stop(v, at);
      if (action !== 'off') return 0;
    }
    const buf = await rig.clipBuffer(cs.clip);
    if (!buf) {
      say(`registrazione mancante: ${cs.clip.label}. Lancia dev/scarica-suoni.sh.`);
      return 0;
    }
    rig.keep(v, rig.playClip(cs, buf, at, !!cs.clip.loop));
    return cs.duration;
  }

  if (source === 'attuale') {
    switch (v) {
      case 'interruttore':
        L.relay(at);
        return 0.3;
      case 'tubo':
        if (action === 'off') rig.stop(v, at);
        else rig.keep(v, L.whine(at));
        return 1;
      case 'smagnetizzazione':
        L.degauss(at);
        return 1.7;
      case 'ventola':
        if (action === 'stop') rig.stop(v, at);
        else rig.keep(v, L.fan(at, action === 'start' ? 2.5 : 0));
        return 2.5;
      case 'rete':
        if (action === 'stop') rig.stop(v, at);
        else rig.keep(v, L.hum(at));
        return 1;
      case 'disco':
        if (action === 'motor') L.driveSpinUp(at);
        else if (action === 'motorstop' || action === 'headload') return 0;
        else if (action === 'step') L.seek(1, at);
        else if (action === 'seeks') {
          let t = L.seek(1, at);
          t = L.seek(4, t + 0.3);
          L.seek(10, t + 0.3);
        } else L.seek(action === 'recal' ? p.recalSteps : p.seekN, at);
        return 1;
      default:
        return 0;
    }
  }

  switch (v) {
    case 'interruttore':
      s.relay(p, at, action === 'off' ? 'off' : 'on');
      return 0.3;
    case 'tubo':
      if (action === 'off') rig.stop(v, at);
      else rig.keep(v, s.tube(p, mains(), at));
      return p.crackleDur;
    case 'smagnetizzazione':
      s.degauss({ ...p, on: 1 }, mains(), at);
      return p.decay * 4;
    case 'ventola':
      if (action === 'stop') rig.stop(v, at);
      else rig.keep(v, s.fan(p, mains(), at, action === 'start'));
      return p.spinUp;
    case 'rete':
      if (action === 'stop') rig.stop(v, at);
      else rig.keep(v, s.hum(p, at, action === 'start'));
      return p.inrushS;
    case 'disco': {
      switch (action) {
        case 'step':
          s.step(p, kind, at);
          return 0.1;
        case 'seek':
          return s.seek(p, kind, p.seekN, at) - at;
        case 'seeks': {
          let t = s.seek(p, kind, 1, at);
          t = s.seek(p, kind, 4, t + 0.3);
          return s.seek(p, kind, 10, t + 0.3) - at;
        }
        case 'recal':
          return s.recalibrate(p, kind, at) - at;
        case 'headload':
          s.headLoad({ ...p, headLoad: p.headLoad || 0.8 }, at);
          return 0.2;
        case 'motor':
          rig.keep(v, s.motor(p, kind, mains(), at));
          return p.motorSpinUp;
        case 'motorstop':
          rig.stop(v, at);
          return 0.5;
      }
      return 0;
    }
    case 'tasti': {
      const [button, only] = action.split('-');
      const variant = p[button];
      if (only !== 'release') s.button(p, variant, 'press', at);
      if (only !== 'press') s.button(p, variant, 'release', at + (only ? 0 : 0.14));
      return 0.3;
    }
    default:
      return 0;
  }
}

/** Accensione completa: tasto, relè, ronzio con lo spunto, [smagnetizzazione], tubo, ventola, disco. */
async function powerOn(rig: Rig, t: number): Promise<number> {
  const pr = state.profile;
  // le registrazioni si caricano prima: l'ordine dei tempi non deve aspettare la rete
  for (const v of VOICES) if (state.source[v] === 'registrazione' && state.clips[v]) await rig.clipBuffer(state.clips[v]!.clip);
  const jobs: Promise<number>[] = [];
  if (state.source.tasti === 'nuovo') jobs.push(act(rig, 'tasti', 'power', t));
  jobs.push(act(rig, 'interruttore', 'on', t + 0.03));
  jobs.push(act(rig, 'rete', 'start', t + 0.04));
  if (state.params.smagnetizzazione.on) jobs.push(act(rig, 'smagnetizzazione', 'play', t + 0.1));
  jobs.push(act(rig, 'tubo', 'on', t + 0.15));
  if (pr.fan) jobs.push(act(rig, 'ventola', 'start', t + 0.05));
  let end = t + 3;
  if (pr.disk && state.source.disco !== 'registrazione') {
    const p = state.params.disco;
    const s = rig.synth;
    if (state.source.disco === 'attuale') {
      rig.legacy.driveSpinUp(t + 0.3);
    } else {
      const motor = s.motor(p, pr.disk, mains(), t + 1);
      rig.keep('disco', motor);
      s.headLoad(p, t + 1.25);
      let at = s.recalibrate(p, pr.disk, t + 1.35);
      for (const n of pr.bootSeeks) at = s.seek(p, pr.disk, n, at + 0.25 + n * 0.01);
      motor.stop(at + 1.5);
      end = at + 2;
    }
  } else if (pr.disk) {
    jobs.push(act(rig, 'disco', 'play', t + 1));
  }
  await Promise.all(jobs);
  return end;
}

/** Spegnimento: tasto, relè che si apre, ventola che rallenta, ronzio e fischio che cessano. */
async function powerOff(rig: Rig, t: number) {
  if (state.source.tasti === 'nuovo') await act(rig, 'tasti', 'power', t);
  await act(rig, 'interruttore', 'off', t + 0.03);
  for (const v of ['rete', 'ventola', 'disco', 'tubo'] as VoiceId[]) rig.stop(v, t + 0.04);
}

// ---------- interfaccia ----------

let live: { ctx: AudioContext; rig: Rig } | null = null;

function rig(): Rig {
  if (!live) {
    // il contesto nasce al primo clic sul banco (gesto dell'utente)
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    live = { ctx, rig: new Rig(ctx) };
    status();
  }
  if (live.ctx.state === 'suspended') void live.ctx.resume();
  return live.rig;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function say(msg: string) {
  $('#messaggio').textContent = msg;
}

function status() {
  $('#stato').textContent = live ? `contesto audio attivo, ${live.ctx.sampleRate} Hz` : 'contesto audio non ancora creato: si crea al primo clic';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 0.1 ? 4 : 3).replace(/0+$/, '');
}

async function copy(json: unknown, out: HTMLElement) {
  const text = JSON.stringify(json, null, 2);
  out.textContent = text;
  out.hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    say('valori copiati negli appunti');
  } catch {
    say('appunti non disponibili: copia il testo qui sotto');
  }
}

function voiceValues(v: VoiceId) {
  const src = state.source[v];
  const cs = state.clips[v];
  return {
    profilo: state.profile.id,
    voce: v,
    sorgente: src,
    parametri: state.params[v],
    ...(src === 'registrazione' && cs
      ? { registrazione: { titolo: cs.clip.label, file: clipFile(cs.clip), inizio: cs.start, durata: cs.duration, livello: cs.gain } }
      : {}),
  };
}

function missingFor(v: VoiceId): string | null {
  const pr = state.profile;
  if (v === 'disco' && !pr.disk) return 'Questo profilo non ha un disco: il terminale non ne aveva.';
  if (v === 'ventola' && !pr.fan) return 'Questo profilo non ha una ventola: l\'Apple II non ne aveva. Si può provare lo stesso.';
  return null;
}

function renderVoice(v: VoiceId): HTMLElement {
  const card = el('section', { class: 'voce', id: `voce-${v}` });
  card.append(el('h2', {}, TITLES[v]), el('p', { class: 'nota' }, HINTS[v]));
  const miss = missingFor(v);
  if (miss) card.append(el('p', { class: 'avviso' }, miss));

  // sorgente A/B/C
  const clips = CLIPS.filter((c) => c.voice === v);
  if (v !== 'cassa') {
    const src = el('fieldset', { class: 'sorgente' });
    src.append(el('legend', {}, 'sorgente'));
    const opts: [Source, string, boolean][] = [
      ['nuovo', 'nuovo', true],
      ['attuale', 'attuale', HAS_LEGACY.includes(v)],
      ['registrazione', `registrazione (${clips.length})`, clips.length > 0],
    ];
    for (const [value, label, ok] of opts) {
      const id = `src-${v}-${value}`;
      const input = el('input', { type: 'radio', name: `src-${v}`, id, value });
      input.checked = state.source[v] === value;
      input.disabled = !ok;
      input.addEventListener('change', () => {
        rig().stop(v);
        state.source[v] = value;
        draw();
      });
      const lab = el('label', { for: id }, ok ? label : `${value}: non c'è`);
      src.append(input, lab);
    }
    card.append(src);
  }

  // azioni
  const actions = el('div', { class: 'azioni' });
  for (const [label, id] of ACTIONS[v]) {
    const b = el('button', { type: 'button', 'data-voce': v, 'data-azione': id }, label);
    b.disabled = v === 'disco' && !state.profile.disk && state.source[v] === 'nuovo';
    b.addEventListener('click', () => {
      const r = rig();
      void act(r, v, id, r.ctx.currentTime + 0.03);
    });
    actions.append(b);
  }
  if (v === 'cassa') {
    for (const [label, voice, id] of [
      ['prova: interruttore', 'interruttore', 'on'],
      ['prova: seek', 'disco', 'seek'],
    ] as const) {
      const b = el('button', { type: 'button' }, label);
      b.addEventListener('click', () => {
        const r = rig();
        void act(r, voice, id, r.ctx.currentTime + 0.03, 'nuovo');
      });
      actions.append(b);
    }
  }
  if (actions.childElementCount) card.append(actions);

  // cursori (sintesi nuova) o clip (registrazione)
  const body = el('div', { class: 'cursori' });
  if (state.source[v] === 'registrazione') {
    const cs = state.clips[v]!;
    const sel = el('select', { 'aria-label': 'registrazione' });
    clips.forEach((c, i) => {
      const o = el('option', { value: String(i) }, c.label);
      o.selected = c === cs.clip;
      sel.append(o);
    });
    sel.addEventListener('change', () => {
      rig().stop(v);
      const c = clips[Number(sel.value)];
      state.clips[v] = { clip: c, start: c.start, duration: c.duration, gain: cs.gain };
      draw();
    });
    body.append(row('registrazione', sel));
    body.append(
      slider('inizio (s)', 0, 75, 0.01, cs.start, (x) => (cs.start = x)),
      slider('durata (s)', 0.05, 30, 0.01, cs.duration, (x) => (cs.duration = x)),
      slider('livello', 0, 2, 0.01, cs.gain, (x) => (cs.gain = x)),
    );
    const rec = RECORDINGS.find((r) => r.id === cs.clip.recording)!;
    body.append(el('p', { class: 'nota' }, `${rec.title} di ${rec.author}, ${rec.licence}. ${rec.note}`));
  } else if (state.source[v] === 'attuale') {
    body.append(el('p', { class: 'nota' }, 'Le voci di audio.ts così come sono oggi, senza mobile né cursori.'));
  } else {
    for (const d of SCHEMA[v]) {
      const p = state.params[v];
      const onChange = (x: number) => {
        p[d.key] = x;
        if (v === 'cassa') live?.rig.case.update(p);
      };
      if (d.options) {
        const sel = el('select', { 'aria-label': d.label });
        for (const o of d.options) {
          const opt = el('option', { value: String(o.value) }, o.label);
          opt.selected = o.value === p[d.key];
          sel.append(opt);
        }
        sel.addEventListener('change', () => onChange(Number(sel.value)));
        body.append(row(d.label, sel));
      } else body.append(slider(d.label, d.min, d.max, d.step, p[d.key], onChange));
    }
  }
  card.append(body);

  const out = el('pre', { class: 'json' });
  out.hidden = true;
  const cp = el('button', { type: 'button', class: 'copia' }, 'copia valori');
  cp.addEventListener('click', () => void copy(voiceValues(v), out));
  card.append(cp, out);
  return card;
}

function row(label: string, control: HTMLElement): HTMLElement {
  const r = el('label', { class: 'riga' });
  r.append(el('span', {}, label), control);
  return r;
}

function slider(label: string, min: number, max: number, step: number, value: number, onChange: (x: number) => void): HTMLElement {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = el('output', {}, fmt(value));
  input.addEventListener('input', () => {
    const x = Number(input.value);
    out.textContent = fmt(x);
    onChange(x);
  });
  const r = row(label, input);
  r.append(out);
  return r;
}

function renderCredits(): HTMLElement {
  const box = el('section', { class: 'crediti', id: 'crediti' });
  box.append(el('h2', {}, 'CREDITS'));
  box.append(
    el(
      'p',
      { class: 'nota' },
      'Solo CC0 e CC BY. Le CC BY vanno citate se si usano. Nessuna di queste va in produzione in questa fase.',
    ),
  );
  const got = el('ul');
  const todo = el('ul');
  for (const r of RECORDINGS) {
    const li = el('li');
    const a = el('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title);
    li.append(a, document.createTextNode(` di ${r.author}, ${r.licence}. ${r.note}${r.got ? ` Scaricato: ${r.got}.` : ''}`));
    (r.got ? got : todo).append(li);
  }
  box.append(el('h3', {}, 'Scaricate in .cache/suoni'), got, el('h3', {}, 'Da scaricare a mano'), todo);
  return box;
}

function draw() {
  $('#descrizione').textContent = state.profile.description;
  const root = $('#voci');
  root.replaceChildren(...VOICES.map(renderVoice));
}

function init() {
  const sel = $<HTMLSelectElement>('#profilo');
  for (const p of PROFILES) sel.append(el('option', { value: p.id }, p.name));
  sel.addEventListener('change', () => {
    if (live) for (const v of VOICES) live.rig.stop(v);
    loadProfile(getProfile(sel.value));
    live?.rig.case.update(state.params.cassa);
    draw();
  });
  const vol = $<HTMLInputElement>('#volume');
  vol.value = String(state.master);
  vol.addEventListener('input', () => {
    state.master = Number(vol.value);
    $('#volume-valore').textContent = fmt(state.master);
    if (live) live.rig.master.gain.setTargetAtTime(state.master, live.ctx.currentTime, 0.02);
  });
  const phone = $<HTMLInputElement>('#telefono');
  phone.addEventListener('change', () => {
    state.phone = phone.checked;
    live?.rig.setPhone(state.phone);
  });
  $('#accendi').addEventListener('click', () => {
    const r = rig();
    for (const v of VOICES) r.stop(v);
    void powerOn(r, r.ctx.currentTime + 0.05).then(() => say(`accensione: ${state.profile.name}`));
  });
  $('#spegni').addEventListener('click', () => {
    const r = rig();
    void powerOff(r, r.ctx.currentTime + 0.05).then(() => say('spegnimento'));
  });
  $('#ferma').addEventListener('click', () => {
    if (!live) return;
    for (const v of VOICES) live.rig.stop(v);
    say('tutto fermo');
  });
  const all = $('#tutto-json');
  $('#copia-tutto').addEventListener('click', () => void copy({ profilo: state.profile.id, sorgenti: state.source, parametri: state.params }, all));
  loadProfile(PROFILES[0]);
  draw();
  $('#crediti-box').replaceChildren(renderCredits());
  status();
}

// ---------- misura senza ascolto: rendering offline ----------

export type OfflineRequest = { profile: string; voice: VoiceId | 'accensione'; action?: string; source?: Source; seconds: number; phone?: boolean; stopAt?: number };

/** Rende una voce in un OfflineAudioContext e restituisce i campioni in base64 (Float32, mono, 48 kHz). */
async function renderOffline(req: OfflineRequest): Promise<string> {
  const prevProfile = state.profile;
  const prevParams = state.params;
  const prevSource = { ...state.source };
  const prevPhone = state.phone;
  loadProfile(getProfile(req.profile));
  state.phone = !!req.phone;
  const ctx = new OfflineAudioContext(1, Math.ceil(req.seconds * 48000), 48000);
  const r = new Rig(ctx, 1);
  if (req.voice === 'accensione') {
    for (const v of VOICES) state.source[v] = req.source ?? 'nuovo';
    await powerOn(r, 0.05);
  } else {
    await act(r, req.voice, req.action ?? 'on', 0.05, req.source ?? 'nuovo');
    if (req.stopAt !== undefined) await act(r, req.voice, req.voice === 'disco' ? 'motorstop' : req.voice === 'tubo' ? 'off' : 'stop', req.stopAt, req.source ?? 'nuovo');
  }
  const out = await ctx.startRendering();
  state.profile = prevProfile;
  state.params = prevParams;
  state.source = prevSource;
  state.phone = prevPhone;
  const bytes = new Uint8Array(out.getChannelData(0).buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

(window as unknown as { fosforoSuoni: unknown }).fosforoSuoni = { renderOffline, profiles: PROFILES.map((p) => p.id) };

init();
