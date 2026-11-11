import { describe, expect, it } from 'vitest';
import {
  bounces,
  clickLength,
  crackleShape,
  curveAt,
  humHarmonics,
  nextVariant,
  pinkNoise,
  renderClick,
  renderCrackle,
  renderDegauss,
  renderVariants,
  rng,
  spinCurve,
  wander,
  type ClickSpec,
} from '../../src/client/sound/dsp';
import { PROFILES, SCHEMA, VOICES } from '../../src/client/sound/profiles';
import { buttonSpecs, crackleSpec, degaussSpec, relaySpec, stepSpec } from '../../src/client/sound/voices';
import { soundBoard } from '../../dev/integration.mjs';

const SR = 8000;

const rms = (d: Float32Array, a = 0, b = d.length) => Math.sqrt(d.subarray(a, b).reduce((s, x) => s + x * x, 0) / Math.max(1, b - a));

// potenza alla frequenza hz (algoritmo di Goertzel)
function power(d: Float32Array, hz: number, sr: number): number {
  const k = 2 * Math.cos((2 * Math.PI * hz) / sr);
  let s1 = 0, s2 = 0;
  for (const x of d) {
    const s = x + k * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - k * s1 * s2;
}

const oneMode: ClickSpec = { modes: [{ hz: 1000, t60: 0.1, gain: 1 }], impulses: [{ at: 0, gain: 1 }], noise: 0, noiseT60: 0.001, jitter: 0 };

describe('dsp', () => {
  it('rng: stesso seme, stessa sequenza in [0, 1)', () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rng(43)()).not.toBe(xs[0]);
  });

  it('il clic dura ultimo colpo più la coda più lunga, e si spegne', () => {
    const spec: ClickSpec = { ...oneMode, impulses: bounces(2, 0.002) };
    const d = renderClick(spec, SR, 1);
    expect(d.length).toBe(clickLength(spec, SR));
    expect(d.length).toBe(Math.ceil((0.0032 * 1.1 + 0.1) * SR) + 1);
    expect(d.every(Number.isFinite)).toBe(true);
    const peak = Math.max(...d.map(Math.abs));
    expect(rms(d, d.length - 40)).toBeLessThan(peak * 0.003);
  });

  it('un modo scende di circa 60 dB in t60', () => {
    const d = renderClick(oneMode, 48000, 1);
    const head = rms(d, 0, 240);
    const tail = rms(d, 4560, 4800); // 95-100 ms
    expect(tail / head).toBeGreaterThan(0.0005);
    expect(tail / head).toBeLessThan(0.002);
  });

  it('le varianti sono deterministiche e diverse fra loro', () => {
    const spec = relaySpec(PROFILES[0].params.interruttore, 'on');
    const a = renderVariants(spec, SR, 4, 7);
    const b = renderVariants(spec, SR, 4, 7);
    expect(a).toHaveLength(4);
    a.forEach((v, i) => expect(v).toEqual(b[i]));
    expect(a[0]).not.toEqual(a[1]);
  });

  it('i rimbalzi arrivano sempre più vicini e più deboli', () => {
    const b = bounces(3, 0.002);
    expect(b).toHaveLength(4);
    for (let i = 1; i < b.length; i++) {
      expect(b[i].at).toBeGreaterThan(b[i - 1].at);
      expect(b[i].gain).toBeLessThan(b[i - 1].gain);
    }
    expect(b[2].at - b[1].at).toBeLessThan(b[1].at - b[0].at);
  });

  it('rumore rosa e variazione lenta: lunghezze giuste, valori limitati', () => {
    const p = pinkNoise(1, SR, 3);
    expect(p.length).toBe(SR - 0.05 * SR);
    expect(Math.max(...p.map(Math.abs))).toBeCloseTo(1, 5);
    const w = wander(2, SR, 1, 5);
    expect(w.length).toBe(2 * SR);
    expect(w.every((x) => x >= -1 && x <= 1)).toBe(true);
    expect(pinkNoise(1, SR, 3)).toEqual(p);
  });

  it('crepitio: più fitto vicino al massimo che alla fine', () => {
    const spec = crackleSpec(PROFILES[1].params.tubo);
    expect(crackleShape(spec, spec.peakAt)).toBeCloseTo(1, 5);
    expect(crackleShape(spec, spec.duration + 1)).toBe(0);
    const d = renderCrackle(spec, 48000, 9);
    expect(d.every(Number.isFinite)).toBe(true);
    const q = Math.floor(d.length / 4);
    expect(rms(d, 0, q)).toBeGreaterThan(rms(d, 3 * q) * 2);
  });

  it('smagnetizzazione: vibra al doppio della rete e si spegne', () => {
    const spec = { ...degaussSpec(PROFILES[1].params.smagnetizzazione, 50), ring: 0, thump: 0, rattle: 0 };
    const d = renderDegauss(spec, SR, 1);
    expect(power(d, 100, SR)).toBeGreaterThan(power(d, 50, SR) * 100);
    const tenth = Math.floor(d.length / 10);
    expect(rms(d, d.length - tenth)).toBeLessThan(rms(d, 0, tenth) / 30);
    const d60 = renderDegauss({ ...spec, mains: 60 }, SR, 1);
    expect(power(d60, 120, SR)).toBeGreaterThan(power(d60, 100, SR) * 10);
  });

  it('ronzio: la componente più forte è il doppio della rete', () => {
    const h = humHarmonics({ fundamental: 0.15, rolloffDb: 6, odd: 0.25, maxHarmonic: 20 });
    const max = Math.max(...h.imag);
    expect(h.imag[2]).toBe(max);
    expect(h.imag[1]).toBeCloseTo(0.15);
    expect(h.imag[7]).toBe(0); // dispari solo 3x e 5x
    expect(h.imag[4]).toBeCloseTo(0.5, 2); // -6 dB per ottava
  });

  it('curva dei giri: parte, arriva, sale sempre', () => {
    const c = spinCurve(0, 1, 2);
    expect(c[0]).toBe(0);
    expect(c[c.length - 1]).toBe(1);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    expect(curveAt(c, 2, -1)).toBe(0);
    expect(curveAt(c, 2, 5)).toBe(1);
    expect(curveAt(c, 2, 0.5)).toBeGreaterThan(0.5); // salita rapida, poi si avvicina piano
  });

  it('la variante successiva non ripete mai la precedente', () => {
    const r = rng(1);
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const k = nextVariant(6, last, r);
      expect(k).not.toBe(last);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(6);
      seen.add(k);
      last = k;
    }
    expect(seen.size).toBe(6);
    expect(nextVariant(1, 0, r)).toBe(0);
  });
});

describe('profili', () => {
  it('quattro profili, ognuno con tutti i parametri dentro i limiti', () => {
    expect(PROFILES.map((p) => p.id)).toEqual(['cpm8', 'ibm5150', 'appleii', 'vt100']);
    for (const p of PROFILES) {
      for (const v of VOICES) {
        const params = p.params[v];
        expect(Object.keys(params).sort(), `${p.id}.${v}`).toEqual(SCHEMA[v].map((d) => d.key).sort());
        for (const d of SCHEMA[v]) {
          const x = params[d.key];
          expect(x, `${p.id}.${v}.${d.key}`).toBeGreaterThanOrEqual(d.min);
          expect(x, `${p.id}.${v}.${d.key}`).toBeLessThanOrEqual(d.max);
          if (d.options) expect(d.options.map((o) => o.value)).toContain(x);
        }
      }
      expect(p.bootSeeks.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
    }
  });

  it('il terminale non ha disco, l\'Apple II non ha ventola', () => {
    const by = Object.fromEntries(PROFILES.map((p) => [p.id, p]));
    expect(by.vt100.disk).toBeUndefined();
    expect(by.vt100.bootSeeks).toEqual([]);
    expect(by.appleii.fan).toBe(false);
    expect(by.cpm8.disk).toBe('otto');
    expect(by.ibm5150.disk).toBe('cinque');
    expect(by.appleii.disk).toBe('diskii');
  });

  it('specifiche: rilascio più debole della pressione, spegnimento con meno rimbalzi, modi sotto Nyquist', () => {
    const p = PROFILES[1].params;
    const sum = (s: ClickSpec) => s.impulses.reduce((a, i) => a + i.gain, 0);
    for (const variant of [0, 1, 2]) {
      const b = buttonSpecs(p.tasti, variant);
      expect(sum(b.release), `variante ${variant}`).toBeLessThan(sum(b.press));
    }
    expect(relaySpec(p.interruttore, 'off').impulses.length).toBeLessThan(relaySpec(p.interruttore, 'on').impulses.length);
    for (const kind of ['otto', 'cinque', 'diskii'] as const) {
      for (const m of stepSpec(p.disco, kind).modes) {
        expect(m.hz).toBeGreaterThan(20);
        expect(m.hz).toBeLessThan(24000);
        expect(m.t60).toBeGreaterThan(0);
      }
    }
  });
});

describe('banco dei suoni', () => {
  it('la rotta /_suoni si inietta solo con astro dev', () => {
    const routes: string[] = [];
    const setup = soundBoard().hooks['astro:config:setup'];
    for (const command of ['build', 'preview', 'sync']) setup({ command, injectRoute: (r: { pattern: string }) => routes.push(r.pattern) });
    expect(routes).toEqual([]);
    setup({ command: 'dev', injectRoute: (r: { pattern: string }) => routes.push(r.pattern) });
    expect(routes).toEqual(['/_suoni']);
  });
});
