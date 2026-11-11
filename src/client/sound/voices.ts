// Voci sintetizzate per il suono del terminale (fase 1: le usa il banco dei suoni /_suoni;
// la fase 2 le collegherà ad audio.ts). Ogni voce lavora su un BaseAudioContext qualsiasi,
// quindi anche su un OfflineAudioContext per misurarla.
//
// I transitori sono buffer modali pre-renderizzati (dsp.ts) in più varianti; l'ambiente è
// un grafo continuo (ventola, ronzio, fischio). I rumori meccanici passano dal mobile
// (`mech`: risposta del mobile e passa basso), fischio e crepitio dell'alta tensione no (`direct`).
import {
  bounces,
  curveAt,
  humHarmonics,
  motorWhine,
  nextVariant,
  normalize,
  pinkNoise,
  renderCaseIR,
  renderCrackle,
  renderDegauss,
  renderClick,
  renderVariants,
  rng,
  softClipCurve,
  spinCurve,
  wander,
  type CaseSpec,
  type ClickSpec,
  type CrackleSpec,
  type DegaussSpec,
  type Mode,
} from './dsp';
import type { DiskKind, Params } from './profiles';

export type Bus = { mech: AudioNode; direct: AudioNode };
export type Handle = { stop(at?: number): void };

const VARIANTS = 6;

// ---------- specifiche pure (testabili) ----------

const scaleModes = (hz: number[], gain: number[], t60: number[], k = 1, d = 1): Mode[] =>
  hz.map((h, i) => ({ hz: h * k, gain: gain[i], t60: t60[i] * d }));

/** Interruttore di rete o relè: contatto metallico con rimbalzi più il corpo che risuona. */
export function relaySpec(p: Params, which: 'on' | 'off'): ClickSpec {
  const off = which === 'off';
  const bright = p.bright * (off ? 0.93 : 1);
  const metal = scaleModes([1900, 3300, 5200, 7600], [0.8, 0.6, 0.4, 0.25], [1, 0.8, 0.6, 0.5], bright, p.metalT60);
  metal.forEach((m) => (m.gain *= 1 - p.weight * 0.5));
  return {
    modes: [
      ...metal,
      { hz: p.bodyHz, gain: p.weight * 0.8, t60: p.bodyT60 },
      { hz: p.bodyHz * 2.37, gain: p.weight * 0.7, t60: p.bodyT60 * 0.6 },
      { hz: p.bodyHz * 4.1, gain: p.weight * 0.4, t60: p.bodyT60 * 0.4 },
    ],
    impulses: bounces(Math.max(0, p.bounces - (off ? 1 : 0)), p.bounceMs / 1000),
    noise: 0.6,
    noiseT60: 0.002,
    jitter: 0.03,
  };
}

const STEP_HZ: Record<DiskKind, { modes: number[]; thump: number }> = {
  otto: { modes: [700, 1250, 2050, 3100], thump: 140 },
  cinque: { modes: [900, 1650, 2500, 3600], thump: 170 },
  diskii: { modes: [1150, 1900, 2950, 4300], thump: 210 },
};

/** Un passo del motore della testina: modi del carrello e del telaio più un colpo basso. */
export function stepSpec(p: Params, kind: DiskKind): ClickSpec {
  const k = STEP_HZ[kind];
  return {
    modes: [
      ...scaleModes(k.modes, [0.8, 0.6, 0.4, 0.2], [1, 0.8, 0.6, 0.4], p.stepTone, p.stepT60),
      { hz: k.thump * p.stepTone, gain: p.thump * 0.5, t60: 0.05 },
    ],
    impulses: [
      { at: 0, gain: 1 },
      { at: 0.003, gain: 0.3 },
    ],
    noise: 0.4,
    noiseT60: 0.0015,
    jitter: 0.025,
  };
}

/** Disk II: la testina che sbatte contro il fermo durante la ricalibrazione. */
export function bangSpec(p: Params): ClickSpec {
  return {
    modes: [
      { hz: 160 * p.stepTone, gain: 0.8, t60: 0.07 },
      { hz: 520 * p.stepTone, gain: 0.8, t60: 0.05 },
      { hz: 1270 * p.stepTone, gain: 0.5, t60: 0.04 },
      { hz: 2400 * p.stepTone, gain: 0.5, t60: 0.035 },
    ],
    impulses: bounces(1, 0.003),
    noise: 0.5,
    noiseT60: 0.002,
    jitter: 0.03,
  };
}

/** Solenoide di carico della testina (unità da 8 pollici): un "clac" pesante. */
export function headLoadSpec(): ClickSpec {
  return {
    modes: [
      ...scaleModes([420, 950, 1800, 3200], [0.9, 0.6, 0.4, 0.2], [0.09, 0.06, 0.04, 0.025]),
      { hz: 160, gain: 0.8, t60: 0.1 },
    ],
    impulses: bounces(2, 0.004, 0.5, 6),
    noise: 0.5,
    noiseT60: 0.002,
    jitter: 0.03,
  };
}

/** Tasti della cornice: pressione e rilascio per le tre varianti. */
export function buttonSpecs(p: Params, variant: number): { press: ClickSpec; release: ClickSpec } {
  const t = p.tone;
  const d = p.decay;
  if (variant === 1) {
    // scatto a ritenuta: pre-corsa leggera, poi la ritenuta che aggancia; al rilascio il tasto torna su e batte
    const modes: Mode[] = [
      ...scaleModes([1500, 2700, 4300], [0.6, 0.4, 0.2], [0.025, 0.018, 0.012], t, d),
      { hz: 300 * t, gain: 0.9, t60: 0.05 * d },
      { hz: 1850 * t, gain: 0.06, t60: 0.12 * d }, // molla
    ];
    const latch = p.latchMs / 1000;
    return {
      press: { modes, impulses: [{ at: 0, gain: 0.35 }, { at: latch, gain: 1 }], noise: 0.4, noiseT60: 0.0015, jitter: 0.03 },
      release: {
        modes,
        impulses: [{ at: 0, gain: 0.7 * p.release }, { at: latch * 1.5, gain: 0.6 * p.release }],
        noise: 0.3,
        noiseT60: 0.0015,
        jitter: 0.03,
      },
    };
  }
  if (variant === 2) {
    // bilanciere: uno scatto secco a ogni lato
    const spec = (k: number, g: number): ClickSpec => ({
      modes: [
        ...scaleModes([1800, 3100, 5000], [0.55, 0.35, 0.2], [0.02, 0.014, 0.01], t * k, d),
        { hz: 480 * t * k, gain: 0.7, t60: 0.035 * d },
      ],
      impulses: bounces(1, 0.0012).map((i) => ({ ...i, gain: i.gain * g })),
      noise: 0.5,
      noiseT60: 0.0012,
      jitter: 0.03,
    });
    return { press: spec(1, 1), release: spec(0.95, p.release) };
  }
  // clic morbido di plastica: modi alti e brevi, poco corpo
  const modes = (k: number): Mode[] => [
    ...scaleModes([2400, 3900, 6100], [0.4, 0.3, 0.15], [0.012, 0.009, 0.006], t * k, d),
    { hz: 650 * t * k, gain: 0.3, t60: 0.02 * d },
  ];
  return {
    press: { modes: modes(1), impulses: [{ at: 0, gain: 1 }, { at: 0.0006, gain: 0.3 }], noise: 0.35, noiseT60: 0.001, jitter: 0.03 },
    release: { modes: modes(1.12), impulses: [{ at: 0, gain: 0.8 * p.release }], noise: 0.25, noiseT60: 0.001, jitter: 0.03 },
  };
}

export function crackleSpec(p: Params): CrackleSpec {
  return { duration: p.crackleDur, peakAt: Math.min(0.25, p.crackleDur / 4), rate: p.crackleRate, tick: 0.0015, hiss: p.hiss * 0.3 };
}

const MASK_MODES = [
  { hz: 233, t60: 0.6, gain: 1 },
  { hz: 377, t60: 0.5, gain: 0.8 },
  { hz: 611, t60: 0.45, gain: 0.7 },
  { hz: 887, t60: 0.4, gain: 0.55 },
  { hz: 1291, t60: 0.3, gain: 0.45 },
  { hz: 1733, t60: 0.25, gain: 0.35 },
  { hz: 2389, t60: 0.2, gain: 0.25 },
  { hz: 2971, t60: 0.15, gain: 0.2 },
];

export function degaussSpec(p: Params, mains: number): DegaussSpec {
  return {
    mains,
    duration: Math.min(4, p.decay * 4 + 0.6),
    decay: p.decay,
    thump: p.thump,
    thumpHz: p.thumpHz,
    buzz: p.buzz,
    ring: p.ring,
    rattle: p.rattle,
    modes: MASK_MODES.map((m) => ({ ...m, hz: m.hz * p.maskScale })),
  };
}

export function caseSpec(p: Params): CaseSpec {
  const k = p.resScale;
  return {
    seconds: p.size,
    modes: [
      { hz: 170 * k, t60: p.size * 0.9, gain: 0.25 },
      { hz: 310 * k, t60: p.size * 0.7, gain: 0.2 },
      { hz: 540 * k, t60: p.size * 0.5, gain: 0.15 },
      { hz: 860 * k, t60: p.size * 0.35, gain: 0.1 },
    ],
    taps: [0.0034, 0.0071],
  };
}

/** Frequenza del passaggio delle pale (Hz). */
export const bladePass = (p: Params) => (p.rpm / 60) * p.blades;

// ---------- grafi ----------

export type Case = { input: AudioNode; update(p: Params): void };

/** Mobile condiviso: secco + convoluzione con la risposta del mobile, poi un passa basso. */
export function createCase(ctx: BaseAudioContext, out: AudioNode, p: Params, seed = 11): Case {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const conv = ctx.createConvolver();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  input.connect(dry).connect(lp);
  input.connect(conv).connect(wet).connect(lp);
  lp.connect(out);
  let last = '';
  function update(q: Params) {
    const key = JSON.stringify(caseSpec(q));
    if (key !== last) {
      last = key;
      conv.buffer = toBuffer(ctx, renderCaseIR(caseSpec(q), ctx.sampleRate, seed));
    }
    // mobile spento: le voci meccaniche passano dritte, senza risonanza né passa basso
    const on = q.on !== 0;
    wet.gain.value = on ? q.wet : 0;
    dry.gain.value = on ? 1 - q.wet * 0.4 : 1;
    lp.frequency.value = on ? q.lowpass : Math.min(20000, ctx.sampleRate / 2);
  }
  update(p);
  return { input, update };
}

function toBuffer(ctx: BaseAudioContext, data: Float32Array): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, data.length), ctx.sampleRate);
  b.getChannelData(0).set(data);
  return b;
}

export class Synth {
  private cache = new Map<string, AudioBuffer[]>();
  private last = new Map<string, number>();
  private r: () => number;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly bus: Bus,
    readonly seed = 1,
  ) {
    this.r = rng(seed * 31 + 7);
  }

  /** Buffer in cache per specifica: cambiando un parametro si rirende. */
  private buffers(key: string, make: () => Float32Array[]): AudioBuffer[] {
    let b = this.cache.get(key);
    if (!b) {
      b = make().map((d) => toBuffer(this.ctx, d));
      this.cache.set(key, b);
    }
    return b;
  }

  /**
   * Varianti di un clic scalate con un solo fattore: quello che porta a `peak` il picco di `ref`
   * (di solito la pressione, per il rilascio; il clic stesso se manca). Così il rilascio resta
   * più debole della pressione e lo spegnimento del relè più debole dell'accensione.
   */
  private clickBuffers(name: string, spec: ClickSpec, peak: number, ref?: ClickSpec): AudioBuffer[] {
    const key = name + JSON.stringify(spec) + (ref ? JSON.stringify(ref) : '');
    return this.buffers(key, () => {
      const sr = this.ctx.sampleRate;
      const v = renderVariants(spec, sr, VARIANTS, this.seed * 1009 + name.length);
      let max = 0;
      for (const d of ref ? [renderClick(ref, sr, this.seed * 1009)] : v) for (const x of d) max = Math.max(max, Math.abs(x));
      if (max > 0) for (const d of v) for (let i = 0; i < d.length; i++) d[i] = (d[i] / max) * peak;
      return v;
    });
  }

  /** Suona una variante a caso (mai la stessa due volte) con ±2,5 % di velocità e ±1,5 dB. */
  private shot(name: string, list: AudioBuffer[], at: number, gain: number, to: AudioNode = this.bus.mech, vary = true) {
    const i = nextVariant(list.length, this.last.get(name) ?? -1, this.r);
    this.last.set(name, i);
    const src = this.ctx.createBufferSource();
    src.buffer = list[i];
    if (vary) src.playbackRate.value = 1 + (this.r() * 2 - 1) * 0.025;
    const g = this.ctx.createGain();
    g.gain.value = gain * (vary ? 10 ** (((this.r() * 2 - 1) * 1.5) / 20) : 1);
    src.connect(g).connect(to);
    src.start(Math.max(at, this.ctx.currentTime));
    return src;
  }

  private loop(data: Float32Array, at: number, to: AudioNode, offset = 0): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = toBuffer(this.ctx, data);
    s.loop = true;
    s.connect(to);
    s.start(at, offset);
    return s;
  }

  private noiseCache = new Map<string, Float32Array>();
  private noise(kind: 'pink' | 'wander', seconds: number, extra: number): Float32Array {
    const key = `${kind}:${seconds}:${extra}`;
    let d = this.noiseCache.get(key);
    if (!d) {
      const sr = this.ctx.sampleRate;
      d = kind === 'pink' ? pinkNoise(seconds, sr, this.seed * 97 + seconds * 10) : wander(seconds, sr, extra, this.seed * 89 + seconds * 10);
      this.noiseCache.set(key, d);
    }
    return d;
  }

  private gain(v: number, to: AudioNode | AudioParam): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    // un AudioParam ha `value`, un nodo no: si modula il parametro
    if ('value' in to) g.connect(to);
    else g.connect(to);
    return g;
  }

  private filter(type: BiquadFilterType, hz: number, q: number, to: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    f.connect(to);
    return f;
  }

  private osc(hz: number, to: AudioNode, wave?: PeriodicWave): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave);
    o.frequency.value = hz;
    o.connect(to);
    return o;
  }

  // --- interruttore / relè ---
  relay(p: Params, at: number, which: 'on' | 'off' = 'on') {
    this.shot('relay-' + which, this.clickBuffers('relay-' + which, relaySpec(p, which), 0.9, relaySpec(p, 'on')), at, p.level * (which === 'off' ? 0.85 : 1));
  }

  // --- tubo: crepitio dell'alta tensione e fischio del flyback ---
  /** `transients`: crepitio all'accensione e scintille allo spegnimento (no: solo il fischio). */
  tube(p: Params, mains: number, at: number, transients = true): Handle {
    if (transients) {
      const crackle = this.buffers('crackle' + JSON.stringify(crackleSpec(p)), () => [
        normalize(renderCrackle(crackleSpec(p), this.ctx.sampleRate, this.seed * 13)),
      ]);
      this.shot('crackle', crackle, at, p.crackle * 0.6, this.bus.direct, false);
    }

    const whineGain = this.gain(0, this.bus.direct);
    whineGain.gain.setValueAtTime(0, at);
    whineGain.gain.linearRampToValueAtTime(p.whine, at + p.whineRise);
    // deriva lenta della frequenza di riga, in Hz
    const driftGain = this.ctx.createGain();
    driftGain.gain.value = p.jitter;
    const drift = this.loop(this.noise('wander', 9.7, 0.6), at, driftGain);
    const parts: OscillatorNode[] = [];
    // la riga più due bande laterali deboli a ± rete (modulazione del ronzio)
    for (const [k, g] of [
      [0, 1],
      [-1, 0.12],
      [1, 0.12],
    ] as const) {
      const hz = p.lineHz + k * mains;
      const o = this.osc(hz, this.gain(g, whineGain));
      o.frequency.setValueAtTime(hz * 0.985, at);
      o.frequency.exponentialRampToValueAtTime(hz, at + p.whineRise * 0.6);
      driftGain.connect(o.frequency);
      o.start(at);
      parts.push(o);
    }
    return {
      stop: (t = this.ctx.currentTime) => {
        whineGain.gain.cancelScheduledValues(t);
        whineGain.gain.setValueAtTime(whineGain.gain.value, t);
        whineGain.gain.setTargetAtTime(0, t, 0.06);
        // allo spegnimento il tubo si scarica con qualche scintilla
        if (transients) {
          const off: CrackleSpec = { ...crackleSpec(p), duration: 0.5, peakAt: 0.02, rate: p.crackleRate * 0.4 };
          const b = this.buffers('crackle-off' + JSON.stringify(off), () => [normalize(renderCrackle(off, this.ctx.sampleRate, this.seed * 17))]);
          this.shot('crackle-off', b, t, p.crackle * 0.35, this.bus.direct, false);
        }
        for (const o of parts) o.stop(t + 0.6);
        drift.stop(t + 0.6);
      },
    };
  }

  // --- smagnetizzazione ---
  degauss(p: Params, mains: number, at: number) {
    if (!p.on) return;
    const spec = degaussSpec(p, mains);
    const b = this.buffers('degauss' + JSON.stringify(spec), () => [normalize(renderDegauss(spec, this.ctx.sampleRate, this.seed * 19))]);
    this.shot('degauss', b, at, p.level, this.bus.mech, false);
  }

  // --- ronzio del trasformatore ---
  hum(p: Params, at: number, inrush = true): Handle {
    const h = humHarmonics({ fundamental: p.fundamental, rolloffDb: p.rolloff, odd: p.odd, maxHarmonic: 20 });
    const wave = this.ctx.createPeriodicWave(h.real, h.imag, { disableNormalization: true });
    let sum = 0;
    for (const v of h.imag) sum += Math.abs(v);
    const level = this.gain(p.level, this.bus.mech);
    // variazione casuale del carico: ±wander attorno a 1
    const wobble = this.gain(1, level);
    const load = this.loop(this.noise('wander', 13.3, 0.8), at, this.gain(p.wander, wobble.gain));
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = softClipCurve(1025, p.drive) as Float32Array<ArrayBuffer>;
    shaper.connect(wobble);
    const surge = this.gain(1, shaper);
    if (inrush) {
      // spunto: il trasformatore assorbe molto di più per un attimo e ronza saturando
      surge.gain.setValueAtTime(p.inrush, at);
      surge.gain.setTargetAtTime(1, at + 0.01, p.inrushS / 3);
    }
    const o = this.osc(p.mains, this.gain(0.35 / Math.max(sum, 1e-3), surge), wave);
    o.start(at);
    return {
      stop: (t = this.ctx.currentTime) => {
        level.gain.cancelScheduledValues(t);
        level.gain.setValueAtTime(level.gain.value, t);
        level.gain.setTargetAtTime(0, t, 0.04);
        o.stop(t + 0.4);
        load.stop(t + 0.4);
      },
    };
  }

  // --- ventola: soffio, passaggio delle pale, sbilanciamento, ronzio del motore ---
  fan(p: Params, mains: number, at: number, spinUp = true): Handle {
    const c = this.ctx;
    const bpf = bladePass(p);
    const out = this.gain(0, this.bus.mech);
    // soffio largo e uno strato basso, rumori di lunghezze diverse: il giro del loop non si sente
    const air = this.gain(p.air, out);
    const band = this.filter('bandpass', p.airHz, 0.6, air);
    const a = this.loop(this.noise('pink', 7.3, 0), at, band);
    const low = this.loop(this.noise('pink', 11.9, 0), at, this.filter('lowpass', 380, 0.7, this.gain(p.air * 0.35, out)), 3.1);
    // sbilanciamento dell'albero: modulazione al giro
    const shaft = this.osc(p.rpm / 60, this.gain(p.air * p.shaftAm, air.gain));
    // flusso che varia piano, a caso
    const flow = this.loop(this.noise('wander', 10.7, 0.5), at, this.gain(p.air * p.wobble, air.gain));
    // passaggio delle pale con 2a e 3a armonica, frequenza che trema appena
    const bladeWave = c.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, 0.45, 0.2]));
    const tone = this.osc(bpf, this.gain(p.tone * 0.25, out), bladeWave);
    const jit = this.loop(this.noise('wander', 6.1, 3), at, this.gain(bpf * 0.004, tone.frequency));
    // ronzio del motore a 2x rete: c'è da subito, non dipende dai giri
    const motor = this.gain(p.motorHum * p.level * 0.15, this.bus.mech);
    const mo = this.osc(mains * 2, motor);
    // fischio metallico del motorino: righe fitte e acute, sale e scende con i giri.
    // Va diretto: il passa basso del mobile lo taglierebbe.
    const wc = motorWhine({ f0: p.whineHz, centerHz: p.whineCenter, octaves: 1.1, seed: this.seed * 31 + 7 }, c.sampleRate);
    const whineOut = this.gain(0, this.bus.direct);
    const whine = this.osc(p.whineHz, whineOut, c.createPeriodicWave(wc.real, wc.imag));
    const wj = this.loop(this.noise('wander', 5.3, 2), at, this.gain(p.whineHz * 0.003, whine.frequency));
    const whineLevel = (f: number) => p.level * p.whine * 3.5 * f ** 2;

    const level = (f: number) => p.level * f ** 2.5;
    const set = (from: number, to: number, t: number, secs: number) => {
      const curve = spinCurve(from, to, secs);
      const sc = (k: (f: number) => number) => curve.map(k);
      const params: [AudioParam, (f: number) => number][] = [
        [out.gain, level],
        [tone.frequency, (f) => Math.max(1, f * bpf)],
        [shaft.frequency, (f) => Math.max(0.1, (f * p.rpm) / 60)],
        [band.frequency, (f) => 200 + f * (p.airHz - 200)],
        [whineOut.gain, whineLevel],
        [whine.frequency, (f) => Math.max(1, f * p.whineHz)],
      ];
      for (const [param, k] of params) {
        param.cancelScheduledValues(t);
        param.setValueAtTime(k(from), t);
        param.setValueCurveAtTime(sc(k), t + 0.001, secs);
      }
    };
    const upSecs = spinUp ? p.spinUp : 0;
    if (spinUp) set(0.001, 1, at, p.spinUp);
    else {
      out.gain.value = level(1);
      whineOut.gain.value = whineLevel(1);
    }
    shaft.start(at);
    whine.start(at);
    tone.start(at);
    mo.start(at);
    return {
      stop: (t = c.currentTime) => {
        // giri raggiunti finora: se si spegne mentre prende giri, rallenta da lì
        const f = upSecs ? curveAt(spinCurve(0.001, 1, upSecs), upSecs, t - at) : 1;
        const secs = p.spinDown * Math.max(f, 0.05);
        set(f, 0.001, t, secs);
        motor.gain.setTargetAtTime(0, t, 0.03);
        const end = t + secs + 0.1;
        for (const n of [a, low, flow, jit, shaft, tone, mo, whine, wj]) n.stop(end);
      },
    };
  }

  // --- disco ---
  private steps(p: Params, kind: DiskKind) {
    return this.clickBuffers('step-' + kind, stepSpec(p, kind), 0.9);
  }

  step(p: Params, kind: DiskKind, at: number, mul = 1) {
    this.shot('step', this.steps(p, kind), at, p.level * mul);
  }

  /** Seek di n tracce a passo costante, poi lo scatto di assestamento. Restituisce l'istante finale. */
  seek(p: Params, kind: DiskKind, n: number, at: number): number {
    const dt = p.stepMs / 1000;
    for (let i = 0; i < n; i++) this.step(p, kind, at + i * dt);
    const end = at + (n - 1) * dt + p.settleMs / 1000;
    this.step(p, kind, end, 0.45);
    return end;
  }

  /** Ricalibrazione: la testina torna alla traccia 0; il Disk II sbatte contro il fermo. */
  recalibrate(p: Params, kind: DiskKind, at: number): number {
    const dt = p.stepMs / 1000;
    const n = Math.round(p.recalSteps);
    const bang = p.stopBang > 0 ? this.clickBuffers('bang', bangSpec(p), 0.9) : [];
    for (let i = 0; i < n; i++) {
      const t = at + i * dt;
      // dalla metà in poi la testina è già al fermo: ogni passo è un colpo
      if (bang.length && i >= n / 2) this.shot('bang', bang, t, p.level * p.stopBang);
      else this.step(p, kind, t);
    }
    return at + n * dt;
  }

  headLoad(p: Params, at: number) {
    if (p.headLoad > 0) this.shot('headload', this.clickBuffers('headload', headLoadSpec(), 0.9), at, p.level * p.headLoad);
  }

  /** Motore del disco: rumore di attrito modulato al giro, un tono del motore, partenza in `motorSpinUp`. */
  motor(p: Params, kind: DiskKind, mains: number, at: number): Handle {
    const c = this.ctx;
    const out = this.gain(0, this.bus.mech);
    out.gain.setValueAtTime(0, at);
    out.gain.setTargetAtTime(p.motor * p.level, at, p.motorSpinUp / 3);
    const am = this.gain(0.6, out);
    const n = this.loop(this.noise('pink', 5.3, 0), at, this.filter('bandpass', kind === 'otto' ? 260 : 380, 0.8, am), 1.3);
    const hiss = this.loop(this.noise('pink', 7.3, 0), at, this.filter('bandpass', 3200, 1.2, this.gain(0.12, out)), 2.2);
    // "chuff" una volta per giro: impulso con armoniche
    const chuffWave = c.createPeriodicWave(new Float32Array(5), new Float32Array([0, 1, 0.6, 0.35, 0.2]));
    const rot = this.osc(p.rotationHz, this.gain(0.35, am.gain), chuffWave);
    rot.frequency.setValueAtTime(p.rotationHz * 0.1, at);
    rot.frequency.setTargetAtTime(p.rotationHz, at, p.motorSpinUp / 3);
    const toneHz = kind === 'otto' ? mains * 2 : kind === 'cinque' ? 410 : 290;
    const tone = this.osc(toneHz, this.gain(0.04, out));
    tone.frequency.setValueAtTime(toneHz * 0.3, at);
    tone.frequency.setTargetAtTime(toneHz, at, p.motorSpinUp / 3);
    for (const s of [rot, tone]) s.start(at);
    return {
      stop: (t = c.currentTime) => {
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.setTargetAtTime(0, t, 0.18);
        rot.frequency.setTargetAtTime(0.5, t, 0.25);
        tone.frequency.setTargetAtTime(toneHz * 0.2, t, 0.25);
        for (const s of [n, hiss, rot, tone]) s.stop(t + 1.2);
      },
    };
  }

  // --- tasti della cornice ---
  button(p: Params, variant: number, action: 'press' | 'release', at: number) {
    const specs = buttonSpecs(p, variant);
    const list = this.clickBuffers(`button${variant}-${action}`, specs[action], 0.9, specs.press);
    this.shot(`button${variant}-${action}`, list, at, p.level);
  }
}

