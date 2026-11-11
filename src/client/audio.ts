// Suono del terminale, tutto sintetizzato in Web Audio (nessun file registrato).
// Accensione: clic del relè, colpo del trasformatore, smagnetizzazione del tubo,
// ventola che prende giri, disco che si avvia. Poi resta l'ambiente: ventola
// (rumore marrone filtrato), ronzio di rete a 50 Hz con armoniche e il fischio
// del flyback a 15625 Hz (riga orizzontale PAL). La testina del disco sono brevi
// raffiche di rumore filtrato. Niente suoni dei tasti.
import * as prefs from './prefs';

export type SiteAudio = {
  readonly started: boolean;
  readonly muted: boolean;
  /** Interruttore: relè, colpo, smagnetizzazione, ventola e disco che partono, poi l'ambiente. */
  powerOn(): void;
  /** Link profondo, al primo gesto: relè e ventola che riparte in fretta (~1,5 s), poi l'ambiente. */
  spinUp(): void;
  /** Clic della testina del disco; non fa niente prima dell'accensione. */
  seek(n: number): void;
  setMuted(m: boolean): void;
  suspend(): void;
  resume(): void;
};

// Livelli (ampiezza lineare). Il principale è basso: l'ambiente deve restare sottofondo.
export const LEVELS = {
  master: 0.5,
  fan: 0.13,
  fanTone: 0.12,
  // 50 Hz e armoniche: gli altoparlanti piccoli non rendono i 50 Hz, il ronzio si sente dalle armoniche
  hum: [0.012, 0.016, 0.009, 0.006, 0.003] as const, // 50, 100, 150, 250, 350 Hz
  whine: 0.0015,
  relay: 0.3,
  thunk: 0.42,
  degauss: 0.2,
  drive: 0.03,
  seek: 0.8,
};

const HUM_HZ = [50, 100, 150, 250, 350];
const FLYBACK_HZ = 15625;
const MUTE_RAMP_S = 0.05;

// Rumore marrone (la ventola): passa basso integrato, come nel prototipo.
function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return b;
}

// Rumore bianco (relè e testina): breve, si riusa per ogni clic.
function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function createAudio(ctxFactory: () => AudioContext = () => new AudioContext({ latencyHint: 'playback' })): SiteAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let brown: AudioBuffer;
  let white: AudioBuffer;
  let muted = prefs.isSoundOff();
  let muteTimer: ReturnType<typeof setTimeout> | undefined;

  function gain(value: number, to: AudioNode = master): GainNode {
    const g = ctx!.createGain();
    g.gain.value = value;
    g.connect(to);
    return g;
  }

  function osc(type: OscillatorType, hz: number, to: AudioNode): OscillatorNode {
    const o = ctx!.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.connect(to);
    return o;
  }

  function filter(type: BiquadFilterType, hz: number, q: number, to: AudioNode): BiquadFilterNode {
    const f = ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    f.connect(to);
    return f;
  }

  function noise(buffer: AudioBuffer, to: AudioNode, loop = false): AudioBufferSourceNode {
    const s = ctx!.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    s.connect(to);
    return s;
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
    brown = brownNoise(ctx, 4);
    white = whiteNoise(ctx, 0.25);
    // creato su un tocco (pointerdown) alcuni browser lo lasciano sospeso: si prova a farlo partire
    if (ctx.state === 'suspended' && !muted) void ctx.resume().catch(() => {});
    // da muto resta fermo finché `suono` non lo riaccende
    else if (ctx.state === 'running' && muted) void ctx.suspend().catch(() => {});
    return true;
  }

  // Ambiente continuo. `ramp`: secondi in cui la ventola prende giri (0 = già a regime).
  function ambient(t0: number, ramp: number) {
    const c = ctx!;
    const end = t0 + Math.max(ramp, 0.01);

    // ventola: rumore marrone, filtro che si apre e velocità che sale mentre prende giri
    const fanGain = gain(0);
    fanGain.gain.setValueAtTime(ramp ? 0 : LEVELS.fan, t0);
    if (ramp) fanGain.gain.linearRampToValueAtTime(LEVELS.fan, end);
    const fanLp = filter('lowpass', 650, 0.7, fanGain);
    fanLp.frequency.setValueAtTime(ramp ? 160 : 650, t0);
    if (ramp) fanLp.frequency.exponentialRampToValueAtTime(650, end);
    const fan = noise(brown, fanLp, true);
    fan.playbackRate.setValueAtTime(ramp ? 0.45 : 1, t0);
    if (ramp) fan.playbackRate.linearRampToValueAtTime(1, end);
    // il passaggio delle pale: una banda stretta dello stesso rumore, appena tonale
    const toneGain = gain(0);
    toneGain.gain.setValueAtTime(ramp ? 0 : LEVELS.fanTone, t0);
    if (ramp) toneGain.gain.linearRampToValueAtTime(LEVELS.fanTone, end);
    noise(brown, filter('bandpass', 190, 6, toneGain), true).start(t0, 1.7); // altro punto del rumore: non si ripete insieme alla ventola
    // oscillazione lenta del flusso d'aria
    const wobble = c.createGain();
    wobble.gain.value = LEVELS.fan * 0.12;
    wobble.connect(fanGain.gain);
    osc('sine', 0.21, wobble).start(t0);
    fan.start(t0);

    // ronzio del trasformatore: 50 Hz e armoniche, entra con il relè
    const hum = gain(0);
    hum.gain.setValueAtTime(0, t0);
    hum.gain.linearRampToValueAtTime(1, t0 + 0.3);
    HUM_HZ.forEach((hz, i) => {
      osc('sine', hz, gain(LEVELS.hum[i], hum)).start(t0);
    });

    // flyback: sale di tono mentre l'alta tensione si carica
    const whineGain = gain(0);
    whineGain.gain.setValueAtTime(0, t0);
    whineGain.gain.linearRampToValueAtTime(LEVELS.whine, t0 + 0.8);
    const whine = osc('sine', FLYBACK_HZ, whineGain);
    whine.frequency.setValueAtTime(FLYBACK_HZ - 500, t0);
    whine.frequency.exponentialRampToValueAtTime(FLYBACK_HZ, t0 + 0.8);
    whine.start(t0);
  }

  // Clic del contatto del relè e colpo sordo del trasformatore che si magnetizza.
  function relay(t0: number) {
    const clickGain = gain(0);
    clickGain.gain.setValueAtTime(LEVELS.relay, t0);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.018);
    const click = noise(white, filter('bandpass', 2600, 1.5, clickGain));
    click.start(t0);
    click.stop(t0 + 0.03);

    const thunkGain = gain(0);
    thunkGain.gain.setValueAtTime(LEVELS.thunk, t0 + 0.01);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
    const thunk = osc('sine', 120, thunkGain);
    thunk.frequency.setValueAtTime(120, t0 + 0.01);
    thunk.frequency.exponentialRampToValueAtTime(40, t0 + 0.16);
    thunk.start(t0 + 0.01);
    thunk.stop(t0 + 0.3);
  }

  // Smagnetizzazione del tubo: un "bwong" a 50 Hz che si spegne in un secondo e mezzo,
  // con la maschera metallica che risuona appena.
  function degauss(t0: number) {
    const g = gain(0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(LEVELS.degauss, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
    const lp = filter('lowpass', 700, 1, g);
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(180, t0 + 1.6);
    for (const [type, hz] of [['sawtooth', 50], ['sine', 100]] as const) {
      const o = osc(type, hz, lp);
      o.start(t0);
      o.stop(t0 + 1.7);
    }
    const ring = gain(0);
    ring.gain.setValueAtTime(LEVELS.degauss * 0.18, t0);
    ring.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    for (const hz of [231, 467]) {
      const o = osc('sine', hz, ring);
      o.start(t0);
      o.stop(t0 + 0.8);
    }
  }

  // Motore del disco che si avvia: un sibilo che sale e poi sparisce a regime.
  function driveSpinUp(t0: number) {
    const g = gain(0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(LEVELS.drive, t0 + 0.8);
    g.gain.setValueAtTime(LEVELS.drive, t0 + 2.2);
    g.gain.linearRampToValueAtTime(0, t0 + 3.4);
    const o = osc('triangle', 90, filter('lowpass', 1200, 0.7, g));
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(420, t0 + 2.4);
    o.start(t0);
    o.stop(t0 + 3.5);
  }

  const now = () => ctx!.currentTime + 0.02;

  return {
    get started() {
      return ctx !== null;
    },
    get muted() {
      return muted;
    },

    powerOn() {
      if (!ctx) {
        if (!open()) return;
        // da muto niente transitori: riaccendendo dopo si sente solo l'ambiente, non un relè fuori tempo
        if (muted) return ambient(now(), 0);
        const t0 = now();
        relay(t0);
        degauss(t0 + 0.06);
        driveSpinUp(t0 + 0.3);
        ambient(t0, 2.5);
      } else if (!muted) {
        // reboot: il monitor si spegne e si riaccende, la ventola non si ferma
        const t0 = now();
        relay(t0);
        degauss(t0 + 0.06);
      }
    },

    spinUp() {
      if (!ctx) {
        if (!open()) return;
        if (muted) return ambient(now(), 0);
        const t0 = now();
        relay(t0);
        ambient(t0, 1.5);
      }
    },

    seek(n) {
      // a contesto sospeso i clic si accumulerebbero e uscirebbero tutti insieme alla ripresa
      if (!ctx || muted || ctx.state !== 'running') return;
      let at = now();
      for (let i = 0; i < n; i++) {
        const g = gain(0);
        const peak = LEVELS.seek * (0.6 + Math.random() * 0.4);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(peak, at + 0.002);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
        const s = noise(white, filter('bandpass', 1800 + Math.random() * 2500, 3, g));
        // punto di partenza casuale nel rumore: ogni clic è un po' diverso
        s.start(at, Math.random() * 0.2);
        s.stop(at + 0.04);
        at += 0.04 + Math.random() * 0.09;
      }
    },

    setMuted(m) {
      muted = m;
      clearTimeout(muteTimer);
      if (!ctx) return;
      const c = ctx;
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(m ? 0 : LEVELS.master, t + MUTE_RAMP_S);
      if (m) {
        // da muto il contesto si ferma, così non consuma batteria
        muteTimer = setTimeout(() => {
          if (muted && c.state === 'running') void c.suspend().catch(() => {});
        }, MUTE_RAMP_S * 1000 + 50);
      } else if (c.state === 'suspended') {
        void c.resume().catch(() => {});
      }
    },

    suspend() {
      if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {});
    },

    resume() {
      if (ctx && !muted && ctx.state === 'suspended') void ctx.resume().catch(() => {});
    },
  };
}
