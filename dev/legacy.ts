// Le voci attuali di src/client/audio.ts, copiate qui per il confronto A/B nel banco dei suoni.
// Stessi grafi e livelli, ma con l'uscita a scelta e ogni voce separata. Solo sviluppo:
// sparisce con la fase 2, quando audio.ts userà le voci nuove.
import { LEVELS } from '../src/client/audio';

export type Handle = { stop(at?: number): void };

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

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

const HUM_HZ = [50, 100, 150, 250, 350];
const FLYBACK_HZ = 15625;

export class Legacy {
  private brown: AudioBuffer;
  private white: AudioBuffer;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
  ) {
    this.brown = brownNoise(ctx, 4);
    this.white = whiteNoise(ctx, 0.25);
  }

  private gain(value: number, to: AudioNode = this.out): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(to);
    return g;
  }

  private osc(type: OscillatorType, hz: number, to: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.connect(to);
    return o;
  }

  private filter(type: BiquadFilterType, hz: number, q: number, to: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    f.connect(to);
    return f;
  }

  private noise(buffer: AudioBuffer, to: AudioNode, loop = false): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    s.connect(to);
    return s;
  }

  /** Clic del relè e colpo del trasformatore (in audio.ts sono insieme). */
  relay(t0: number) {
    const clickGain = this.gain(0);
    clickGain.gain.setValueAtTime(LEVELS.relay, t0);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.018);
    const click = this.noise(this.white, this.filter('bandpass', 2600, 1.5, clickGain));
    click.start(t0);
    click.stop(t0 + 0.03);

    const thunkGain = this.gain(0);
    thunkGain.gain.setValueAtTime(LEVELS.thunk, t0 + 0.01);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
    const thunk = this.osc('sine', 120, thunkGain);
    thunk.frequency.setValueAtTime(120, t0 + 0.01);
    thunk.frequency.exponentialRampToValueAtTime(40, t0 + 0.16);
    thunk.start(t0 + 0.01);
    thunk.stop(t0 + 0.3);
  }

  degauss(t0: number) {
    const g = this.gain(0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(LEVELS.degauss, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
    const lp = this.filter('lowpass', 700, 1, g);
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(180, t0 + 1.6);
    for (const [type, hz] of [['sawtooth', 50], ['sine', 100]] as const) {
      const o = this.osc(type, hz, lp);
      o.start(t0);
      o.stop(t0 + 1.7);
    }
    const ring = this.gain(0);
    ring.gain.setValueAtTime(LEVELS.degauss * 0.18, t0);
    ring.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    for (const hz of [231, 467]) {
      const o = this.osc('sine', hz, ring);
      o.start(t0);
      o.stop(t0 + 0.8);
    }
  }

  driveSpinUp(t0: number) {
    const g = this.gain(0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(LEVELS.drive, t0 + 0.8);
    g.gain.setValueAtTime(LEVELS.drive, t0 + 2.2);
    g.gain.linearRampToValueAtTime(0, t0 + 3.4);
    const o = this.osc('triangle', 90, this.filter('lowpass', 1200, 0.7, g));
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(420, t0 + 2.4);
    o.start(t0);
    o.stop(t0 + 3.5);
  }

  seek(n: number, t0: number) {
    let at = t0;
    for (let i = 0; i < n; i++) {
      const g = this.gain(0);
      const peak = LEVELS.seek * (0.6 + Math.random() * 0.4);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      const s = this.noise(this.white, this.filter('bandpass', 1800 + Math.random() * 2500, 3, g));
      s.start(at, Math.random() * 0.2);
      s.stop(at + 0.04);
      at += 0.04 + Math.random() * 0.09;
    }
    return at;
  }

  /** Ventola attuale: rumore marrone, banda stretta a 190 Hz, oscillazione a 0,21 Hz. */
  fan(t0: number, ramp: number): Handle {
    const end = t0 + Math.max(ramp, 0.01);
    const bus = this.gain(1);
    const fanGain = this.gain(0, bus);
    fanGain.gain.setValueAtTime(ramp ? 0 : LEVELS.fan, t0);
    if (ramp) fanGain.gain.linearRampToValueAtTime(LEVELS.fan, end);
    const fanLp = this.filter('lowpass', 650, 0.7, fanGain);
    fanLp.frequency.setValueAtTime(ramp ? 160 : 650, t0);
    if (ramp) fanLp.frequency.exponentialRampToValueAtTime(650, end);
    const fan = this.noise(this.brown, fanLp, true);
    fan.playbackRate.setValueAtTime(ramp ? 0.45 : 1, t0);
    if (ramp) fan.playbackRate.linearRampToValueAtTime(1, end);
    const toneGain = this.gain(0, bus);
    toneGain.gain.setValueAtTime(ramp ? 0 : LEVELS.fanTone, t0);
    if (ramp) toneGain.gain.linearRampToValueAtTime(LEVELS.fanTone, end);
    const tone = this.noise(this.brown, this.filter('bandpass', 190, 6, toneGain), true);
    tone.start(t0, 1.7);
    const wobble = this.ctx.createGain();
    wobble.gain.value = LEVELS.fan * 0.12;
    wobble.connect(fanGain.gain);
    const lfo = this.osc('sine', 0.21, wobble);
    lfo.start(t0);
    fan.start(t0);
    return {
      // in audio.ts la ventola non si ferma mai: qui sfuma in fretta
      stop: (t = this.ctx.currentTime) => {
        bus.gain.setTargetAtTime(0, t, 0.05);
        for (const s of [fan, tone, lfo]) s.stop(t + 0.5);
      },
    };
  }

  hum(t0: number): Handle {
    const hum = this.gain(0);
    hum.gain.setValueAtTime(0, t0);
    hum.gain.linearRampToValueAtTime(1, t0 + 0.3);
    const oscs = HUM_HZ.map((hz, i) => {
      const o = this.osc('sine', hz, this.gain(LEVELS.hum[i], hum));
      o.start(t0);
      return o;
    });
    return {
      stop: (t = this.ctx.currentTime) => {
        hum.gain.setTargetAtTime(0, t, 0.05);
        for (const o of oscs) o.stop(t + 0.5);
      },
    };
  }

  whine(t0: number): Handle {
    const whineGain = this.gain(0);
    whineGain.gain.setValueAtTime(0, t0);
    whineGain.gain.linearRampToValueAtTime(LEVELS.whine, t0 + 0.8);
    const whine = this.osc('sine', FLYBACK_HZ, whineGain);
    whine.frequency.setValueAtTime(FLYBACK_HZ - 500, t0);
    whine.frequency.exponentialRampToValueAtTime(FLYBACK_HZ, t0 + 0.8);
    whine.start(t0);
    return {
      stop: (t = this.ctx.currentTime) => {
        whineGain.gain.setTargetAtTime(0, t, 0.05);
        whine.stop(t + 0.5);
      },
    };
  }
}
