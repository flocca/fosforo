// Suono del terminale. Sintesi (src/client/sound): ronzio del trasformatore, tubo che si
// accende (crepitio dell'alta tensione e fischio del flyback), ventola con il fischio del
// motorino, tutto attraverso la risonanza del mobile. Registrazioni vere: l'interruttore
// rosso dell'IBM 5150, il tasto di una TV analogica (tasti della cornice) e un floppy diviso
// in passi, ricerche e motore. Valori e scelte in src/client/sound/preset.ts.
//
// Le registrazioni si scaricano al primo gesto, dopo l'accensione: niente rete prima.
import * as prefs from './prefs';
import { CASE, FAN, FLOPPY, HUM, MAINS, MECH, TUBE } from './sound/preset';
import { findSegments, type Segment } from './sound/sprite';
import { Synth, createCase, type Handle } from './sound/voices';
import floppyM4a from './sound/registrazioni/floppy.m4a?url';
import floppyWebm from './sound/registrazioni/floppy.webm?url';
import mechM4a from './sound/registrazioni/meccanica.m4a?url';
import mechWebm from './sound/registrazioni/meccanica.webm?url';

export type SiteAudio = {
  readonly started: boolean;
  readonly muted: boolean;
  /** Interruttore, ronzio con lo spunto, tubo, ventola che prende giri, floppy che ricalibra. Già acceso: reboot del monitor. */
  powerOn(): void;
  /** Link profondo, al primo gesto: interruttore e ventola che riparte in fretta (~1,5 s), poi l'ambiente. */
  spinUp(): void;
  /** `n` movimenti della testina del floppy; non fa niente prima dell'accensione. */
  seek(n: number): void;
  /** Un tasto della cornice (suono, fosfori): pressione e rilascio insieme (Invio, clic senza pressione). */
  press(): void;
  /** Il tasto della cornice che scende: mouse, dito o barra spaziatrice premuti. */
  keyDown(): void;
  /** Il tasto della cornice che torna su. */
  keyUp(): void;
  setMuted(m: boolean): void;
  suspend(): void;
  resume(): void;
};

export type SoundFile = 'meccanica' | 'floppy';
export type Format = 'webm' | 'm4a';
export type Loader = (name: SoundFile, format: Format) => Promise<ArrayBuffer>;

export const LEVELS = { master: 0.5 };

const MUTE_RAMP_S = 0.05;
// il monitor resta spento così a lungo durante il reboot
const REBOOT_OFF_S = 0.4;
// quanto si aspetta l'interruttore registrato prima di accendere senza
const SWITCH_WAIT_MS = 300;
const PIECES: Record<SoundFile, number> = { meccanica: MECH.pieces.length, floppy: FLOPPY.steps + FLOPPY.seeks + 1 };
const URLS: Record<SoundFile, Record<Format, string>> = {
  meccanica: { webm: mechWebm, m4a: mechM4a },
  floppy: { webm: floppyWebm, m4a: floppyM4a },
};

const fetchSound: Loader = async (name, format) => {
  const res = await fetch(URLS[name][format]);
  if (!res.ok) throw new Error(`${name}.${format}: HTTP ${res.status}`);
  return res.arrayBuffer();
};

// Opus in WebM dove il browser lo legge, altrimenti AAC; se la decodifica fallisce si prova l'altro.
function formats(): Format[] {
  try {
    if (new Audio().canPlayType('audio/webm; codecs="opus"')) return ['webm', 'm4a'];
  } catch {
    // niente elemento audio (test): si va in ordine
  }
  return ['m4a', 'webm'];
}

type Pieces = { buf: AudioBuffer; segs: Segment[] };

const pick = (count: number, last: number) => {
  let i = Math.floor(Math.random() * count);
  if (count > 1 && i === last) i = (i + 1) % count;
  return i;
};

export function createAudio(ctxFactory: () => AudioContext = () => new AudioContext({ latencyHint: 'playback' }), load: Loader = fetchSound): SiteAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let direct: GainNode;
  let synth: Synth;
  let muted = prefs.isSoundOff();
  let muteTimer: ReturnType<typeof setTimeout> | undefined;
  let mech: Pieces | null = null;
  let floppy: Pieces | null = null;
  let mechReady: Promise<Pieces | null>;
  let floppyReady: Promise<Pieces | null>;
  let tube: Handle | null = null;
  // fine dell'ultimo suono di un tasto: lo spegnimento del suono aspetta che finisca
  let quietAt = 0;
  // fine dell'ultimo suono programmato: il contesto si sospende solo dopo, altrimenti
  // quello che resta (fermo con il tempo del contesto) uscirebbe tutto alla ripresa
  let busyUntil = 0;
  // pagina nascosta; una sospensione o ripresa del contesto in corso
  let hidden = false;
  let changing = false;
  // l'interruttore registrato non è ancora suonato: l'accensione è in corso
  let switching = false;
  // floppy: motore, prossimo istante libero della testina, ultimo passo e ultima ricerca
  let motor: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  let motorTimer: ReturnType<typeof setTimeout> | undefined;
  let diskFree = 0;
  let lastStep = -1;
  let lastSeek = -1;

  const now = () => ctx!.currentTime + 0.02;
  const busy = (t: number) => (busyUntil = Math.max(busyUntil, t));

  // Il contesto gira solo se il suono è acceso e la pagina visibile. Sospendere e riprendere
  // sono asincroni: finito un cambio, si ricontrolla (il visitatore può aver cambiato idea).
  function sync() {
    const c = ctx;
    if (!c || changing || c.state === 'closed') return;
    const wanted = () => (muted || hidden ? 'suspended' : 'running');
    const want = wanted();
    if (c.state === want) return;
    changing = true;
    (want === 'running' ? c.resume() : c.suspend())
      .catch(() => {})
      .finally(() => {
        changing = false;
        // si riprova solo se nel frattempo è cambiato quello che si vuole: se il browser
        // rifiuta (resume senza gesto) si riprova al prossimo gesto, non in un ciclo
        if (wanted() !== want) sync();
      });
  }

  async function decode(name: SoundFile): Promise<Pieces | null> {
    for (const f of formats()) {
      try {
        const buf = await ctx!.decodeAudioData(await load(name, f));
        const segs = findSegments(buf.getChannelData(0), buf.sampleRate);
        if (segs.length === PIECES[name]) return { buf, segs };
        console.warn(`suono ${name}.${f}: ${segs.length} pezzi invece di ${PIECES[name]}`);
      } catch (e) {
        console.warn(`suono ${name}.${f} non disponibile`, e);
      }
    }
    return null;
  }

  // Crea il contesto: solo dentro un gestore di un gesto dell'utente.
  function open(): boolean {
    if (ctx) return false;
    try {
      ctx = ctxFactory();
    } catch (e) {
      console.warn('audio non disponibile', e);
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : LEVELS.master;
    master.connect(ctx.destination);
    direct = ctx.createGain();
    direct.connect(master);
    synth = new Synth(ctx, { mech: createCase(ctx, master, CASE).input, direct });
    mechReady = decode('meccanica').then((p) => (mech = p));
    floppyReady = decode('floppy').then((p) => (floppy = p));
    // creato su un tocco (pointerdown) alcuni browser lo lasciano sospeso: si prova a farlo
    // partire; da muto resta fermo finché `suono` non lo riaccende
    sync();
    return true;
  }

  /** Un pezzo registrato; `dur` più corto del pezzo lo taglia con una breve dissolvenza. */
  function play(p: Pieces, i: number, at: number, gain: number, dur?: number) {
    const c = ctx!;
    const seg = p.segs[i];
    const len = seg.end - seg.start;
    const d = Math.min(dur ?? len, len);
    const src = c.createBufferSource();
    src.buffer = p.buf;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(direct);
    if (d < len) {
      g.gain.setValueAtTime(gain, at + Math.max(0, d - 0.012));
      g.gain.linearRampToValueAtTime(0, at + d);
    }
    src.start(at, seg.start, d);
    busy(at + d);
    return { src, g };
  }

  // Ambiente continuo. `transients`: spunto del trasformatore e crepitio del tubo (no da muto).
  // `spin`: secondi in cui la ventola prende giri (0 = già a regime).
  function ambient(t0: number, transients: boolean, spin: number) {
    if (transients) busy(t0 + 0.12 + TUBE.crackleDur);
    synth.hum(HUM, t0, transients);
    tube = synth.tube(TUBE, MAINS, t0 + 0.12, transients);
    synth.fan(spin ? { ...FAN, spinUp: spin } : FAN, MAINS, t0 + 0.02, spin > 0);
  }

  // L'interruttore registrato arriva dalla rete: si aspetta poco, poi si accende senza.
  function withSwitch(start: (t0: number) => void) {
    let done = false;
    switching = true;
    const go = () => {
      if (done || !ctx) return;
      done = true;
      switching = false;
      const t0 = now();
      // spento il suono durante l'attesa: solo l'ambiente, niente scatti fuori tempo alla ripresa
      if (muted) return ambient(t0, false, 0);
      if (mech) play(mech, 0, t0, MECH.gain.switchOn);
      start(t0);
    };
    void mechReady.then(go);
    setTimeout(go, SWITCH_WAIT_MS);
  }

  // --- floppy ---
  function motorOn(at: number) {
    if (motor) return;
    const c = ctx!;
    const seg = floppy!.segs[FLOPPY.steps + FLOPPY.seeks];
    const src = c.createBufferSource();
    src.buffer = floppy!.buf;
    src.loop = true;
    // qualche millisecondo in meno ai bordi: la codifica sfuma gli estremi
    src.loopStart = seg.start + 0.005;
    src.loopEnd = seg.end - 0.005;
    const g = c.createGain();
    src.connect(g).connect(direct);
    // il motore prende giri: velocità e volume salgono insieme
    src.playbackRate.setValueAtTime(0.4, at);
    src.playbackRate.linearRampToValueAtTime(1, at + FLOPPY.motorSpinUp);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(FLOPPY.gain, at + FLOPPY.motorSpinUp);
    src.start(at, src.loopStart);
    motor = { src, g };
  }

  function motorOff() {
    if (!motor || !ctx) return;
    const t = ctx.currentTime;
    const { src, g } = motor;
    // rallenta dalla velocità che ha adesso (anche se stava ancora prendendo giri)
    const rate = src.playbackRate.value;
    src.playbackRate.cancelScheduledValues(t);
    src.playbackRate.setValueAtTime(rate, t);
    src.playbackRate.linearRampToValueAtTime(rate * 0.45, t + 0.35);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.35);
    try {
      src.stop(t + 0.4);
    } catch {
      // già fermo
    }
    busy(t + 0.4);
    motor = null;
  }

  // il motore si ferma dopo un po' senza accessi
  function motorIdle() {
    clearTimeout(motorTimer);
    const wait = Math.max(0, diskFree - ctx!.currentTime) + FLOPPY.motorIdle;
    motorTimer = setTimeout(motorOff, wait * 1000);
  }

  function step(at: number, gain = FLOPPY.gain): number {
    lastStep = pick(FLOPPY.steps, lastStep);
    play(floppy!, lastStep, at, gain);
    return at + 0.03;
  }

  /** Ricerca di `n` tracce: una ricerca registrata tagliata alla lunghezza giusta. */
  function seekTracks(n: number, at: number): number {
    const segs = floppy!.segs.slice(FLOPPY.steps, FLOPPY.steps + FLOPPY.seeks);
    const len = (s: Segment) => s.end - s.start;
    const need = n * FLOPPY.stepS + 0.012;
    const fit = segs.map((s, i) => [s, i] as const).filter(([s]) => len(s) >= need);
    if (!fit.length) {
      // più lunga di ogni ricerca registrata: se ne mettono in fila due
      const i = segs.length - 1;
      play(floppy!, FLOPPY.steps + i, at, FLOPPY.gain);
      const done = Math.max(1, Math.floor((len(segs[i]) - 0.012) / FLOPPY.stepS));
      return seekTracks(n - done, at + len(segs[i]) - 0.01);
    }
    // mai la stessa ricerca due volte di fila, se ce n'è un'altra abbastanza lunga
    const others = fit.length > 1 ? fit.filter(([, i]) => i !== lastSeek) : fit;
    lastSeek = others[Math.floor(Math.random() * others.length)][1];
    play(floppy!, FLOPPY.steps + lastSeek, at, FLOPPY.gain, need);
    return at + need;
  }

  // All'accensione: motore, testina che si carica, ricalibrazione verso la traccia 0.
  function diskBoot(when: number) {
    const at = Math.max(when, diskFree);
    motorOn(at);
    step(at + 0.25, FLOPPY.gain * 0.7);
    diskFree = seekTracks(FLOPPY.recalSteps, at + 0.35);
    motorIdle();
  }

  function powerOnFirst() {
    if (!open()) return;
    // da muto niente transitori: riaccendendo dopo si sente solo l'ambiente, non un interruttore fuori tempo
    if (muted) return ambient(now(), false, 0);
    withSwitch((t0) => {
      ambient(t0, true, FAN.spinUp);
      void floppyReady.then((f) => {
        // arrivato tardi (rete lenta): la ricalibrazione a boot finito sarebbe fuori posto
        if (f && !muted && now() < t0 + 2) diskBoot(Math.max(t0 + 1, now()));
      });
    });
  }

  // --- tasti della cornice ---
  // L'istante del prossimo pezzo di un tasto, o null se non deve suonare. A contesto
  // sospeso (suono appena riacceso) il tasto suona alla ripresa; se lì c'è già un tasto
  // in attesa, niente raffica alla ripresa.
  function keyAt(): number | null {
    if (!ctx || muted || !mech) return null;
    if (ctx.state !== 'running' && quietAt > ctx.currentTime) return null;
    return now();
  }

  // lo spegnimento del suono aspetta la fine dell'ultimo pezzo
  function key(piece: number, at: number, gain: number) {
    play(mech!, piece, at, gain);
    const seg = mech!.segs[piece];
    quietAt = Math.max(quietAt, at + (seg.end - seg.start));
  }

  return {
    get started() {
      return ctx !== null;
    },
    get muted() {
      return muted;
    },

    powerOn() {
      if (!ctx) return powerOnFirst();
      // da muto, o con l'accensione ancora in corso, niente reboot sonoro
      if (muted || switching) return;
      // reboot: il monitor si spegne e si riaccende, ventola e ronzio non si fermano
      const t = now();
      if (mech) play(mech, 1, t, MECH.gain.switchOff);
      tube?.stop(t);
      if (mech) play(mech, 0, t + REBOOT_OFF_S, MECH.gain.switchOn);
      tube = synth.tube(TUBE, MAINS, t + REBOOT_OFF_S + 0.12);
      busy(t + REBOOT_OFF_S + 0.12 + TUBE.crackleDur);
    },

    spinUp() {
      if (ctx || !open()) return;
      if (muted) return ambient(now(), false, 0);
      withSwitch((t0) => ambient(t0, true, 1.5));
    },

    seek(n) {
      // a contesto sospeso gli scatti si accumulerebbero e uscirebbero tutti insieme alla ripresa
      if (!ctx || muted || ctx.state !== 'running' || !floppy) return;
      let at = Math.max(now(), diskFree);
      if (!motor) {
        motorOn(at);
        at += 0.15;
      }
      // ogni movimento è un passo di traccia o una ricerca breve, con una pausa di lettura dopo
      for (let i = 0; i < n; i++) {
        const end = Math.random() < 0.6 ? step(at) : seekTracks(5 + Math.floor(Math.random() * 35), at);
        at = end + 0.05 + Math.random() * 0.12;
      }
      diskFree = at;
      busy(at);
      motorIdle();
    },

    press() {
      const t = keyAt();
      if (t === null) return;
      key(2, t, MECH.gain.press);
      key(3, t + MECH.releaseAfter, MECH.gain.release);
    },

    keyDown() {
      const t = keyAt();
      if (t !== null) key(2, t, MECH.gain.press);
    },

    keyUp() {
      const t = keyAt();
      if (t !== null) key(3, t, MECH.gain.release);
    },

    setMuted(m) {
      muted = m;
      clearTimeout(muteTimer);
      if (!ctx) return;
      const c = ctx;
      const t = c.currentTime;
      // spegnendo, il tasto appena premuto finisce di suonare
      const from = m ? Math.max(t, quietAt) : t;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, from);
      master.gain.linearRampToValueAtTime(m ? 0 : LEVELS.master, from + MUTE_RAMP_S);
      if (m) {
        motorOff();
        // da muto il contesto si ferma, così non consuma batteria: dopo che è finito
        // tutto quello che era già programmato (suona in silenzio)
        const until = Math.max(from + MUTE_RAMP_S, busyUntil);
        muteTimer = setTimeout(sync, (until - t) * 1000 + 50);
      } else {
        sync();
      }
    },

    suspend() {
      hidden = true;
      sync();
    },

    resume() {
      hidden = false;
      sync();
    },
  };
}
