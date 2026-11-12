import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cmdToUrl, homeBlocks, level0Html, promptCommand } from '../../src/lib/level0';
import { siteSchema } from '../../src/lib/schema';
import { BEZEL, OG_MARGIN, OG_W, RIM, barrel, cardLayout, letterbox, ogImage, openingDistance, pillarbox, songImage, textWidth } from '../../src/lib/cards';

describe('cmdToUrl', () => {
  it('traduce cat e cd in URL senza barra finale', () => {
    expect(cmdToUrl('cat /canzoni/2026-11-10')).toBe('/canzoni/2026-11-10');
    expect(cmdToUrl('cd /lettura && ls')).toBe('/lettura');
    expect(cmdToUrl('cd / && ls')).toBe('/');
    expect(cmdToUrl('help')).toBeNull();
  });
});

describe('level0Html', () => {
  it('esegue l\'escape e produce link e immagini', () => {
    const html = level0Html(
      [{ text: 'p $ ' }],
      [
        { type: 'line', spans: [{ text: 'A & <b>', style: 'bold' }, { text: ' x', cmd: 'cat /x' }, { text: 'y', href: 'https://e.it/?a=1&b=2' }] },
        { type: 'image', src: '/_img/a.png', alt: 'a "b"', width: 10, height: 5 },
      ],
    );
    expect(html).toContain('<span class="bold">A &amp; &lt;b&gt;</span>');
    expect(html).toContain('<a href="/x"> x</a>');
    expect(html).toContain('<a href="https://e.it/?a=1&amp;b=2" rel="noopener" target="_blank">y</a>');
    expect(html).toContain('<span class="ph-img"><img src="/_img/a.png" alt="a &quot;b&quot;"');
  });
  it('mailto: senza target _blank', () => {
    const html = level0Html([], [{ type: 'line', spans: [{ text: 'scrivimi', href: 'mailto:a@b.it' }] }]);
    expect(html).toContain('<a href="mailto:a@b.it">scrivimi</a>');
  });
  it('il comando mostrato dipende dal tipo di nodo', () => {
    expect(promptCommand('', true)).toBe('ls');
    expect(promptCommand('canzoni', true)).toBe('cd /canzoni && ls');
    expect(promptCommand('chi-sono', false)).toBe('cat /chi-sono');
  });
});

describe('immagini', () => {
  it('OG 1200x630 anche con titolo con & e <', async () => {
    const meta = await sharp(await ogImage({ title: 'Rock & <Roll> ' + 'lungo '.repeat(20), host: 'example.com' })).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, 'png']);
  });
  it('immagine canzone 640x360 con e senza miniatura', async () => {
    const thumb = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#789' } }).jpeg().toBuffer();
    const t = { title: 'T', subtitle: 'A', host: 'h' };
    for (const input of [thumb, null]) {
      const m = await sharp(await songImage(t, input)).metadata();
      expect([m.width, m.height]).toEqual([640, 360]);
    }
    const og = await sharp(await ogImage(t, thumb)).metadata();
    expect([og.width, og.height]).toEqual([1200, 630]);
  });
  // Miniatura 4:3 con bande nere sopra e sotto (come hqdefault di YouTube), contenuto grigio medio.
  const letterboxed = () =>
    sharp({ create: { width: 480, height: 270, channels: 3, background: '#888' } })
      .extend({ top: 45, bottom: 45, background: '#000' })
      .jpeg()
      .toBuffer();
  const rowMean = async (png: Buffer, y: number) => {
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let x = 0; x < info.width; x++) sum += data[(y * info.width + x) * info.channels];
    return sum / info.width;
  };
  it('anteprime opache, senza canale alfa', async () => {
    const t = { title: 'T', subtitle: 'A', host: 'h' };
    for (const png of [await ogImage(t), await ogImage(t, await letterboxed()), await songImage(t, null)]) {
      const m = await sharp(png).metadata();
      expect(m.hasAlpha).toBe(false);
      expect(m.channels).toBe(3);
    }
  });
  it('trova le bande nere della miniatura', async () => {
    const b = await letterbox(await letterboxed());
    expect(b.top).toBeGreaterThanOrEqual(45);
    expect(b.top).toBeLessThanOrEqual(50);
    expect(b.bottom).toBeGreaterThanOrEqual(45);
    expect(b.bottom).toBeLessThanOrEqual(50);
    const plain = await sharp({ create: { width: 480, height: 270, channels: 3, background: '#888' } }).jpeg().toBuffer();
    expect(await letterbox(plain)).toMatchObject({ top: 0, bottom: 0 });
  });
  it('trova le bande laterali grigie della miniatura (copertina quadrata nel video 16:9)', async () => {
    // contenuto a righe orizzontali: ogni colonna varia dall'alto in basso, a differenza delle bande
    const stripes = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><rect width="720" height="720" fill="#eee"/>` +
        Array.from({ length: 36 }, (_, i) => `<rect x="0" y="${i * 20}" width="720" height="6" fill="#333"/>`).join('') +
        `</svg>`,
    );
    const thumb = await sharp(stripes).extend({ left: 280, right: 280, background: '#404040' }).jpeg().toBuffer();
    const b = await pillarbox(thumb);
    expect(b.left).toBeGreaterThanOrEqual(280);
    expect(b.left).toBeLessThanOrEqual(295);
    expect(b.right).toBeGreaterThanOrEqual(280);
    expect(b.right).toBeLessThanOrEqual(295);
    const plain = await sharp(stripes).resize(1280, 720, { fit: 'fill' }).jpeg().toBuffer();
    expect(await pillarbox(plain)).toMatchObject({ left: 0, right: 0 });
  });
  // media di una riga solo nella parte centrale, dentro il tubo (la curvatura scurisce i bordi)
  const rowMeanInside = async (png: Buffer, y: number) => {
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let x = 300; x < 900; x++) sum += data[(y * info.width + x) * info.channels];
    return sum / 600;
  };
  it('il fotogramma riempie la scheda: niente bande nere in alto e in basso', async () => {
    const thumb = await letterboxed();
    const og = await ogImage({ title: 'T', subtitle: 'A', host: 'h' }, thumb);
    // le prime righe del vetro, sotto la cornice e la sua ombra, sono fotogramma e non letterbox
    for (const y of [66, 72, 80, 315]) expect(await rowMeanInside(og, y)).toBeGreaterThan(40);
    const frame = await songImage({ title: 'T', host: 'h' }, thumb);
    for (const y of [0, 1, 358, 359]) expect(await rowMean(frame, y)).toBeGreaterThan(40);
  });
  // plastica della cornice: grigio caldo (r >= g >= b), nella gamma di luminosità della plastica e del labbro
  const lums = [BEZEL.top, BEZEL.bottom, BEZEL.lip].map(([r, g, b]) => (r + g + b) / 3);
  const isPlastic = ([r, g, b]: number[]) =>
    r >= g - 1 && g >= b - 1 && (r + g + b) / 3 >= Math.min(...lums) * 0.6 && (r + g + b) / 3 <= Math.max(...lums) * 1.15;
  const isGreen = ([r, g, b]: number[]) => g > r + 4 && g > b;
  it('effetti CRT: opache, stessi byte; angoli di plastica, centro nel vetro, nessun filo verde', async () => {
    const t = { title: 'Perché più città', subtitle: 'A', host: 'h' };
    const thumb = await letterboxed();
    for (const make of [() => ogImage(t, null, 'x/y'), () => ogImage(t, thumb, 'canzoni/z')]) {
      const a = await make();
      expect(Buffer.compare(a, await make())).toBe(0);
      const m = await sharp(a).metadata();
      expect([m.width, m.height, m.hasAlpha]).toEqual([1200, 630, false]);
      const { data, info } = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([1200, 630, 3]);
      const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
      // angoli e fasce della cornice: plastica, non più il nero del tubo
      for (const [x, y] of [[0, 0], [1199, 0], [0, 629], [1199, 629], [5, 5], [40, 40], [1160, 590], [20, 315], [600, 20], [600, 610]]) {
        expect(isPlastic(px(x, y)), `(${x},${y}) = ${px(x, y)}`).toBe(true);
      }
      // dove c'era il filo verde del vetro (rettangolo a 22 px dal bordo) ora c'è plastica
      for (const [x, y] of [[300, 22], [600, 22], [900, 22], [22, 200], [22, 430], [1177, 315], [600, 607], [300, 607]]) {
        const p = px(x, y);
        expect(isGreen(p), `(${x},${y}) = ${p}`).toBe(false);
        expect(isPlastic(p), `(${x},${y}) = ${p}`).toBe(true);
      }
      // il centro è dentro l'apertura: vetro a fosfori, verde
      expect(isGreen(px(600, 315)), `centro = ${px(600, 315)}`).toBe(true);
    }
    // il seme cambia la grana
    expect(Buffer.compare(await ogImage(t, null, 'a'), await ogImage(t, null, 'b'))).not.toBe(0);
  });
  it('apertura: il centro è dentro, gli angoli della scheda fuori', () => {
    expect(openingDistance(600, 315)).toBeLessThan(-250);
    for (const [x, y] of [[0, 0], [1199, 0], [0, 629], [1199, 629]]) expect(openingDistance(x, y)).toBeGreaterThan(0);
  });
  it('curvatura: il centro resta fermo, gli angoli vanno verso l\'esterno', () => {
    expect(barrel(0, 0)).toEqual([0, 0]);
    const [u, v] = barrel(1, 1);
    expect(u).toBeGreaterThan(1);
    expect(v).toBeGreaterThan(1);
    const [a, b] = barrel(-0.5, 0.25);
    expect(a).toBeLessThan(-0.5);
    expect(b).toBeGreaterThan(0.25);
    expect(barrel(0.5, 0)[1]).toBe(0);
  });
  it('titolo lungo: al massimo 2 righe, ellissi, dentro i margini e dentro il vetro', () => {
    const title = 'Perché più città sognano ancora: un titolo lunghissimo con accenti che non ci sta';
    for (const withFrame of [false, true]) {
      const lines = cardLayout({ title, subtitle: 'Artista '.repeat(10), host: 'example.com' }, withFrame);
      const titleLines = lines.filter((l) => l.size === 64);
      expect(titleLines).toHaveLength(2);
      expect(titleLines[1].text.endsWith('…')).toBe(true);
      for (const l of lines) {
        expect(l.x).toBeGreaterThanOrEqual(OG_MARGIN);
        expect(l.x + textWidth(l.text, l.size, l.weight)).toBeLessThanOrEqual(OG_W - OG_MARGIN);
        expect(l.y).toBeLessThan(630 - 40);
        // il riquadro della riga (dalla cima delle maiuscole alle discendenti) sta nel vetro,
        // lontano dall'incavo e dall'ombra interna
        const right = l.x + textWidth(l.text, l.size, l.weight);
        for (const [x, y] of [[l.x, l.y - l.size * 0.8], [right, l.y - l.size * 0.8], [l.x, l.y + l.size * 0.25], [right, l.y + l.size * 0.25]]) {
          expect(openingDistance(x, y)).toBeLessThan(-3 * RIM);
        }
      }
    }
  });
});

describe('homeBlocks', () => {
  const rest = [{ type: 'line' as const, spans: [{ text: 'x' }] }];
  it('usa welcomeStatic come riga di benvenuto', () => {
    const b = homeBlocks({ welcomeStatic: 'Clicca un nome.' }, rest);
    expect(b[0]).toEqual({ type: 'line', spans: [{ text: 'Clicca un nome.' }] });
    expect(b[1]).toEqual({ type: 'blank' });
    expect(b.slice(2)).toEqual(rest);
  });
  it('senza welcomeStatic non mostra nessun benvenuto', () => {
    expect(homeBlocks({}, rest)).toEqual(rest);
  });
});

describe('siteSchema boot.welcomeStatic', () => {
  const base = { host: 'h', user: 'u', links: [], boot: { rom: [], welcome: 'w', welcomeTouch: 'wt' } };
  it('accetta il campo presente o assente', () => {
    expect(siteSchema.safeParse(base).success).toBe(true);
    expect(siteSchema.safeParse({ ...base, boot: { ...base.boot, welcomeStatic: 's' } }).success).toBe(true);
  });
});
