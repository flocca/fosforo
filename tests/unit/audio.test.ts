import { describe, expect, it } from 'vitest';
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
    return this.add(
      Object.assign(new FakeNode('oscillator'), {
        type: 'sine',
        frequency: new FakeParam(440),
        detune: new FakeParam(0),
        start() {},
        stop() {},
      }),
    );
  }
  createBufferSource() {
    return this.add(
      Object.assign(new FakeNode('buffer'), {
        buffer: null as unknown,
        loop: false,
        playbackRate: new FakeParam(1),
        start() {},
        stop() {},
      }),
    );
  }
  createBiquadFilter() {
    return this.add(
      Object.assign(new FakeNode('filter'), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1), gain: new FakeParam(0) }),
    );
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  suspend() {
    this.calls.push('suspend');
    this.state = 'suspended';
    return Promise.resolve();
  }
  resume() {
    this.calls.push('resume');
    this.state = 'running';
    return Promise.resolve();
  }
}

function setup() {
  const contexts: FakeContext[] = [];
  const audio = createAudio(() => {
    const c = new FakeContext();
    contexts.push(c);
    return c as unknown as AudioContext;
  });
  // il guadagno principale è l'unico collegato all'uscita
  const master = () => {
    const c = contexts[0];
    const g = c.nodes.find((n) => n.outputs.includes(c.destination)) as unknown as { gain: FakeParam };
    return g.gain.value;
  };
  return { audio, contexts, master };
}

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

  it('seek prima dell\'accensione non crea niente; dopo crea i clic della testina', () => {
    const { audio, contexts } = setup();
    audio.seek(3);
    expect(contexts).toHaveLength(0);
    audio.powerOn();
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

  it('suspend e resume chiamano il contesto; resume da muto non riprende', () => {
    const { audio, contexts } = setup();
    audio.suspend();
    audio.resume();
    expect(contexts).toHaveLength(0);
    audio.powerOn();
    const c = contexts[0];
    audio.suspend();
    audio.resume();
    expect(c.calls).toEqual(['suspend', 'resume']);
    audio.setMuted(true);
    audio.suspend();
    c.calls.length = 0;
    audio.resume();
    expect(c.calls).toEqual([]);
    expect(c.state).toBe('suspended');
  });
});
