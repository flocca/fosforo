import { describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/client/audio';

// AudioContext finto: registra i nodi creati, lo stato e le chiamate a suspend/resume.
// Le automazioni dei parametri arrivano subito al valore finale (basta per i test).
class FakeParam {
  value: number;
  constructor(v = 0) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  setValueCurveAtTime(curve: ArrayLike<number>) {
    this.value = curve[curve.length - 1];
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  outputs: unknown[] = [];
  constructor(public kind: string) {}
  connect<T>(target: T): T {
    this.outputs.push(target);
    return target;
  }
  disconnect() {}
}

class FakeContext {
  nodes: FakeNode[] = [];
  calls: string[] = [];
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode('destination');

  private add<T extends FakeNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.add(Object.assign(new FakeNode('gain'), { gain: new FakeParam(1) }));
  }
  createOscillator() {
    const stops: number[] = [];
    const o = this.add(
      Object.assign(new FakeNode('oscillator'), {
        type: 'sine',
        frequency: new FakeParam(440),
        detune: new FakeParam(0),
        // frequenza alla partenza: le automazioni finte la cambiano subito (la ventola che rallenta)
        startHz: 0,
        stops,
        setPeriodicWave() {},
        start() {
          o.startHz = o.frequency.value;
        },
        stop(at = 0) {
          stops.push(at);
        },
      }),
    );
    return o;
  }
  createBufferSource() {
    const starts: number[][] = [];
    const stops: number[] = [];
    return this.add(
      Object.assign(new FakeNode('buffer'), {
        buffer: null as unknown,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: new FakeParam(1),
        starts,
        stops,
        start(...args: number[]) {
          starts.push(args);
        },
        stop(at = 0) {
          stops.push(at);
        },
      }),
    );
  }
  createPeriodicWave() {
    return {};
  }
  createConvolver() {
    return this.add(Object.assign(new FakeNode('convolver'), { buffer: null as unknown }));
  }
  createWaveShaper() {
    return this.add(Object.assign(new FakeNode('shaper'), { curve: null as unknown }));
  }
  // i file finti sono già campioni Float32 a 8 kHz
  decodeAudioData(data: ArrayBuffer) {
    const d = new Float32Array(data);
    return Promise.resolve({ sampleRate: 8000, length: d.length, duration: d.length / 8000, numberOfChannels: 1, getChannelData: () => d });
  }
  createBiquadFilter() {
    return this.add(
      Object.assign(new FakeNode('filter'), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1), gain: new FakeParam(0) }),
    );
  }
  createBuffer(_channels: number, length: number, sampleRate = 8000) {
    const data = new Float32Array(length);
    return { length, sampleRate, duration: length / sampleRate, numberOfChannels: 1, getChannelData: () => data };
  }
  // come nei browser, lo stato cambia dopo, non nella chiamata
  suspend() {
    this.calls.push('suspend');
    return Promise.resolve().then(() => {
      this.state = 'suspended';
    });
  }
  resume() {
    this.calls.push('resume');
    return Promise.resolve().then(() => {
      this.state = 'running';
    });
  }
}

// File di pezzi finti: `lengths` in secondi, 0,12 s di silenzio prima di ognuno.
function sprite(lengths: number[]): { data: ArrayBuffer; starts: number[] } {
  const sr = 8000;
  const starts: number[] = [];
  let t = 0.12;
  for (const l of lengths) {
    starts.push(t);
    t += l + 0.12;
  }
  const d = new Float32Array(Math.ceil(t * sr));
  lengths.forEach((l, k) => {
    for (let i = Math.round(starts[k] * sr); i < Math.round((starts[k] + l) * sr); i++) d[i] = 0.05;
  });
  return { data: d.buffer, starts };
}

const MECH = sprite([0.15, 0.18, 0.15, 0.12]);
const FLOPPY = sprite([...Array(12).fill(0.08), 0.37, 0.39, 0.4, 0.45, 0.53, 0.78, 3.2]);

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(files: 'tutti' | 'nessuno' | 'meccanica lenta' = 'tutti') {
  let releaseMech = () => {};
  const contexts: FakeContext[] = [];
  const audio = createAudio(
    () => {
      const c = new FakeContext();
      contexts.push(c);
      return c as unknown as AudioContext;
    },
    (name) => {
      if (files === 'nessuno') return Promise.reject(new Error('rete giù'));
      const f = name === 'meccanica' ? MECH : FLOPPY;
      if (files === 'meccanica lenta' && name === 'meccanica') return new Promise<ArrayBuffer>((r) => (releaseMech = () => r(f.data.slice(0))));
      return Promise.resolve(f.data.slice(0));
    },
  );
  // il guadagno principale è l'unico collegato all'uscita
  const master = () => {
    const c = contexts[0];
    const g = c.nodes.find((n) => n.outputs.includes(c.destination)) as unknown as { gain: FakeParam };
    return g.gain.value;
  };
  // sorgenti che suonano un pezzo registrato: [file, inizio nel file]
  const played = () =>
    contexts[0].nodes
      .filter((n) => n.kind === 'buffer')
      .flatMap((n) => {
        const b = n as unknown as { buffer: { getChannelData(): Float32Array } | null; starts: number[][] };
        const d = b.buffer?.getChannelData();
        const file = d?.byteLength === MECH.data.byteLength ? 'meccanica' : d?.byteLength === FLOPPY.data.byteLength ? 'floppy' : null;
        return file ? b.starts.map((st) => [file, st[1] ?? 0] as const) : [];
      });
  // oscillatori della riga del tubo (15625 Hz): uno per tubo acceso
  const tubes = () => contexts[0].nodes.filter((n) => n.kind === 'oscillator' && (n as unknown as { frequency: FakeParam }).frequency.value === 15625).length;
  // sorgenti in loop avviate: il motore del floppy
  const motors = () => contexts[0].nodes.filter((n) => n.kind === 'buffer' && (n as unknown as { loop: boolean; starts: number[][] }).loop && (n as unknown as { starts: number[][] }).starts.length > 0 && (n as unknown as { buffer: { getChannelData(): Float32Array } }).buffer?.getChannelData().byteLength === FLOPPY.data.byteLength).length;
  type Osc = { startHz: number; stops: number[] };
  const oscs = () => contexts[0].nodes.filter((n) => n.kind === 'oscillator') as unknown as Osc[];
  // per gli oscillatori partiti a `hz`: se ognuno suona ancora dopo `t` (nessuno stop, o l'ultimo dopo `t`)
  const running = (hz: number, t: number) =>
    oscs()
      .filter((o) => o.startHz === hz)
      .map((o) => o.stops.length === 0 || o.stops[o.stops.length - 1] > t);
  // pezzi della meccanica: [inizio nel file, istante in cui suona]
  const mechPlays = () =>
    contexts[0].nodes
      .filter((n) => n.kind === 'buffer' && (n as unknown as { buffer: { getChannelData(): Float32Array } | null }).buffer?.getChannelData().byteLength === MECH.data.byteLength)
      .flatMap((n) => (n as unknown as { starts: number[][] }).starts.map((st) => [st[1] ?? 0, st[0]] as const));
  return { audio, contexts, master, played, tubes, motors, oscs, running, mechPlays, releaseMech: () => releaseMech() };
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
// fischio del motorino della ventola (FAN.whineHz): uno per ventola
const WHINE_HZ = 504;
const FAN_SPIN_DOWN = 5;

describe('createAudio', () => {
  it('non crea il contesto prima di powerOn', () => {
    const { audio, contexts } = setup();
    expect(contexts).toHaveLength(0);
    expect(audio.started).toBe(false);
    audio.powerOn();
    expect(contexts).toHaveLength(1);
    expect(audio.started).toBe(true);
    // una seconda accensione (reboot) non crea un altro contesto
    audio.powerOn();
    audio.spinUp();
    expect(contexts).toHaveLength(1);
  });

  it('spinUp crea il contesto (link profondo al primo gesto)', () => {
    const { audio, contexts } = setup();
    audio.spinUp();
    expect(contexts).toHaveLength(1);
    expect(audio.started).toBe(true);
  });

  it('seek prima dell\'accensione non crea niente; dopo crea i clic della testina', async () => {
    const { audio, contexts } = setup();
    audio.seek(3);
    expect(contexts).toHaveLength(0);
    audio.powerOn();
    // il floppy registrato si decodifica dopo l'accensione
    await flush();
    const before = contexts[0].nodes.length;
    audio.seek(3);
    expect(contexts[0].nodes.length).toBeGreaterThan(before);
  });

  it('setMuted(true) porta il guadagno principale a 0, setMuted(false) lo rimette', () => {
    const { audio, master } = setup();
    audio.powerOn();
    const level = master();
    expect(level).toBeGreaterThan(0);
    audio.setMuted(true);
    expect(audio.muted).toBe(true);
    expect(master()).toBe(0);
    audio.setMuted(false);
    expect(audio.muted).toBe(false);
    expect(master()).toBe(level);
  });

  it('con il suono spento prima dell\'accensione il contesto nasce muto', () => {
    const { audio, contexts, master } = setup();
    audio.setMuted(true);
    expect(contexts).toHaveLength(0);
    audio.powerOn();
    expect(contexts).toHaveLength(1);
    expect(master()).toBe(0);
    audio.setMuted(false);
    expect(master()).toBeGreaterThan(0);
  });

  it("all'accensione suona per primo l'interruttore registrato", async () => {
    const { audio, played } = setup();
    audio.powerOn();
    await flush();
    const first = played()[0];
    expect(first[0]).toBe('meccanica');
    expect(near(first[1], MECH.starts[0])).toBe(true);
  });

  it('reboot: interruttore che si spegne, poi che si riaccende', async () => {
    const { audio, played } = setup();
    audio.powerOn();
    await flush();
    const before = played().length;
    audio.reboot(0.4);
    await flush();
    const mech = played()
      .slice(before)
      .filter(([f]) => f === 'meccanica')
      .map(([, at]) => at);
    expect(near(mech[0], MECH.starts[1])).toBe(true);
    expect(near(mech[1], MECH.starts[0])).toBe(true);
  });

  it('press: niente prima dell\'accensione né da muto; acceso, pressione e rilascio del tasto', async () => {
    const { audio, contexts, played } = setup();
    audio.press();
    expect(contexts).toHaveLength(0);
    audio.powerOn();
    await flush();
    const before = played().length;
    audio.press();
    const keys = played()
      .slice(before)
      .map(([, at]) => at);
    expect(keys).toHaveLength(2);
    expect(near(keys[0], MECH.starts[2])).toBe(true);
    expect(near(keys[1], MECH.starts[3])).toBe(true);
    audio.setMuted(true);
    const muted = played().length;
    audio.press();
    expect(played().length).toBe(muted);
  });

  it('keyDown e keyUp: la pressione e il rilascio del tasto, ognuno quando arriva', async () => {
    const { audio, contexts, played } = setup();
    audio.keyDown();
    audio.keyUp();
    expect(contexts).toHaveLength(0);
    audio.powerOn();
    await flush();
    const keys = () =>
      played()
        .filter(([f]) => f === 'meccanica')
        .map(([, at]) => at);
    const before = keys().length;
    audio.keyDown();
    expect(keys().slice(before)).toHaveLength(1);
    expect(near(keys()[before], MECH.starts[2])).toBe(true);
    audio.keyUp();
    expect(keys().slice(before)).toHaveLength(2);
    expect(near(keys()[before + 1], MECH.starts[3])).toBe(true);
    audio.setMuted(true);
    const muted = played().length;
    audio.keyDown();
    audio.keyUp();
    expect(played().length).toBe(muted);
  });

  it('spegnendo il suono subito dopo il rilascio, il rilascio finisce di suonare', async () => {
    const { audio, contexts, master } = setup();
    audio.powerOn();
    await flush();
    const c = contexts[0];
    audio.keyDown();
    audio.keyUp();
    const g = c.nodes.find((n) => n.outputs.includes(c.destination)) as unknown as { gain: FakeParam };
    const spy = vi.spyOn(g.gain, 'setValueAtTime');
    audio.setMuted(true);
    // la rampa verso 0 parte dopo la fine del rilascio (0,12 s nel file finto)
    expect((spy.mock.calls[0] as unknown as number[])[1]).toBeGreaterThanOrEqual(c.currentTime + 0.12);
    expect(master()).toBe(0);
  });

  it('seek dice per quanti secondi lavora la testina: 0 se non suona', async () => {
    const { audio, contexts } = setup();
    expect(audio.seek(2)).toBe(0);
    audio.powerOn();
    await flush();
    // dopo la ricalibrazione dell'accensione, il disco è libero
    contexts[0].currentTime = 30;
    const s = audio.seek(2);
    // due movimenti: almeno due passi (0,08 s nel file finto) e le pause di lettura
    expect(s).toBeGreaterThan(0.16);
    expect(s).toBeLessThan(3);
    audio.setMuted(true);
    expect(audio.seek(2)).toBe(0);
  });

  it('seek: con il floppy caricato muove la testina con pezzi del floppy', async () => {
    const { audio, played } = setup();
    audio.powerOn();
    await flush();
    const before = played().filter(([f]) => f === 'floppy').length;
    audio.seek(3);
    const after = played().filter(([f]) => f === 'floppy').length;
    expect(after - before).toBeGreaterThanOrEqual(3);
  });

  it('senza registrazioni (rete giù) l\'ambiente parte lo stesso e seek non fa niente', async () => {
    const { audio, contexts, played } = setup('nessuno');
    audio.powerOn();
    await flush();
    expect(contexts[0].nodes.some((n) => n.kind === 'oscillator')).toBe(true);
    audio.seek(3);
    audio.press();
    expect(played()).toHaveLength(0);
  });

  it('suspend e resume chiamano il contesto; resume da muto non riprende', async () => {
    const { audio, contexts } = setup();
    audio.suspend();
    audio.resume();
    expect(contexts).toHaveLength(0);
    audio.powerOn();
    const c = contexts[0];
    audio.suspend();
    await flush();
    audio.resume();
    await flush();
    expect(c.calls).toEqual(['suspend', 'resume']);
    expect(c.state).toBe('running');
    audio.setMuted(true);
    audio.suspend();
    await flush();
    c.calls.length = 0;
    audio.resume();
    await flush();
    expect(c.calls).toEqual([]);
    expect(c.state).toBe('suspended');
  });

  it('muto durante l\'attesa dell\'interruttore: niente interruttore né transitori fuori tempo', async () => {
    const { audio, played } = setup();
    audio.powerOn();
    audio.setMuted(true);
    await flush();
    expect(played().filter(([f]) => f === 'meccanica')).toHaveLength(0);
  });

  it('suono riacceso mentre il contesto si sta ancora sospendendo: alla fine il contesto gira', async () => {
    const { audio, contexts } = setup();
    audio.setMuted(true);
    audio.powerOn(); // nasce muto: si sospende
    audio.setMuted(false); // ...ma la sospensione non è ancora finita
    await flush();
    await flush();
    expect(contexts[0].state).toBe('running');
  });

  it('spegnendo il suono il contesto si sospende solo dopo gli scatti già programmati', async () => {
    vi.useFakeTimers();
    try {
      const { audio, contexts } = setup();
      audio.powerOn();
      await vi.advanceTimersByTimeAsync(0);
      audio.seek(4); // movimenti della testina programmati nel prossimo secondo
      audio.setMuted(true);
      await vi.advanceTimersByTimeAsync(200);
      expect(contexts[0].calls).not.toContain('suspend');
      await vi.advanceTimersByTimeAsync(5000);
      expect(contexts[0].calls).toContain('suspend');
    } finally {
      vi.useRealTimers();
    }
  });

  it('un reboot mentre l\'interruttore si sta ancora caricando non lascia due tubi accesi', async () => {
    const { audio, tubes, releaseMech } = setup('meccanica lenta');
    audio.powerOn();
    audio.reboot(0.4);
    releaseMech();
    await flush();
    expect(tubes()).toBe(1);
  });

  it('un seek prima della ricalibrazione non avvia un secondo motore', async () => {
    const { audio, motors, releaseMech } = setup('meccanica lenta');
    audio.powerOn();
    await flush(); // floppy pronto, interruttore ancora in arrivo
    audio.seek(1);
    releaseMech();
    await flush();
    expect(motors()).toBe(1);
  });
  it('powerOff: scatto di spegnimento, ventola, ronzio e tubo fermi', async () => {
    const { audio, contexts, played, oscs, running } = setup();
    audio.powerOn();
    await flush();
    const before = played().filter(([f]) => f === 'meccanica').length;
    contexts[0].currentTime = 10;
    audio.powerOff();
    const mech = played()
      .filter(([f]) => f === 'meccanica')
      .slice(before);
    expect(mech).toHaveLength(1);
    expect(near(mech[0][1], MECH.starts[1])).toBe(true);
    expect(oscs().every((o) => o.stops.length > 0)).toBe(true);
    // la ventola rallenta: il fischio del motorino si ferma solo alla fine
    expect(running(WHINE_HZ, 10 + FAN_SPIN_DOWN - 0.5)).toEqual([true]);
  });

  it("powerOff due volte o prima dell'accensione non fa niente", async () => {
    const { audio, contexts, played } = setup();
    audio.powerOff();
    expect(contexts).toHaveLength(0);
    audio.powerOn();
    await flush();
    audio.powerOff();
    const n = played().filter(([f]) => f === 'meccanica').length;
    audio.powerOff();
    expect(played().filter(([f]) => f === 'meccanica')).toHaveLength(n);
  });

  it('riaccensione durante il rallentamento: una sola ventola', async () => {
    const { audio, contexts, mechPlays, running } = setup();
    audio.powerOn();
    await flush();
    contexts[0].currentTime = 10;
    audio.powerOff();
    contexts[0].currentTime = 11;
    const before = mechPlays().length;
    audio.powerOn();
    await flush();
    const on = mechPlays()
      .slice(before)
      .filter(([off]) => near(off, MECH.starts[0]));
    expect(on).toHaveLength(1);
    expect(running(WHINE_HZ, 11.2).filter(Boolean)).toHaveLength(1);
  });

  it('reboot: spegnimento e riaccensione a distanza offS, la ventola non si ferma', async () => {
    const { audio, contexts, mechPlays, oscs } = setup();
    audio.powerOn();
    await flush();
    contexts[0].currentTime = 10;
    const before = mechPlays().length;
    audio.reboot(1.7);
    const mech = mechPlays().slice(before);
    expect(mech).toHaveLength(2);
    expect(near(mech[0][0], MECH.starts[1]) && near(mech[0][1], 10.02)).toBe(true);
    expect(near(mech[1][0], MECH.starts[0]) && near(mech[1][1], 11.72)).toBe(true);
    expect(oscs().filter((o) => o.startHz === WHINE_HZ && o.stops.length > 0)).toHaveLength(0);
  });

  it('powerOn ad accensione avvenuta non fa il reboot', async () => {
    const { audio, played } = setup();
    audio.powerOn();
    await flush();
    const n = played().filter(([f]) => f === 'meccanica').length;
    audio.powerOn();
    await flush();
    expect(played().filter(([f]) => f === 'meccanica')).toHaveLength(n);
  });

  it("da muto lo spegnimento è muto ma ferma l'ambiente; riaccendere il suono non fa ripartire niente", async () => {
    const { audio, played, oscs } = setup();
    audio.powerOn();
    await flush();
    audio.setMuted(true);
    const n = played().filter(([f]) => f === 'meccanica').length;
    audio.powerOff();
    expect(played().filter(([f]) => f === 'meccanica')).toHaveLength(n);
    expect(oscs().filter((o) => o.startHz === WHINE_HZ).every((o) => o.stops.length > 0)).toBe(true);
    const count = oscs().length;
    audio.setMuted(false);
    await flush();
    expect(oscs()).toHaveLength(count);
  });

  it('da muto lo spegnimento ferma subito ventola, ronzio e tubo: riaccendendo il suono e premendo un tasto non riparte niente', async () => {
    const { audio, contexts, oscs } = setup();
    audio.powerOn();
    await flush();
    contexts[0].currentTime = 10;
    audio.setMuted(true);
    audio.powerOff();
    audio.setMuted(false);
    audio.press();
    await flush();
    // niente rallentamento programmato nel tempo fermo del contesto: tutto tace entro 0,1 s
    expect(oscs().filter((o) => o.startHz === WHINE_HZ).length).toBeGreaterThan(0);
    expect(oscs().every((o) => o.stops.length > 0 && o.stops[o.stops.length - 1] <= 10.1 + 1e-6)).toBe(true);
  });

  it('pagina nascosta durante il rallentamento: alla sospensione la ventola tace, un tasto dopo non la fa ripartire', async () => {
    vi.useFakeTimers();
    try {
      const { audio, contexts, oscs } = setup();
      audio.powerOn();
      await vi.advanceTimersByTimeAsync(0);
      const c = contexts[0];
      c.currentTime = 10;
      audio.powerOff();
      c.currentTime = 10.5;
      audio.suspend();
      await vi.advanceTimersByTimeAsync(0);
      expect(c.state).toBe('suspended');
      // il tempo del contesto resta fermo, il timer della sospensione scatta lo stesso
      await vi.advanceTimersByTimeAsync(6000);
      audio.resume();
      audio.press();
      await vi.advanceTimersByTimeAsync(0);
      expect(oscs().filter((o) => o.startHz === WHINE_HZ).length).toBeGreaterThan(0);
      expect(oscs().every((o) => o.stops.length > 0 && o.stops[o.stops.length - 1] <= 10.6 + 1e-6)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('powerOff ferma anche i movimenti della testina già programmati', async () => {
    const { audio, contexts } = setup();
    audio.powerOn();
    await flush();
    const c = contexts[0];
    c.currentTime = 0.5;
    audio.seek(4);
    audio.powerOff();
    type Src = { loop: boolean; starts: number[][]; stops: number[]; buffer: { getChannelData(): Float32Array } | null };
    const pieces = (c.nodes.filter((n) => n.kind === 'buffer') as unknown as Src[]).filter(
      (s) => !s.loop && s.starts.length > 0 && s.buffer?.getChannelData().byteLength === FLOPPY.data.byteLength,
    );
    expect(pieces.length).toBeGreaterThan(4);
    expect(pieces.every((s) => s.stops.length > 0 && s.stops[s.stops.length - 1] <= 0.6 + 1e-6)).toBe(true);
  });

  it('seek a monitor spento restituisce 0', async () => {
    const { audio, contexts } = setup();
    audio.powerOn();
    await flush();
    contexts[0].currentTime = 30;
    audio.powerOff();
    expect(audio.seek(2)).toBe(0);
  });

  it('spinUp dopo powerOff riaccende con la ventola che riparte', async () => {
    const { audio, contexts, mechPlays, running } = setup();
    audio.powerOn();
    await flush();
    contexts[0].currentTime = 10;
    audio.powerOff();
    contexts[0].currentTime = 12;
    const before = mechPlays().length;
    audio.spinUp();
    await flush();
    const on = mechPlays()
      .slice(before)
      .filter(([off]) => near(off, MECH.starts[0]));
    expect(on).toHaveLength(1);
    expect(running(WHINE_HZ, on[0][1] + 0.1).filter(Boolean)).toHaveLength(1);
  });
});
